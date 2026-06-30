import { type App, Modal, Setting } from 'obsidian';

import type { AutonomyLevel, CardKind } from '../cards/CardState';
import type { NewCardInput } from '../cards/CardStore';

/** Collects the fields for a new board card. */
export class NewCardModal extends Modal {
  private title = '';
  private prompt = '';
  private kind: CardKind;
  private autonomy: AutonomyLevel = 'auto_safe';
  private board = '';
  private submitted = false;

  constructor(
    app: App,
    private readonly defaults: { kind: CardKind; board?: string },
    private readonly onSubmit: (input: NewCardInput) => void,
  ) {
    super(app);
    this.kind = defaults.kind;
    this.board = defaults.board ?? '';
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('claudian-board-newcard');
    contentEl.createEl('h3', { text: this.kind === 'claude' ? 'New Claude card' : 'New human card' });

    new Setting(contentEl).setName('Title').addText((text) =>
      text.setPlaceholder('Short task title').onChange((value) => {
        this.title = value;
      }),
    );

    new Setting(contentEl)
      .setName(this.kind === 'claude' ? 'Prompt' : 'Task')
      .setDesc(this.kind === 'claude' ? 'What Claude should do, in vault context.' : 'What needs doing.')
      .addTextArea((area) =>
        area.setPlaceholder('Describe the task…').onChange((value) => {
          this.prompt = value;
        }),
      );

    new Setting(contentEl).setName('Board').setDesc('Optional sub-folder under the board root.').addText((text) =>
      text.setValue(this.board).onChange((value) => {
        this.board = value;
      }),
    );

    if (this.kind === 'claude') {
      new Setting(contentEl).setName('Autonomy').addDropdown((drop) =>
        drop
          .addOption('auto_safe', 'Auto-safe: reads and in-vault writes run')
          .addOption('ask_all', 'Ask first: prompt for every tool')
          .addOption('autonomous', 'Autonomous: allow all except the floor')
          .setValue(this.autonomy)
          .onChange((value) => {
            this.autonomy = value as AutonomyLevel;
          }),
      );
    }

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText('Create')
        .setCta()
        .onClick(() => {
          if (!this.title.trim()) return;
          this.submitted = true;
          this.onSubmit({
            title: this.title,
            prompt: this.prompt,
            kind: this.kind,
            autonomy: this.autonomy,
            board: this.board.trim() || null,
          });
          this.close();
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
    void this.submitted;
  }
}
