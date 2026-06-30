import { createToolGateHook, type ToolGate } from '@/providers/claude/hooks/ToolGateHook';

function makeInput(toolName: string, input: unknown) {
  return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: input, tool_use_id: 't1' };
}

async function invoke(gate: ToolGate | null, toolName: string, input: unknown) {
  const matcher = createToolGateHook(() => gate);
  const callback = matcher.hooks[0];
  const options = { signal: new AbortController().signal };
  return callback(makeInput(toolName, input) as unknown as Parameters<typeof callback>[0], undefined, options);
}

describe('createToolGateHook', () => {
  it('passes through (empty output) when the gate allows', async () => {
    const result = await invoke(() => 'allow', 'Bash', { command: 'ls' });
    expect(result).toEqual({});
  });

  it('emits an ask decision that routes to canUseTool', async () => {
    const result = await invoke(() => 'ask', 'Bash', { command: 'rm x' });
    expect(result).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' },
    });
  });

  it('emits a deny decision that blocks the call', async () => {
    const result = await invoke(() => 'deny', 'Bash', { command: 'rm -rf /' });
    expect(result).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
    });
  });

  it('passes through when no gate is installed', async () => {
    expect(await invoke(null, 'Bash', {})).toEqual({});
  });

  it('fails closed (ask) when the gate throws', async () => {
    const result = await invoke(() => {
      throw new Error('boom');
    }, 'Bash', {});
    expect(result).toEqual({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' },
    });
  });

  it('forwards the tool name and input to the gate', async () => {
    const seen: Array<{ name: string; input: unknown }> = [];
    const gate: ToolGate = (name, input) => {
      seen.push({ name, input });
      return 'allow';
    };
    await invoke(gate, 'Write', { file_path: 'a.md' });
    expect(seen).toEqual([{ name: 'Write', input: { file_path: 'a.md' } }]);
  });
});
