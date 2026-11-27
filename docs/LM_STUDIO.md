# LM Studio setup and tool-calling notes

This project exposes x64dbg through an MCP server over standard input/output (stdio).
The MCP server does not connect to a model directly: LM Studio (or another MCP client)
loads the server and forwards tool calls to it.

## Recommended: use the flat LM Studio tool profile

Some local models have difficulty selecting an `action` inside a nested
`z.discriminatedUnion` schema. The server therefore provides a dedicated profile
where common operations are separate tools with shallow parameter objects.

Set this environment variable for the MCP server process:

```text
X64DBG_MCP_TOOL_PROFILE=lm-studio
```

The profile registers separate tools such as:

- `x64dbg_debug_state`, `x64dbg_debug_run`, `x64dbg_debug_pause`,
  `x64dbg_debug_step_into`, `x64dbg_debug_step_over`, `x64dbg_debug_step_out`
- `x64dbg_registers_get_all`, `x64dbg_registers_get`, `x64dbg_registers_set`
- `x64dbg_memory_read`, `x64dbg_memory_write`, `x64dbg_memory_page_info`,
  `x64dbg_memory_map`, `x64dbg_memory_allocate`
- `x64dbg_breakpoints_list`, `x64dbg_breakpoints_get`,
  `x64dbg_breakpoint_set_software`, `x64dbg_breakpoint_set_hardware`,
  `x64dbg_breakpoint_enable`, `x64dbg_breakpoint_disable`, `x64dbg_breakpoint_delete`
- `x64dbg_disassemble`, `x64dbg_disassemble_function`, `x64dbg_assemble`
- `x64dbg_command_execute`, `x64dbg_evaluate`, `x64dbg_search_pattern`

This profile intentionally focuses on common debugger workflows and exposes 30
individual tools. The original full collection remains available and is still the
default. Set `X64DBG_MCP_TOOL_PROFILE=full` or omit the variable to use it.

### Windows example

When starting the server through a Windows MCP client, add the environment
variable to that server's process environment. For example, a wrapper batch file:

```bat
@echo off
set X64DBG_MCP_TOOL_PROFILE=lm-studio
npx -y x64dbg-mcp-server
```

Configure the MCP client to launch that batch file, or set the variable in the
environment from which the client is started. Restart the MCP server after
changing the profile; the available tool list is negotiated when the MCP session
starts.

## Basic connection

Build the TypeScript server from the `server` directory:

```powershell
npm install
npm run build
```

For an MCP client that supports launching stdio servers with `cmd`, the server
entry can be configured as:

```json
{
  "mcpServers": {
    "x64dbg": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "x64dbg-mcp-server"],
      "env": {
        "X64DBG_MCP_TOOL_PROFILE": "lm-studio"
      }
    }
  }
}
```

If the client does not support an `env` property, use a small wrapper batch file
as shown above. If you are using a local checkout, point the command to Node.js
and the built `server/dist/index.js` file.

## Tool-calling guidance

- Use an instruction-tuned model that explicitly supports tool/function calling.
- Enable MCP tools in the conversation and confirm the x64dbg server is connected.
- Start with a read-only request such as "Read all CPU registers".
- Ask for one debugger operation at a time until the model reliably selects tools.
- Use exact addresses, register names, and byte patterns where possible.
- Treat memory writes, register changes, assembly, and breakpoint operations as
  state-changing actions; review the arguments before allowing execution.

## Connection and timeout behavior

The TypeScript bridge waits up to two minutes for the x64dbg plugin to become
reachable. Long-running debugger operations are controlled by `X64DBG_MCP_TIMEOUT`.
Set it to a sufficiently large number of milliseconds, or to `0` to disable the
request timeout. A timeout does not automatically retry the operation because
repeating a memory write, patch, or breakpoint change could apply the side effect
twice.

The plugin listens on localhost by default. Keep it bound to `127.0.0.1`; do not
expose the debugger HTTP interface to an untrusted network. If authentication is
enabled in the plugin settings, configure the same token as `X64DBG_MCP_TOKEN`
for the MCP server process.

## Compatibility note

The flat profile reduces schema complexity; it cannot guarantee tool calling for
every model or LM Studio version. If calls still fail, record the exact tool name,
arguments, LM Studio version, and model name. Do not remove parameter validation
just to make malformed calls pass.
