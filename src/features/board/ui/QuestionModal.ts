import { type App, Modal, Setting } from 'obsidian';

interface ParsedOption {
  label: string;
  description?: string;
}

interface ParsedQuestion {
  question: string;
  header?: string;
  options: ParsedOption[];
  multiSelect: boolean;
}

function parseQuestions(input: Record<string, unknown>): ParsedQuestion[] {
  const raw = Array.isArray(input.questions) ? input.questions : [];
  const parsed: ParsedQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const question = typeof record.question === 'string' ? record.question : null;
    if (!question) continue;
    const options = Array.isArray(record.options)
      ? record.options
          .map((opt): ParsedOption | null => {
            if (!opt || typeof opt !== 'object') return null;
            const label = (opt as Record<string, unknown>).label;
            if (typeof label !== 'string') return null;
            const description = (opt as Record<string, unknown>).description;
            return { label, description: typeof description === 'string' ? description : undefined };
          })
          .filter((opt): opt is ParsedOption => opt !== null)
      : [];
    parsed.push({
      question,
      header: typeof record.header === 'string' ? record.header : undefined,
      options,
      multiSelect: record.multiSelect === true,
    });
  }
  return parsed;
}

/** Surfaces an agent `AskUserQuestion` as a modal; resolves answers keyed by question text. */
export class QuestionModal extends Modal {
  private resolved = false;
  private resolver: ((answers: Record<string, string | string[]> | null) => void) | null = null;
  private readonly questions: ParsedQuestion[];
  private readonly answers: Record<string, string | string[]> = {};

  constructor(app: App, input: Record<string, unknown>) {
    super(app);
    this.questions = parseQuestions(input);
  }

  openAndWait(): Promise<Record<string, string | string[]> | null> {
    if (this.questions.length === 0) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('claudian-board-question');

    for (const question of this.questions) {
      if (question.header) {
        contentEl.createEl('div', { cls: 'claudian-board-question-header', text: question.header });
      }
      contentEl.createEl('p', { cls: 'claudian-board-question-text', text: question.question });

      if (question.multiSelect) {
        const selected = new Set<string>();
        this.answers[question.question] = [];
        for (const option of question.options) {
          new Setting(contentEl)
            .setName(option.label)
            .setDesc(option.description ?? '')
            .addToggle((toggle) =>
              toggle.onChange((value) => {
                if (value) selected.add(option.label);
                else selected.delete(option.label);
                this.answers[question.question] = [...selected];
              }),
            );
        }
      } else {
        for (const option of question.options) {
          new Setting(contentEl)
            .setName(option.label)
            .setDesc(option.description ?? '')
            .addButton((btn) =>
              btn.setButtonText('Choose').onClick(() => {
                this.answers[question.question] = option.label;
                this.maybeFinish();
              }),
            );
        }
      }
    }

    if (this.questions.some((q) => q.multiSelect)) {
      new Setting(contentEl).addButton((btn) =>
        btn.setButtonText('Submit').setCta().onClick(() => this.finish(this.answers)),
      );
    }
  }

  onClose(): void {
    this.finish(this.resolved ? this.answers : null);
  }

  /** Single-select with one question resolves immediately on choice. */
  private maybeFinish(): void {
    if (this.questions.length === 1 && !this.questions[0].multiSelect) {
      this.finish(this.answers);
    }
  }

  private finish(answers: Record<string, string | string[]> | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolver?.(answers);
    this.close();
  }
}
