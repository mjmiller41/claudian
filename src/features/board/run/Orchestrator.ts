import { Notice } from 'obsidian';

import type { CardStore } from '../cards/CardStore';
import type { CardRunner } from './CardRunner';
import { parseSubtasks } from './parseSubtasks';

const MAX_SUBTASKS = 8;

function planInstruction(task: string): string {
  return [
    'Break the task below into a few (2-6) independent subtasks that can be worked on separately.',
    'For each subtask give a short title and a self-contained prompt that includes the context needed to do it.',
    'Respond with ONLY a JSON array and no other text:',
    '[{"title":"...","prompt":"..."}]',
    '',
    'Task:',
    task,
  ].join('\n');
}

export interface OrchestratorDeps {
  store: CardStore;
  runner: CardRunner;
  onUpdate?: () => void;
}

/**
 * Board-level decomposition: ask a parent task card to plan subtasks, then
 * materialize each as a durable subagent child note linked to the parent.
 * Children land in Inbox for the user to run (human-in-the-loop, no auto-run),
 * and only `task` cards decompose, so depth is capped at one level.
 */
export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async decompose(parentPath: string): Promise<void> {
    const parent = await this.deps.store.loadRunnable(parentPath);
    if (!parent || parent.kind !== 'claude') return;
    if (parent.role !== 'task') {
      new Notice('Only task cards can be decomposed.');
      return;
    }

    const text = await this.deps.runner.plan(parentPath, planInstruction(parent.prompt));
    if (text === null) {
      new Notice('Could not generate a plan for this card.');
      return;
    }

    const subtasks = parseSubtasks(text).slice(0, MAX_SUBTASKS);
    if (subtasks.length === 0) {
      new Notice('The planner did not return any subtasks.');
      return;
    }

    for (const subtask of subtasks) {
      const child = await this.deps.store.createCard({
        title: subtask.title,
        prompt: subtask.prompt,
        kind: 'claude',
        role: 'subagent',
        autonomy: parent.autonomy,
        board: parent.board ?? undefined,
        parent: `[[${parent.title}]]`,
      });
      await this.deps.store.addChildLink(parentPath, child.title);
    }

    new Notice(`Created ${subtasks.length} subtask card${subtasks.length === 1 ? '' : 's'} in Inbox.`);
    this.deps.onUpdate?.();
  }
}
