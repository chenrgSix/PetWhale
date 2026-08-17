export {
  CustomPetStore,
  MAX_DESKTOP_CUSTOM_PET_BYTES,
  detectPetImage,
} from './custom-pets';
export type {
  CustomPetRecord,
  CustomPetRendererConfig,
  ImageCustomPetRecord,
  ImageCustomPetRendererConfig,
  Live2DCustomPetRecord,
  Live2DCustomPetRendererConfig,
  SupportedPetMime,
} from './custom-pets';

export {
  LIVE2D_STATES,
  MAX_LIVE2D_ARCHIVE_BYTES,
  MAX_LIVE2D_ENTRIES,
  MAX_LIVE2D_ENTRY_BYTES,
  MAX_LIVE2D_EXTRACTED_BYTES,
  validateLive2DArchive,
} from './live2d-package';
export type {
  Live2DMotionBinding,
  Live2DMotionMap,
  Live2DPetState,
  ValidatedLive2DPackage,
} from './live2d-package';

export {
  DEFAULT_PET_SETTINGS,
  PET_CHOICES,
  isPetChoiceId,
  normalizePetSettings,
  petMenuOptions,
} from './pet-settings';
export type {
  BuiltInPetChoiceId,
  CustomPetChoiceId,
  CustomPetOption,
  PetChoiceId,
  PetSettings,
} from './pet-settings';

export {
  PetStateTracker,
  activityFromRemoteEvent,
  parseHostFrame,
} from './pet-state';
export type {
  HostFrame,
  PetActivity,
  PetSnapshot,
} from './pet-state';
