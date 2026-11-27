# x64dbg MCP Server

[![npm version](https://img.shields.io/npm/v/x64dbg-mcp-server)](https://www.npmjs.com/package/x64dbg-mcp-server)
[![MCP Registry](https://img.shields.io/badge/MCP-registry-blue)](https://registry.modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Drive [x64dbg](https://x64dbg.com/) with your AI.** Talk to Claude, Cursor, Windsurf, Cline,
or any MCP client in plain English and it sets breakpoints, reads memory, disassembles, traces,
dumps PEs, and bypasses anti-debug — live, inside the debugger.

**23 mega-tools** over **153 REST endpoints**, fully typed with Zod. A C++ plugin runs inside
x64dbg; a tiny TypeScript server bridges it to your client over stdio. Everything stays on
`127.0.0.1` — nothing leaves your machine.

> **Latest — v2.3.0**
> - **Hardened & crash-proof.** A malformed HTTP request can no longer crash x64dbg; the plugin
>   server drains connections cleanly on stop and ships an **optional auth token** (CORS is
>   locked down).
> - **Real data from more tools.** `imports`/`exports`, `symbols` search/list, `patches` list,
>   and `strings` now return actual parsed results instead of pointing you at a GUI view.
> - **Live trace status.** New `/api/trace/status` (+ `tracing status`) reports whether a trace
>   is running, and the exception/trace tools now honor every parameter they accept.

## LM Studio: flat tool profile

For local models that struggle with nested action schemas, start the server with
`X64DBG_MCP_TOOL_PROFILE=lm-studio`. This exposes separate tools such as
`x64dbg_memory_read`, `x64dbg_registers_get_all`, and `x64dbg_breakpoints_list`
instead of requiring an `action` selector. The default full profile remains unchanged.
See [docs/LM_STUDIO.md](docs/LM_STUDIO.md) for setup instructions.

## Install

### 1 · Plugin (inside x64dbg)

**Download** `x64dbg_mcp.dp64` / `.dp32` from the
[latest release](https://github.com/bromoket/x64dbg_mcp/releases/latest) and drop them in:

```
x64dbg/x64/plugins/x64dbg_mcp.dp64
x64dbg/x32/plugins/x64dbg_mcp.dp32
```

### 2 · Server (your AI client)

Configure your MCP client to launch `npx -y x64dbg-mcp-server`. For the flat LM Studio
profile, also set `X64DBG_MCP_TOOL_PROFILE=lm-studio` in the server process environment.

## Links

- [Full tool reference](docs/REFERENCE.md)
- [LM Studio setup](docs/LM_STUDIO.md)
- [npm package](https://www.npmjs.com/package/x64dbg-mcp-server)
- [Releases](https://github.com/bromoket/x64dbg_mcp/releases)
- [x64dbg](https://x64dbg.com/)

## Security

The plugin binds to `127.0.0.1` by default. Do not expose the debugger HTTP interface
to an untrusted network. Set `X64DBG_MCP_TOKEN` if plugin authentication is enabled.

## License

MIT
