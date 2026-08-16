/**
 * The companion's continuous display states (design doc §8).
 *
 * Host adapters map raw Agent signals into these semantics; renderers only
 * ever see these. State is orthogonal to Emotion (how the character feels)
 * and Action (one-shot gestures).
 */
export type CompanionState =
  | 'idle' // no running task
  | 'thinking' // model is reasoning
  | 'answering' // model is generating final output
  | 'working' // tool / shell / edit executing
  | 'waiting' // waiting for user confirmation or input
  | 'success' // just finished a task (transient)
  | 'error' // just errored (transient)
  | 'sleeping'; // long idle

/** Character emotion (design doc §9). Maps to Live2D expressions later. */
export type CompanionEmotion =
  | 'neutral'
  | 'happy'
  | 'focused'
  | 'curious'
  | 'confused'
  | 'concerned';

/** One-shot gestures (design doc §9). Maps to one-shot motions later. */
export type CompanionAction =
  | 'greet'
  | 'wave'
  | 'nod'
  | 'celebrate'
  | 'confused'
  | 'poke';

/** What the agent is visibly doing right now, if anything (design doc §10). */
export type CompanionActivityKind =
  | 'reasoning'
  | 'answer'
  | 'tool'
  | 'waiting'
  | 'system';

export interface CompanionActivity {
  kind: CompanionActivityKind;
  /** Short human-readable label, e.g. the tool name ('bash'). */
  label?: string;
}

export interface CompanionContext {
  host?: string;
  sessionId?: string;
  workspace?: string;
}

/**
 * The single unit of truth renderers consume. Renderers must never read raw
 * Agent events — only snapshots projected through the companion pipeline
 * (design doc §10, Rule 4).
 */
export interface CompanionSnapshot {
  state: CompanionState;
  emotion: CompanionEmotion;
  /** Unix epoch ms when this state was entered. */
  since: number;
  activity?: CompanionActivity;
  context?: CompanionContext;
}

export const COMPANION_STATES: readonly CompanionState[] = [
  'idle',
  'thinking',
  'answering',
  'working',
  'waiting',
  'success',
  'error',
  'sleeping',
] as const;

export const COMPANION_EMOTIONS: readonly CompanionEmotion[] = [
  'neutral',
  'happy',
  'focused',
  'curious',
  'confused',
  'concerned',
] as const;

export const COMPANION_ACTIONS: readonly CompanionAction[] = [
  'greet',
  'wave',
  'nod',
  'celebrate',
  'confused',
  'poke',
] as const;
