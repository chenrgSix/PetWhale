/**
 * @petwhale/dsh — node half (host loader entry). The PetWhale plugin is
 * browser-only: the `dsh.client` bundle lives at ./client. The pure mapping
 * logic is re-exported here so consumers can reuse it without the browser
 * bundle (typecheck against `@deepseek-ai/dsh-client-runtime` types requires
 * the ambient declarations in ./client/types/dsh.d.ts).
 */
export {
  composeSnapshot,
  createCompletionTracking,
  hasAnswer,
  hasReasoning,
  latestRunningCall,
  resolveActivity,
  resolveEmotion,
  resolveState,
} from './client/source/resolve-state';
export type { CompletionTracking } from './client/source/resolve-state';
export { DshCompanionSource } from './client/source/dsh-source';
export type { DshSourceOptions } from './client/source/dsh-source';
export {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from './client/settings';
export type { PetWhalePreferences } from './client/settings';
export { createPreferencesStore } from './client/settings/preferences-store';
export type { PreferencesStore } from './client/settings/preferences-store';
export {
  MAX_DSH_CUSTOM_PET_FILE_BYTES,
  MAX_DSH_CUSTOM_PET_STORAGE_CHARS,
  customPetFromFile,
  customPetFromPreferences,
  customPetsFromPreferences,
  preferencePatchWithCustomPet,
  preferencePatchWithoutCustomPet,
} from './client/settings/custom-pets';
export {
  ANCHOR_OPTIONS,
  PET_OPTIONS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  SLEEP_OPTIONS,
  petChoiceFromPreferences,
  petManifestFromPreferences,
  petOptionsFromPreferences,
  preferencePatchForPet,
} from './client/settings/options';
export type { PetChoiceId } from './client/settings/options';
export {
  OVERLAY_CLASS,
  OVERLAY_CSS,
  PET_CLASS,
  LABEL_CLASS,
  SETTINGS_CLASS,
  ROW_CLASS,
  SETTINGS_CSS,
  injectOverlayStyle,
  injectSettingsStyle,
} from './client/styles';
export { clampOverlayPosition } from './client/overlay/position';
export type { OverlayPosition } from './client/overlay/position';

/** Host loader entry: no host-side behavior (browser-only plugin). */
export function apply(): void {}
