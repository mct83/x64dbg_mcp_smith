#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { httpClient } from './http_client.js';
import { registerAllTools, registerLmStudioProfile } from './tools/index.js';

function getVersion(): string {
  try {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main() {
  const server = new McpServer({
    name: 'x64dbg',
    version: getVersion(),
  });

  // Read the selected profile from the x64dbg plugin. This small discovery
  // endpoint contains no secret and can be queried before MCP registration.
  let discoveredProfile: string | undefined;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(`http://${config.host}:${config.port}/api/config/tool-profile`, { signal: controller.signal });
      if (response.ok) {
        const envelope = await response.json() as { success?: boolean; data?: { tool_profile?: string } };
        if (envelope.success && typeof envelope.data?.tool_profile === 'string') discoveredProfile = envelope.data.tool_profile;
      }
    } finally { clearTimeout(timeout); }
  } catch { /* Plugin may not be running yet; use the fallback below. */ }

  // x64dbg setting wins; env var remains a fallback for older/headless setups.
  const toolProfile = (discoveredProfile ?? process.env.X64DBG_MCP_TOOL_PROFILE ?? 'full').toLowerCase();
  if (toolProfile === 'lm-studio' || toolProfile === 'flat') {
    registerLmStudioProfile(server);
    console.error('[x64dbg-mcp] Registered LM Studio profile (30 flat tools)');
  } else {
    registerAllTools(server);
    console.error('[x64dbg-mcp] Registered full profile (23 action-based tools)');
  }

  console.error(`[x64dbg-mcp] Tool profile source: ${discoveredProfile ? "x64dbg plugin settings" : "environment/default"}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[x64dbg-mcp] Server started, plugin expected at ${config.host}:${config.port}`);
  const timeout_desc = config.timeout > 0 ? `${config.timeout}ms` : 'none (waits indefinitely)';
  console.error(`[x64dbg-mcp] Timeout: ${timeout_desc}, Retries: ${config.retries}`);

  const cleanup = () => {
    httpClient.destroy();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('[x64dbg-mcp] Fatal error:', err);
  process.exit(1);
});
