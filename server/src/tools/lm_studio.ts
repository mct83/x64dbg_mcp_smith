/**
 * Flat MCP tool profile for local models with limited support for nested
 * discriminated-union input schemas (for example, some LM Studio models).
 *
 * Every tool has one purpose and a shallow parameter object. The original
 * action-based tools remain available through the default profile.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { httpClient } from '../http_client.js';

function result(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerLmStudioTools(server: McpServer) {
  // Debugger control: each operation is its own tool, so the model does not
  // have to choose an "action" field before it can provide parameters.
  server.tool('x64dbg_debug_state', 'Read the current x64dbg debugger state. Read-only.', {},
    async () => result(await httpClient.get('/api/debug/state')));

  server.tool('x64dbg_debug_run', 'Resume execution of the debugged process.',
    {}, async () => result(await httpClient.post('/api/debug/run')));

  server.tool('x64dbg_debug_pause', 'Pause execution of the debugged process.',
    {}, async () => result(await httpClient.post('/api/debug/pause')));

  server.tool('x64dbg_debug_step_into', 'Execute one step into instruction.',
    {}, async () => result(await httpClient.post('/api/debug/step_into')));

  server.tool('x64dbg_debug_step_over', 'Execute one step over instruction.',
    {}, async () => result(await httpClient.post('/api/debug/step_over')));

  server.tool('x64dbg_debug_step_out', 'Run until the current function returns.',
    {}, async () => result(await httpClient.post('/api/debug/step_out')));

  server.tool('x64dbg_debug_stop', 'Stop the current debugging session.',
    {}, async () => result(await httpClient.post('/api/debug/stop')));

  server.tool('x64dbg_debug_run_to_address', 'Run until the debugger reaches the specified address.',
    { address: z.string().describe("Target address or x64dbg expression, for example '401000' or 'cip+20'.") },
    async ({ address }) => result(await httpClient.post('/api/debug/run_to', { address })));

  // CPU registers.
  server.tool('x64dbg_registers_get_all', 'Read all general-purpose CPU registers.',
    {}, async () => result(await httpClient.get('/api/registers/all')));

  server.tool('x64dbg_registers_get_flags', 'Read CPU flags.',
    {}, async () => result(await httpClient.get('/api/registers/flags')));

  server.tool('x64dbg_registers_get', 'Read one CPU register by name.',
    { name: z.string().describe("Register name, for example 'rax', 'rip', 'eip' or 'dr0'.") },
    async ({ name }) => result(await httpClient.get('/api/registers/get', { name })));

  server.tool('x64dbg_registers_set', 'Set one CPU register. This changes the debugged process state.',
    {
      name: z.string().describe("Register name, for example 'rax' or 'rip'."),
      value: z.string().describe("New value as a hexadecimal number or x64dbg expression.")
    },
    async ({ name, value }) => result(await httpClient.post('/api/registers/set', { name, value })));

  // Memory operations. Numeric sizes are converted to query/body strings at
  // the HTTP boundary to match the existing plugin API.
  server.tool('x64dbg_memory_read', 'Read bytes from the debugged process memory.',
    {
      address: z.string().describe("Memory address or x64dbg expression, for example '401000' or 'cip'."),
      size: z.number().int().min(1).max(1048576).optional().describe('Number of bytes to read. Defaults to 256.')
    },
    async ({ address, size }) => result(await httpClient.get('/api/memory/read', {
      address, size: String(size ?? 256)
    })));

  server.tool('x64dbg_memory_write', 'Write hexadecimal bytes to process memory. This modifies the debugged process.',
    {
      address: z.string().describe('Destination address or x64dbg expression.'),
      bytes: z.string().describe("Bytes separated by spaces, for example '90 90' or 'CC'."),
      verify: z.boolean().optional().describe('Verify the write. Defaults to false.')
    },
    async ({ address, bytes, verify }) => result(await httpClient.post('/api/memory/write', {
      address, bytes, verify: verify ?? false
    })));

  server.tool('x64dbg_memory_page_info', 'Get memory page information for an address.',
    { address: z.string().describe('Address to inspect.') },
    async ({ address }) => result(await httpClient.get('/api/memory/page_info', { address })));

  server.tool('x64dbg_memory_map', 'List memory regions, or inspect the region containing an address.',
    { address: z.string().optional().describe('Optional address. Omit to list the full memory map.') },
    async ({ address }) => result(address
      ? await httpClient.get('/api/memmap/at', { address })
      : await httpClient.get('/api/memmap/list')));

  server.tool('x64dbg_memory_allocate', 'Allocate memory in the debugged process.',
    { size: z.string().optional().describe("Allocation size, for example '0x1000'. Defaults to 0x1000.") },
    async ({ size }) => result(await httpClient.post('/api/memory/allocate', { size: size ?? '0x1000' })));

  // Breakpoints.
  server.tool('x64dbg_breakpoints_list', 'List all software, hardware and memory breakpoints.',
    {}, async () => result(await httpClient.get('/api/breakpoints/list')));

  server.tool('x64dbg_breakpoints_get', 'Get details for a breakpoint at an address.',
    { address: z.string().describe('Breakpoint address.') },
    async ({ address }) => result(await httpClient.get('/api/breakpoints/get', { address })));

  server.tool('x64dbg_breakpoint_set_software', 'Set a software breakpoint at an address.',
    {
      address: z.string().describe('Address where the breakpoint should be set.'),
      singleshot: z.boolean().optional().describe('Remove the breakpoint after it is hit once.')
    },
    async ({ address, singleshot }) => result(await httpClient.post('/api/breakpoints/set', {
      address, singleshot: singleshot ?? false
    })));

  server.tool('x64dbg_breakpoint_set_hardware', 'Set a hardware breakpoint at an address.',
    {
      address: z.string().describe('Address where the breakpoint should be set.'),
      type: z.enum(['r', 'w', 'x']).optional().describe('Access type: r=read, w=write, x=execute. Defaults to execute.'),
      size: z.enum(['1', '2', '4', '8']).optional().describe('Watched size in bytes. Defaults to 1.')
    },
    async ({ address, type, size }) => result(await httpClient.post('/api/breakpoints/set_hardware', {
      address, type: type ?? 'x', size: size ?? '1'
    })));

  server.tool('x64dbg_breakpoint_delete', 'Delete a breakpoint at an address.',
    {
      address: z.string().describe('Address of the breakpoint.'),
      type: z.enum(['software', 'hardware', 'memory']).optional().describe('Breakpoint type. Omit if the type is not known.')
    },
    async ({ address, type }) => result(await httpClient.post('/api/breakpoints/delete', { address, type })));

  server.tool('x64dbg_breakpoint_enable', 'Enable a breakpoint at an address.',
    { address: z.string().describe('Address of the breakpoint.') },
    async ({ address }) => result(await httpClient.post('/api/breakpoints/enable', { address })));

  server.tool('x64dbg_breakpoint_disable', 'Disable a breakpoint at an address.',
    { address: z.string().describe('Address of the breakpoint.') },
    async ({ address }) => result(await httpClient.post('/api/breakpoints/disable', { address })));

  // Disassembly and command tools.
  server.tool('x64dbg_disassemble', 'Disassemble instructions starting at an address.',
    {
      address: z.string().optional().describe("Start address or expression. Defaults to 'cip'."),
      count: z.number().int().min(1).max(500).optional().describe('Number of instructions. Defaults to 10.')
    },
    async ({ address, count }) => result(await httpClient.get('/api/disasm/at', {
      address: address ?? 'cip', count: String(count ?? 10)
    })));

  server.tool('x64dbg_disassemble_function', 'Disassemble the function containing an address.',
    {
      address: z.string().optional().describe("Function address. Defaults to 'cip'."),
      max_instructions: z.number().int().min(1).max(1000).optional().describe('Maximum instructions. Defaults to 50.')
    },
    async ({ address, max_instructions }) => result(await httpClient.get('/api/disasm/function', {
      address: address ?? 'cip', max_instructions: String(max_instructions ?? 50)
    })));

  server.tool('x64dbg_assemble', 'Assemble one instruction at the specified address. This modifies process code.',
    {
      address: z.string().describe('Address where the instruction should be assembled.'),
      instruction: z.string().describe("Assembly instruction, for example 'nop' or 'mov eax,1'.")
    },
    async ({ address, instruction }) => result(await httpClient.post('/api/disasm/assemble', { address, instruction })));

  server.tool('x64dbg_command_execute', 'Execute one native x64dbg command.',
    { command: z.string().describe("x64dbg command, for example 'bp 401000' or 'dump cip'.") },
    async ({ command }) => result(await httpClient.post('/api/command/exec', { command })));

  server.tool('x64dbg_evaluate', 'Evaluate an x64dbg expression and return its result.',
    { expression: z.string().describe("Expression, for example 'cip', 'rax' or 'mod.base'.") },
    async ({ expression }) => result(await httpClient.post('/api/command/eval', { expression })));

  // A focused search tool; the byte pattern is explicit and the range optional.
  server.tool('x64dbg_search_pattern', 'Search process memory for a byte pattern. Use ?? for wildcard bytes.',
    {
      pattern: z.string().describe("Byte pattern, for example '48 89 5C ?? 57'."),
      address: z.string().optional().describe('Optional start address.'),
      size: z.string().optional().describe('Optional search range size, for example 0x100000.'),
      max_results: z.number().int().min(1).max(10000).optional().describe('Maximum matches. Defaults to 1000.')
    },
    async ({ pattern, address, size, max_results }) => {
      const body: Record<string, unknown> = { pattern, max_results: max_results ?? 1000 };
      if (address) body.address = address;
      if (size) body.size = size;
      return result(await httpClient.post('/api/search/pattern', body));
    });
}
