/**
 * Client entry (`@petwhale/dsh/client` — the DSH client plugin surface,
 * design doc §23).
 */
export { inject, apply } from '../index';
export type {
  ClientContextCompat,
  ConversationSnapshotCompat,
  ISessionsCompat,
  ObservableSnapshotCompat,
  PendingInteractionCompat,
  PromptErrorCompat,
  RunningToolCallCompat,
  SessionBindingCompat,
  SessionFaceCompat,
  SessionId,
  SessionListStateCompat,
  SessionSummaryCompat,
  SlotComponentCompat,
  SlotEntryCompat,
  SlotInjectionEffectCompat,
  SlotsServiceCompat,
} from './types/dsh-compat';
export {
  composeSnapshot,
  createCompletionTracking,
  hasAnswer,
  hasReasoning,
  latestRunningCall,
  resolveActivity,
  resolveEmotion,
  resolveState,
} from './source/resolve-state';
export type { CompletionTracking } from './source/resolve-state';
export { DshCompanionSource } from './source/dsh-source';
export type { DshSourceOptions } from './source/dsh-source';
export { OVERLAY_ENTRY_ID, PetWhaleOverlay } from './overlay';
export {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from './settings';
export type { PetWhalePreferences } from './settings';
export { OVERLAY_CLASS, OVERLAY_CSS, PET_CLASS } from './styles';
