import type { WorkspaceLeaf } from 'obsidian';

import type ClaudianPlugin from '../../main';
import type { CardKind } from './cards/CardState';
import { CompanionManager } from './companion/CompanionManager';
import { BoardView, VIEW_TYPE_BOARD } from './ui/BoardView';

/**
 * Self-contained registration for the board feature. Called once from
 * `main.ts` onload() so the rest of the module stays additive — the board's
 * view, ribbon, and commands all register from here.
 */
export class BoardFeature {
  static register(plugin: ClaudianPlugin): void {
    const companion = new CompanionManager(plugin);

    plugin.registerView(VIEW_TYPE_BOARD, (leaf) => new BoardView(leaf, plugin));

    plugin.addRibbonIcon('layout-dashboard', 'Open Claudian board', () => {
      void BoardFeature.openBoard(plugin);
    });

    plugin.addCommand({
      id: 'open-board',
      name: 'Open board',
      callback: () => {
        void BoardFeature.openBoard(plugin);
      },
    });

    plugin.addCommand({
      id: 'new-claude-card',
      name: 'New Claude card',
      callback: () => {
        void BoardFeature.newCard(plugin, 'claude');
      },
    });

    plugin.addCommand({
      id: 'new-human-card',
      name: 'New human card',
      callback: () => {
        void BoardFeature.newCard(plugin, 'human');
      },
    });

    plugin.addCommand({
      id: 'setup-knowledge-companion',
      name: 'Set up knowledge companion',
      callback: () => {
        void companion.provision();
      },
    });
  }

  private static async openBoard(plugin: ClaudianPlugin): Promise<BoardView | null> {
    const { workspace } = plugin.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_BOARD)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_BOARD, active: true });
    }
    workspace.revealLeaf(leaf);
    return leaf.view instanceof BoardView ? leaf.view : null;
  }

  private static async newCard(plugin: ClaudianPlugin, kind: CardKind): Promise<void> {
    const view = await BoardFeature.openBoard(plugin);
    view?.newCard(kind);
  }
}
