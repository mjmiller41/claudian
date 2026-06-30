import { Notice } from 'obsidian';

import type ClaudianPlugin from '../../../main';
import { maybeGetClaudeWorkspaceServices } from '../../../providers/claude/app/ClaudeWorkspaceServices';
import { type CompanionDetection, type CompanionStatus, detectCompanion } from './detectCompanion';

/**
 * Detects and provisions the claude-obsidian knowledge companion (a Claude Code
 * plugin). Because Claudian runs the SDK with the `user` setting source, an
 * installed-and-enabled companion's skills/commands/agents are already visible
 * with no vault copy — so provisioning is detect → enable-if-disabled → restart.
 *
 * Reuses the existing `PluginManager` public surface; it does not modify any
 * Claude-provider source.
 */
export class CompanionManager {
  constructor(private readonly plugin: ClaudianPlugin) {}

  detect(): CompanionDetection {
    const workspace = maybeGetClaudeWorkspaceServices();
    if (!workspace) {
      return { status: 'absent', pluginId: null };
    }
    return detectCompanion(workspace.pluginManager.getPlugins());
  }

  async provision(): Promise<CompanionStatus> {
    const workspace = maybeGetClaudeWorkspaceServices();
    if (!workspace) {
      new Notice('Claude workspace is not ready yet. Try again in a moment.');
      return 'absent';
    }

    const detection = detectCompanion(workspace.pluginManager.getPlugins());

    if (detection.status === 'enabled') {
      new Notice('Knowledge companion is ready. /wiki, /autoresearch, and /canvas are available.');
      return 'enabled';
    }

    if (detection.status === 'disabled' && detection.pluginId) {
      await workspace.pluginManager.enablePlugin(detection.pluginId);
      await workspace.agentManager.loadAgents();
      await this.restartActiveRuntimes();
      new Notice('Enabled the claude-obsidian knowledge companion.');
      return 'enabled';
    }

    new Notice(
      'claude-obsidian is not installed. Add it as a Claude Code plugin to enable wiki, research, and canvas skills.',
    );
    return 'absent';
  }

  /** Plugin and setting-source changes require restarting the persistent query. */
  private async restartActiveRuntimes(): Promise<void> {
    for (const view of this.plugin.getAllViews()) {
      await view.getTabManager()?.broadcastToAllTabs(async (service) => {
        await service.ensureReady({ force: true });
      });
    }
  }
}
