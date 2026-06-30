import type { HookCallbackMatcher, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';

export type ToolGateDecision = 'allow' | 'ask' | 'deny';

/** Decides a tool call's fate before it runs. Returned by headless callers (the board). */
export type ToolGate = (toolName: string, input: unknown) => ToolGateDecision;

/**
 * A PreToolUse hook that routes every tool call through a caller-supplied gate.
 * Unlike `canUseTool`, a PreToolUse hook fires for built-in tools (Bash/Write)
 * too — Claude Code's directory trust resolves those before `canUseTool`, so the
 * hook is the only place a board run can gate them.
 *
 * `allow` passes through (normal resolution proceeds); `ask` surfaces via the
 * `canUseTool` approval path (the board modal); `deny` blocks the call.
 */
export function createToolGateHook(getGate: () => ToolGate | null): HookCallbackMatcher {
  return {
    hooks: [
      async (input) => {
        const gate = getGate();
        if (!gate) return {};

        const pre = input as PreToolUseHookInput;
        let decision: ToolGateDecision;
        try {
          decision = gate(pre.tool_name, pre.tool_input);
        } catch {
          decision = 'ask'; // fail closed
        }

        if (decision === 'allow') {
          return {};
        }

        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse' as const,
            permissionDecision: decision,
          },
        };
      },
    ],
  };
}
