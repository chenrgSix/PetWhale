import {
  SPRITE_PETS,
  isCustomPetId,
  isSpritePetId,
  spritePetById,
  type CustomPetId,
  type CustomPetManifest,
  type SpritePetId,
  type SpritePetManifest,
} from '@petwhale/renderer-sprite';
import type { PetWhalePreferences } from './index';
import { customPetFromPreferences, customPetsFromPreferences } from './custom-pets';

export type PetChoiceId = 'orb' | SpritePetId | CustomPetId;

export const PET_OPTIONS: ReadonlyArray<{ label: string; value: PetChoiceId }> = [
  { label: '能量球', value: 'orb' },
  ...SPRITE_PETS.map((pet) => ({ label: pet.label, value: pet.id })),
];

export function petChoiceFromPreferences(preferences: PetWhalePreferences): PetChoiceId {
  if (isSpritePetId(preferences.renderer)) return preferences.renderer;
  const configuredPet = preferences.rendererConfig?.petId;
  if (preferences.renderer === 'sprite' && isSpritePetId(configuredPet)) return configuredPet;
  if (
    preferences.renderer === 'sprite' &&
    isCustomPetId(configuredPet) &&
    customPetFromPreferences(preferences, configuredPet) !== null
  ) return configuredPet;
  return 'orb';
}

export function petOptionsFromPreferences(
  preferences: PetWhalePreferences,
): ReadonlyArray<{ label: string; value: PetChoiceId }> {
  return [
    ...PET_OPTIONS,
    ...customPetsFromPreferences(preferences).map((pet) => ({ label: pet.label, value: pet.id })),
  ];
}

export function petManifestFromPreferences(
  preferences: PetWhalePreferences,
): SpritePetManifest | CustomPetManifest | null {
  const pet = petChoiceFromPreferences(preferences);
  if (isSpritePetId(pet)) return spritePetById(pet);
  if (isCustomPetId(pet)) return customPetFromPreferences(preferences, pet);
  return null;
}

export function preferencePatchForPet(
  pet: PetChoiceId,
  rendererConfig: Record<string, unknown> = {},
): Partial<PetWhalePreferences> {
  const nextConfig = { ...rendererConfig };
  if (pet === 'orb') {
    delete nextConfig.petId;
    return {
      renderer: 'orb',
      rendererConfig: Object.keys(nextConfig).length > 0 ? nextConfig : undefined,
    };
  }
  return { renderer: 'sprite', rendererConfig: { ...nextConfig, petId: pet } };
}

/** Position anchors for the overlay (design doc §33). */
export const ANCHOR_OPTIONS: ReadonlyArray<{ label: string; value: PetWhalePreferences['anchor'] }> = [
  { label: '右下角', value: 'bottom-right' },
  { label: '左下角', value: 'bottom-left' },
];

/** Idle-sleep choices; 0 = never sleep. */
export const SLEEP_OPTIONS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '1 分钟', value: 60_000 },
  { label: '5 分钟', value: 5 * 60_000 },
  { label: '15 分钟', value: 15 * 60_000 },
  { label: '从不', value: 0 },
];

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
export const SCALE_STEP = 0.1;
