import type {
  CompanionActivity,
  CompanionEmotion,
  CompanionSnapshot,
  CompanionState,
} from '@petwhale/core';
import type {
  ConversationSnapshotCompat,
  RunningToolCallCompat,
} from '../types/dsh-compat';

/**
 * DSH → companion state mapping (design doc §19). Pure and stateless — feed
 * it a ConversationSnapshot and get back the companion state the renderers
 * understand.
 */
export function resolveState(
  session: ConversationSnapshotCompat,
): CompanionState {
  if (session.promptError) return 'error';
  if (session.lastAgentError) return 'error';
  if (session.pending.length > 0) return 'waiting';
  if (session.runningCalls.length > 0) return 'working';
  if (hasReasoning(session.partial)) return 'thinking';
  if (hasAnswer(session.partial)) return 'answering';
  if (session.running) return 'thinking';
  return 'idle';
}

export function resolveEmotion(
  session: ConversationSnapshotCompat,
): CompanionEmotion {
  if (session.promptError || session.lastAgentError) return 'concerned';
  if (session.runningCalls.length > 0) return 'focused';
  if (hasReasoning(session.partial)) return 'curious';
  return 'neutral';
}

export function resolveActivity(
  session: ConversationSnapshotCompat,
): CompanionActivity | undefined {
  if (session.runningCalls.length > 0) {
    const call = latestRunningCall(session.runningCalls);
    return { kind: 'tool', label: call?.name };
  }
  if (hasReasoning(session.partial)) return { kind: 'reasoning' };
  if (hasAnswer(session.partial)) return { kind: 'answer' };
  if (session.pending.length > 0) return { kind: 'waiting' };
  if (session.running) return { kind: 'reasoning' };
  return undefined;
}

export function hasReasoning(
  partial: ConversationSnapshotCompat['partial'],
): boolean {
  return (
    partial?.blocks.some(
      (block) =>
        block.kind === 'reasoning' && (block.text ?? '').trim().length > 0,
    ) ?? false
  );
}

export function hasAnswer(
  partial: ConversationSnapshotCompat['partial'],
): boolean {
  return (
    partial?.blocks.some(
      (block) =>
        block.kind === 'text' && (block.text ?? '').trim().length > 0,
    ) ?? false
  );
}

export function latestRunningCall(
  calls: readonly RunningToolCallCompat[],
): RunningToolCallCompat | undefined {
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1];
}

/** Mutable tracker for completion detection across snapshots. */
export interface CompletionTracking {
  /** The last non-idle state the conversation showed. */
  lastNonIdle: CompanionState | null;
}

export function createCompletionTracking(): CompletionTracking {
  return { lastNonIdle: null };
}

/**
 * Compose a CompanionSnapshot from a DSH ConversationSnapshot.
 *
 * `success` is a transient the source derives: when a conversation that was
 * actively working/answering settles to idle, the source emits `success` once
 * (the scheduler then holds it for successHoldMs).
 */
export function composeSnapshot(
  session: ConversationSnapshotCompat,
  tracking: CompletionTracking,
  now: number = Date.now(),
  context?: CompanionSnapshot['context'],
): { snapshot: CompanionSnapshot; tracking: CompletionTracking } {
  const state = resolveState(session);
  const wasActive =
    tracking.lastNonIdle !== null &&
    tracking.lastNonIdle !== 'idle' &&
    tracking.lastNonIdle !== 'sleeping';
  const settled = state === 'idle' && wasActive;
  const next: CompanionSnapshot = {
    state: settled ? 'success' : state,
    emotion: resolveEmotion(session),
    since: now,
    activity: resolveActivity(session),
    context,
  };
  return {
    snapshot: next,
    tracking: {
      lastNonIdle: state === 'idle' ? null : state,
    },
  };
}
