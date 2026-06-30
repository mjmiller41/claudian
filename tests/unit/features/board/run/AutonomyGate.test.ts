import { type AutonomyContext, decide, isAlwaysAsk } from '@/features/board/run/AutonomyGate';

describe('AutonomyGate always-ask floor', () => {
  it('floors connector forms of risky outward actions', () => {
    expect(isAlwaysAsk('mcp__claude_ai_Gmail__send_message')).toBe(true);
    expect(isAlwaysAsk('mcp__gmail__send')).toBe(true);
    expect(isAlwaysAsk('mcp__claude_ai_Stripe__create_refund')).toBe(true);
    expect(isAlwaysAsk('mcp__claude_ai_Stripe__stripe_api_write')).toBe(true);
    expect(isAlwaysAsk('mcp__claude_ai_Google_Calendar__create_event')).toBe(true);
    expect(isAlwaysAsk('mcp__claude_ai_Google_Calendar__delete_event')).toBe(true);
  });

  it('does not floor reads of the same services', () => {
    expect(isAlwaysAsk('mcp__claude_ai_Stripe__search_stripe_resources')).toBe(false);
    expect(isAlwaysAsk('mcp__claude_ai_Google_Calendar__list_events')).toBe(false);
    expect(isAlwaysAsk('mcp__claude_ai_Gmail__search_threads')).toBe(false);
  });

  it('overrides even the autonomous level', () => {
    expect(decide('mcp__claude_ai_Stripe__create_refund', {}, 'autonomous')).toBe('ask');
  });
});

describe('AutonomyGate levels', () => {
  const withinVault: AutonomyContext = { isPathWithinVault: () => true };

  it('autonomous allows non-floored tools', () => {
    expect(decide('Bash', { command: 'rm -rf x' }, 'autonomous')).toBe('allow');
  });

  it('ask_all asks for everything non-floored, including reads', () => {
    expect(decide('Read', { file_path: 'a.md' }, 'ask_all')).toBe('ask');
  });

  describe('auto_safe', () => {
    it('allows safe read tools', () => {
      expect(decide('Read', { file_path: 'a.md' }, 'auto_safe')).toBe('allow');
      expect(decide('Grep', { pattern: 'x' }, 'auto_safe')).toBe('allow');
    });

    it('allows in-vault writes but asks for out-of-vault writes', () => {
      expect(decide('Write', { file_path: 'note.md' }, 'auto_safe', withinVault)).toBe('allow');
      expect(decide('Write', { file_path: '/etc/passwd' }, 'auto_safe', { isPathWithinVault: () => false })).toBe('ask');
    });

    it('fails closed (ask) when a write path cannot be resolved', () => {
      expect(decide('Write', {}, 'auto_safe', withinVault)).toBe('ask');
      expect(decide('Edit', { file_path: 'note.md' }, 'auto_safe')).toBe('ask');
    });

    it('asks for Bash', () => {
      expect(decide('Bash', { command: 'echo hi' }, 'auto_safe')).toBe('ask');
    });

    it('allows vault MCP reads/writes but asks for vault delete', () => {
      expect(decide('mcp__obsidian-vault__read_note', { path: 'a' }, 'auto_safe')).toBe('allow');
      expect(decide('mcp__obsidian-vault__write_note', { path: 'a' }, 'auto_safe')).toBe('allow');
      expect(decide('mcp__obsidian-vault__delete_note', { path: 'a' }, 'auto_safe')).toBe('ask');
    });
  });
});
