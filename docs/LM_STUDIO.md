# LM Studio setup and tool-calling notes

The x64dbg plugin owns the tool-profile selection. In x64dbg open **Plugins → x64dbg MCP Server → Settings...** and choose **LM Studio** in the **Tools** dropdown. Save the settings, then restart the MCP server process in LM Studio so the new tool list is negotiated.

The plugin exposes a read-only `GET /api/config/tool-profile` endpoint containing only the selected profile. The TypeScript MCP bridge reads it during startup. This endpoint exposes no secrets and is exempt from plugin authentication for profile discovery. The normal debugger API remains protected by the configured token.

## Available profiles

- **Full** — original action-based tool collection; this remains the default.
- **LM Studio** — 30 separate tools with shallow parameter schemas, designed for local models that struggle with nested action selectors.

If the plugin is not running when the MCP server starts, it falls back to `X64DBG_MCP_TOOL_PROFILE` if set, otherwise **Full**. Restart the MCP server after changing the dropdown; changing the profile does not require restarting the x64dbg HTTP server.

## Basic connection

Build the TypeScript server from the `server` directory with `npm install` and `npm run build`. Configure your MCP client to launch `npx -y x64dbg-mcp-server` (or your local built `dist/index.js`). No wrapper batch file or profile environment variable is needed when the plugin is available.

If authentication is enabled in the plugin settings, configure the same token as `X64DBG_MCP_TOKEN` in the MCP server process. Profile discovery does not require the token; debugger operations still do.

## Tool-calling guidance

- Use an instruction-tuned model that explicitly supports tool/function calling.
- Enable MCP tools in the conversation and confirm the x64dbg server is connected.
- Start with a read-only request such as "Read all CPU registers".
- Use exact addresses, register names, and byte patterns where possible.
- Review state-changing operations such as memory writes, register changes, assembly, and breakpoint operations before execution.

## Connection and timeout behavior

The TypeScript bridge waits up to two minutes for the x64dbg plugin to become reachable. Long-running debugger operations are controlled by `X64DBG_MCP_TIMEOUT`; set it to a sufficiently large number of milliseconds, or `0` to disable the request timeout. The plugin listens on localhost by default. Do not expose the debugger HTTP interface to an untrusted network.
