import type { PluginInfo } from '@/core/types';
import { COMPANION_PLUGIN_NAME, detectCompanion } from '@/features/board/companion/detectCompanion';

function makePlugin(partial: Partial<PluginInfo>): PluginInfo {
  return {
    id: 'x@m',
    name: 'x',
    enabled: true,
    scope: 'user',
    installPath: '/x',
    ...partial,
  };
}

describe('detectCompanion', () => {
  it('reports absent when no companion plugin is installed', () => {
    expect(detectCompanion([makePlugin({ name: 'other' })])).toEqual({
      status: 'absent',
      pluginId: null,
    });
  });

  it('reports enabled with the full id when installed and enabled', () => {
    const companion = makePlugin({
      id: 'claude-obsidian@agricidaniel-claude-obsidian',
      name: 'claude-obsidian',
      enabled: true,
    });
    expect(detectCompanion([makePlugin({ name: 'other' }), companion])).toEqual({
      status: 'enabled',
      pluginId: 'claude-obsidian@agricidaniel-claude-obsidian',
    });
  });

  it('reports disabled when installed but not enabled', () => {
    const companion = makePlugin({ id: 'claude-obsidian@m', name: 'claude-obsidian', enabled: false });
    expect(detectCompanion([companion])).toEqual({ status: 'disabled', pluginId: 'claude-obsidian@m' });
  });

  it('matches by stripped name regardless of marketplace suffix', () => {
    const companion = makePlugin({
      id: 'claude-obsidian@some-other-marketplace',
      name: 'claude-obsidian',
      enabled: true,
    });
    expect(detectCompanion([companion]).status).toBe('enabled');
  });

  it('exposes the canonical companion name', () => {
    expect(COMPANION_PLUGIN_NAME).toBe('claude-obsidian');
  });
});
