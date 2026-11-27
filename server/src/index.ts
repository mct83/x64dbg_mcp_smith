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

  // Select a shallow, one-purpose-tool schema profile for local models.
  // Default behavior remains the original full action-based tool collection.
  const toolProfile = (process.env.X64DBG_MCP_TOOL_PROFILE ?? 'full').toLowerCase();
  if (toolProfile === 'lm-studio' || toolProfile === 'flat') {
    registerLmStudioProfile(server);
    console.error('[x64dbg-mcp] Registered LM Studio profile (30 flat tools)');
  } else {
    registerAllTools(server);
    console.error('[x64dbg-mcp] Registered full profile (23 action-based tools)');
  }

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
