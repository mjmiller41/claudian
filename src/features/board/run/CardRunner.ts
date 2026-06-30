import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { ProviderId } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { ApprovalDecision, Conversation } from '../../../core/types';
import type { PermissionMode } from '../../../core/types/settings';
import type ClaudianPlugin from '../../../main';
import { getVaultPath, isPathWithinVault } from '../../../utils/path';
import type { CardState } from '../cards/CardState';
import type { CardStore } from '../cards/CardStore';
import { decide } from './AutonomyGate';
import { inferNeedsReply } from './inferNeedsReply';

type ToolGateFn = (toolName: string, input: unknown) => 'allow' | 'ask' | 'deny';

/** The concrete-runtime gate hooks added to ClaudeChatRuntime; absent on providers without them. */
interface BoardGatedRuntime {
  setPermissionModeOverride(mode: PermissionMode | null): void;
  setToolGate(gate: ToolGateFn | null): void;
}

function asGated(runtime: ChatRuntime): BoardGatedRuntime | null {
  const candidate = runtime as unknown as Partial<BoardGatedRuntime>;
  return typeof candidate.setPermissionModeOverride === 'function'
    && typeof candidate.setToolGate === 'function'
    ? (candidate as BoardGatedRuntime)
    : null;
}

export type ApprovalResolver = (
  card: CardState,
  toolName: string,
  input: Record<string, unknown>,
  description: string,
) => Promise<ApprovalDecision>;

export type QuestionResolver = (
  input: Record<string, unknown>,
) => Promise<Record<string, string | string[]> | null>;

interface TurnOutcome {
  text: string;
  toolNames: string[];
  errored: boolean;
  errorText?: string;
  session: string | null;
  providerState: Record<string, unknown> | null;
}

export interface CardRunnerDeps {
  plugin: ClaudianPlugin;
  store: CardStore;
  requestApproval: ApprovalResolver;
  askQuestion: QuestionResolver;
  onUpdate?: () => void;
}

/**
 * Runs a claude card as a headless turn: resumes its session, gates tool use
 * through the autonomy gate (forcing a non-yolo mode so the gate fires),
 * streams a summarized transcript into the note's `## Log`, and persists the
 * session for resume. Fails closed if the gate cannot be enforced.
 */
export class CardRunner {
  private readonly running = new Set<string>();

  constructor(private readonly deps: CardRunnerDeps) {}

  isRunning(path: string): boolean {
    return this.running.has(path);
  }

  /** Run a claude card from its task prompt. */
  async run(path: string): Promise<void> {
    return this.execute(path, null);
  }

  /** Continue a card's session with a follow-up reply instead of its task prompt. */
  async continue(path: string, reply: string): Promise<void> {
    const text = reply.trim();
    if (!text) return;
    return this.execute(path, text);
  }

  /**
   * Run an ephemeral planning turn (fresh session, not persisted) and return the
   * raw text. Used by the orchestrator to ask a card to decompose itself without
   * polluting the card's task session.
   */
  async plan(path: string, instruction: string): Promise<string | null> {
    if (this.running.has(path)) return null;
    const card = await this.deps.store.loadRunnable(path);
    if (!card || card.kind !== 'claude') return null;

    this.running.add(path);
    this.deps.onUpdate?.();
    try {
      const ephemeral: CardState = { ...card, session: null, providerState: null };
      const outcome = await this.streamTurn(ephemeral, instruction);
      return outcome.errored ? null : outcome.text;
    } finally {
      this.running.delete(path);
      this.deps.onUpdate?.();
    }
  }

  private async execute(path: string, overrideText: string | null): Promise<void> {
    if (this.running.has(path)) return;

    const card = await this.deps.store.loadRunnable(path);
    if (!card || card.kind !== 'claude') return; // human cards are manual

    const turnText = (overrideText ?? card.prompt).trim();
    if (!turnText) return;

    this.running.add(path);
    try {
      await this.deps.store.setStatus(path, 'running');
      this.deps.onUpdate?.();

      const outcome = await this.streamTurn(card, turnText);
      await this.deps.store.applyRunResult(path, {
        status: outcome.errored ? 'failed' : 'review',
        assistantText: outcome.text,
        toolNames: outcome.toolNames,
        session: outcome.session,
        providerState: outcome.providerState,
        error: outcome.errorText,
        prompt: overrideText ?? undefined,
        needsReply: !outcome.errored && inferNeedsReply(outcome.text, outcome.toolNames),
      });
    } finally {
      this.running.delete(path);
      this.deps.onUpdate?.();
    }
  }

  /**
   * Create a runtime, install the gate, stream one turn, and return the outcome.
   * Owns no store or running-set state — callers persist the result. Fails closed
   * (errored outcome) if the permission gate can't be enforced.
   */
  private async streamTurn(card: CardState, turnText: string): Promise<TurnOutcome> {
    let runtime: ChatRuntime | null = null;
    try {
      runtime = ProviderRegistry.createChatRuntime({
        plugin: this.deps.plugin,
        providerId: card.provider as ProviderId,
      });

      const gated = asGated(runtime);
      if (!gated) {
        return this.errorOutcome(card, 'Permission gate unavailable for this provider; refusing to run ungated.');
      }
      gated.setPermissionModeOverride('normal');

      const conversation = this.buildConversation(card);
      runtime.syncConversationState({
        sessionId: card.session,
        providerState: card.providerState ?? undefined,
      });

      const vaultPath = getVaultPath(this.deps.plugin.app) ?? '';
      const gateContext = { isPathWithinVault: (p: string) => !!vaultPath && isPathWithinVault(p, vaultPath) };

      // PreToolUse gate covers built-in tools (Bash/Write); the approval callback
      // renders the modal when the gate routes a call to `ask`.
      gated.setToolGate((toolName, input) => decide(toolName, input, card.autonomy, gateContext));
      runtime.setApprovalCallback(async (toolName, input, description) => {
        if (decide(toolName, input, card.autonomy, gateContext) === 'allow') return 'allow';
        return this.deps.requestApproval(card, toolName, input, description);
      });
      runtime.setAskUserQuestionCallback((input) => this.deps.askQuestion(input));

      const turn = runtime.prepareTurn({ text: turnText, currentNotePath: card.path });

      let assistantText = '';
      const toolNames: string[] = [];
      let errored = false;
      let errorText: string | undefined;

      for await (const chunk of runtime.query(turn)) {
        switch (chunk.type) {
          case 'text':
            assistantText += chunk.content;
            break;
          case 'tool_use':
            toolNames.push(chunk.name);
            break;
          case 'error':
            errored = true;
            errorText = chunk.content;
            break;
          default:
            break;
        }
      }

      const { updates } = runtime.buildSessionUpdates({
        conversation,
        sessionInvalidated: runtime.consumeSessionInvalidation(),
      });
      return {
        text: assistantText.trim(),
        toolNames,
        errored,
        errorText,
        session: updates.sessionId ?? runtime.getSessionId() ?? card.session ?? null,
        providerState: updates.providerState ?? card.providerState ?? null,
      };
    } catch (err) {
      return this.errorOutcome(card, err instanceof Error ? err.message : String(err));
    } finally {
      runtime?.cleanup();
    }
  }

  private errorOutcome(card: CardState, errorText: string): TurnOutcome {
    return {
      text: '',
      toolNames: [],
      errored: true,
      errorText,
      session: card.session,
      providerState: card.providerState,
    };
  }

  private buildConversation(card: CardState): Conversation {
    const now = Date.now();
    return {
      id: card.path,
      providerId: card.provider as ProviderId,
      title: card.title,
      createdAt: now,
      updatedAt: now,
      sessionId: card.session,
      providerState: card.providerState ?? undefined,
      messages: [],
    };
  }
}
