import type { SpritePetManifest } from './sprite';

export const CUSTOM_PET_PREFIX = 'custom:';
export type CustomPetId = `${typeof CUSTOM_PET_PREFIX}${string}`;

export interface CustomPetManifest extends SpritePetManifest {
  id: CustomPetId;
}

export type CustomPetMime = 'image/png' | 'image/webp';

export function detectCustomPetMime(bytes: Uint8Array): CustomPetMime | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return 'image/png';
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  return riff === 'RIFF' && webp === 'WEBP' ? 'image/webp' : null;
}

export function isCustomPetId(value: unknown): value is CustomPetId {
  return typeof value === 'string' && /^custom:[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value);
}

export function isCustomPetManifest(value: unknown): value is CustomPetManifest {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<CustomPetManifest>;
  return (
    isCustomPetId(record.id) &&
    typeof record.label === 'string' &&
    record.label.trim().length > 0 &&
    record.label.length <= 80 &&
    typeof record.src === 'string' &&
    record.src.length > 0
  );
}

export function isStoredCustomPetManifest(value: unknown): value is CustomPetManifest {
  return (
    isCustomPetManifest(value) &&
    /^data:image\/(?:png|webp);base64,/.test(value.src)
  );
}
