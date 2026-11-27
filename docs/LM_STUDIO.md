# LM Studio setup and tool-calling notes

This project exposes x64dbg through an MCP server over standard input/output (stdio).
The MCP server does not connect to a model directly: LM Studio (or another MCP client)
loads the server and forwards tool calls to it.

## Basic connection

Build the TypeScript server from the `server` directory:

```powershell
npm install
npm run build
```

For an MCP client that supports launching stdio servers with `cmd`, the server entry
can be configured as:

```json
{
  "mcpServers": {
    "x64dbg": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "x64dbg-mcp-server"]
    }
  }
}
```

If you are using a local checkout instead of the published npm package, point the
command to Node.js and the built `server/dist/index.js` file. Use an absolute path
when the client does not inherit the expected working directory.

## Improving tool-call reliability

- Use an instruction-tuned model that explicitly supports tool/function calling in
  LM Studio. A model that only generates ordinary text may describe a tool call
  without emitting a valid MCP tool invocation.
- Enable the client's tool/MCP integration for the conversation and make sure the
  x64dbg server is shown as connected before asking it to operate the debugger.
- Start with one narrow request, for example: "Read all CPU registers" or
  "Show the current debugger state". Avoid asking the model to perform a long
  multi-step debugging task until a simple read-only tool call works.
- When a tool requires an `action`, provide the action explicitly. For example:
  "Use x64dbg_registers with action get_all" or
  "Use x64dbg_breakpoints with action list".
- Required arguments must be supplied using the exact names shown by the MCP
  client. Addresses and byte patterns are strings; booleans and numeric limits
  must remain their declared JSON types.
- If the model repeatedly emits malformed arguments, try another tool-calling
  model or a smaller, more explicit prompt. Do not weaken parameter validation
  just to make malformed calls pass: invalid debugger arguments can modify the
  debuggee or its memory.

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

## Known limitation

MCP schema support and tool-calling quality vary between LM Studio versions and
local models. The tools in this project use an `action` discriminator with
action-specific parameters. This is valid structured input, but some models may
struggle with nested or union-shaped tool schemas. This documentation does not
claim compatibility with every model. If calls still fail, capture the exact
tool name, generated arguments, LM Studio version, and model name so the schema
or prompt can be reviewed without guessing.
