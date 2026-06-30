import type ClaudianPlugin from '../../main';
import { CompanionManager } from './companion/CompanionManager';

/**
 * Self-contained registration for the board feature. Called once from
 * `main.ts` onload() so the rest of the module stays additive — all board
 * surfaces (commands, view, ribbon) register from here.
 */
export class BoardFeature {
  static register(plugin: ClaudianPlugin): void {
    const companion = new CompanionManager(plugin);

    plugin.addCommand({
      id: 'setup-knowledge-companion',
      name: 'Set up knowledge companion',
      callback: () => {
        void companion.provision();
      },
    });
  }
}
