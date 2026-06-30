import type { PluginInfo } from '../../../core/types';

export type CompanionStatus = 'enabled' | 'disabled' | 'absent';

/** Plugin name (marketplace suffix stripped) of the claude-obsidian companion. */
export const COMPANION_PLUGIN_NAME = 'claude-obsidian';

export interface CompanionDetection {
  status: CompanionStatus;
  /** Full installed plugin id (`name@marketplace`) when present, else null. */
  pluginId: string | null;
}

/**
 * Classify the companion's state from the installed Claude Code plugins.
 * `PluginInfo.name` already has the `@marketplace` suffix stripped, so a name
 * match works regardless of which marketplace the companion was installed from.
 */
export function detectCompanion(
  plugins: readonly PluginInfo[],
  name: string = COMPANION_PLUGIN_NAME,
): CompanionDetection {
  const match = plugins.find((plugin) => plugin.name === name);
  if (!match) {
    return { status: 'absent', pluginId: null };
  }
  return { status: match.enabled ? 'enabled' : 'disabled', pluginId: match.id };
}
