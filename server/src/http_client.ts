import { config, getBaseUrl } from './config.js';

interface PluginResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
  };
}

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

const WAIT_FOR_PLUGIN_TIMEOUT_MS = 120_000;
const WAIT_POLL_INTERVAL_MS = 2_000;

export class HttpClient {
  private base_url: string;
  private state: ConnectionState = 'disconnected';
  private last_successful_request = 0;
  private consecutive_failures = 0;
  private health_check_interval: ReturnType<typeof setInterval> | null = null;

  // Share one reconnect loop between concurrent tool calls. Without this,
  // every incoming MCP call can start its own two-minute polling loop.
  private connection_wait: Promise<void> | null = null;

  constructor() {
    this.base_url = getBaseUrl();
    this.start_health_monitor();
  }

  get connection_state(): ConnectionState {
    return this.state;
  }

  private auth_headers(): Record<string, string> {
    return config.token ? { Authorization: `Bearer ${config.token}` } : {};
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.base_url);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    return this.request<T>(url.toString(), { method: 'GET', headers: this.auth_headers() });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.base_url);
    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth_headers() },
    };

    if (body !== undefined) options.body = JSON.stringify(body);
    return this.request<T>(url.toString(), options);
  }

  destroy() {
    if (this.health_check_interval) {
      clearInterval(this.health_check_interval);
      this.health_check_interval = null;
    }
  }

  private start_health_monitor() {
    this.health_check_interval = setInterval(() => {
      // A failed health check must never become an unhandled rejection.
      void this.check_health().catch(() => {});
    }, 15_000);

    void this.check_health().catch(() => {});
  }

  private async check_health(): Promise<boolean> {
    const controller = new AbortController();
    const timeout_id = setTimeout(() => controller.abort(), 3_000);

    try {
      const response = await fetch(`${this.base_url}/api/health`, {
        method: 'GET',
        headers: this.auth_headers(),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (this.state === 'connected') {
          console.error(`[x64dbg-mcp] Health check returned HTTP ${response.status}`);
        }
        this.state = 'disconnected';
        return false;
      }

      const was_disconnected = this.state !== 'connected';
      this.state = 'connected';
      this.consecutive_failures = 0;

      if (was_disconnected) {
        console.error(`[x64dbg-mcp] Plugin connection established at ${this.base_url}`);
      }
      return true;
    } catch {
      if (this.state === 'connected') {
        console.error('[x64dbg-mcp] Plugin connection lost, will reconnect automatically');
      }
      this.state = 'disconnected';
      return false;
    } finally {
      // Also clear the timer when fetch rejects or is aborted.
      clearTimeout(timeout_id);
    }
  }

  /**
   * Wait for x64dbg to become reachable. Concurrent callers share the same
   * wait promise, avoiding a burst of duplicate health checks.
   */
  private async wait_for_connection(): Promise<void> {
    if (this.state === 'connected') return;

    if (!this.connection_wait) {
      const wait = this.wait_for_connection_impl();
      this.connection_wait = wait;
      try {
        await wait;
      } finally {
        if (this.connection_wait === wait) this.connection_wait = null;
      }
      return;
    }

    await this.connection_wait;
  }

  private async wait_for_connection_impl(): Promise<void> {
    if (await this.check_health()) return;

    this.state = 'reconnecting';
    console.error(
      `[x64dbg-mcp] Plugin not reachable at ${this.base_url}, waiting up to ${WAIT_FOR_PLUGIN_TIMEOUT_MS / 1000}s for it to come online...`
    );

    const started_at = Date.now();
    const deadline = started_at + WAIT_FOR_PLUGIN_TIMEOUT_MS;
    let poll_count = 0;

    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
      poll_count++;

      if (await this.check_health()) {
        console.error(`[x64dbg-mcp] Plugin came online after ~${Math.round((Date.now() - started_at) / 1000)}s`);
        return;
      }

      if (poll_count % 5 === 0) {
        const elapsed = Math.round((Date.now() - started_at) / 1000);
        const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        console.error(`[x64dbg-mcp] Still waiting for plugin... (${elapsed}s elapsed, ${remaining}s remaining)`);
      }
    }

    this.state = 'disconnected';
    throw new Error(
      `x64dbg plugin did not come online at ${this.base_url} within ${WAIT_FOR_PLUGIN_TIMEOUT_MS / 1000}s. ` +
      `Make sure x64dbg is running with the MCP plugin loaded. ` +
      `Check with 'mcpserver status' in x64dbg command bar.`
    );
  }

  private is_connection_error(err: Error): boolean {
    const cause = (err as Error & { cause?: unknown }).cause;
    const message = [err.message, cause instanceof Error ? cause.message : String(cause ?? '')]
      .join(' ')
      .toLowerCase();

    return (
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('epipe') ||
      message.includes('enotfound') ||
      message.includes('enetunreach') ||
      message.includes('ehostunreach') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed') ||
      message.includes('network') ||
      message.includes('econnaborted') ||
      message.includes('etimedout')
    );
  }

  private async request<T>(url: string, options: RequestInit): Promise<T> {
    await this.wait_for_connection();

    let last_error: Error | null = null;

    for (let attempt = 0; attempt <= config.retries; attempt++) {
      const controller = new AbortController();
      const timeout_id = config.timeout > 0
        ? setTimeout(() => controller.abort(), config.timeout)
        : null;

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        // Keep the timeout active while reading the body, not just until
        // response headers arrive. This prevents a stalled body read hanging.
        const response_text = await response.text();

        let parsed: PluginResponse<T>;
        try {
          parsed = JSON.parse(response_text) as PluginResponse<T>;
        } catch {
          if (!response.ok) {
            throw new Error(`HTTP response error (${response.status} ${response.statusText}): ${response_text.substring(0, 200)}`);
          }
          throw new Error(`Invalid JSON response from plugin: ${response_text.substring(0, 200)}`);
        }

        if (!parsed || typeof parsed !== 'object' || typeof parsed.success !== 'boolean') {
          throw new Error('Invalid plugin response: expected a JSON object with a boolean "success" field');
        }

        if (!response.ok) {
          const detail = parsed.error?.message ?? response.statusText ?? 'Unknown HTTP error';
          throw new Error(`HTTP response error (${response.status}): ${detail}`);
        }

        if (!parsed.success) {
          const err_msg = parsed.error?.message ?? 'Unknown plugin error';
          const err_code = parsed.error?.code ?? 500;
          throw new Error(`Plugin error (${err_code}): ${err_msg}`);
        }

        this.state = 'connected';
        this.consecutive_failures = 0;
        this.last_successful_request = Date.now();
        return parsed.data as T;
      } catch (err) {
        last_error = err instanceof Error ? err : new Error(String(err));

        // The plugin returned a definite response. Do not repeat operations
        // such as memory writes or breakpoint changes.
        if (
          last_error.message.startsWith('Plugin error (') ||
          last_error.message.startsWith('HTTP response error (') ||
          last_error.message.startsWith('Invalid JSON response') ||
          last_error.message.startsWith('Invalid plugin response:')
        ) {
          this.state = 'connected';
          throw last_error;
        }

        if (last_error.name === 'AbortError') {
          this.consecutive_failures++;
          throw new Error(
            `Request aborted after ${config.timeout}ms (X64DBG_MCP_TIMEOUT). The plugin may be ` +
            `busy with a long operation (run, trace, step-over-call). Raise the limit with ` +
            `X64DBG_MCP_TIMEOUT=<ms>, or set X64DBG_MCP_TIMEOUT=0 to wait indefinitely.`
          );
        }

        if (this.is_connection_error(last_error)) {
          this.consecutive_failures++;
          this.state = 'reconnecting';
          console.error(`[x64dbg-mcp] Connection error on attempt ${attempt + 1}: ${last_error.message}`);

          if (attempt < config.retries) {
            console.error('[x64dbg-mcp] Waiting for plugin to come back...');
            try {
              await this.wait_for_connection();
              continue;
            } catch {
              throw last_error;
            }
          }

          this.state = 'disconnected';
          throw new Error(
            `Lost connection to x64dbg plugin at ${this.base_url}. ` +
            `The plugin may have been stopped or x64dbg was closed.`
          );
        }

        if (attempt < config.retries) {
          await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        }
      } finally {
        if (timeout_id) clearTimeout(timeout_id);
      }
    }

    throw last_error ?? new Error('Request failed');
  }
}

export const httpClient = new HttpClient();
