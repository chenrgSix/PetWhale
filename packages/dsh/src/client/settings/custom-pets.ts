import {
  detectCustomPetMime,
  isCustomPetId,
  isStoredCustomPetManifest,
  type CustomPetId,
  type CustomPetManifest,
} from '@petwhale/renderer-sprite';
import type { PetWhalePreferences } from './index';

export const MAX_DSH_CUSTOM_PET_FILE_BYTES = 512 * 1024;
export const MAX_DSH_CUSTOM_PET_STORAGE_CHARS = 2_000_000;

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export function customPetsFromPreferences(
  preferences: PetWhalePreferences,
): CustomPetManifest[] {
  const value = preferences.rendererConfig?.customPets;
  if (!Array.isArray(value)) return [];
  return value.filter(isStoredCustomPetManifest);
}

export function customPetFromPreferences(
  preferences: PetWhalePreferences,
  id: unknown,
): CustomPetManifest | null {
  if (!isCustomPetId(id)) return null;
  return customPetsFromPreferences(preferences).find((pet) => pet.id === id) ?? null;
}

export async function customPetFromFile(file: File): Promise<CustomPetManifest> {
  if (file.size > MAX_DSH_CUSTOM_PET_FILE_BYTES) {
    throw new Error('DSH 自定义宠物图片不能超过 512 KB');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectCustomPetMime(bytes);
  if (mime === null) throw new Error('仅支持 PNG、APNG 或 WebP 图片');
  const source = bytesToDataUrl(bytes, mime);
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const label = file.name.replace(/\.(?:png|apng|webp)$/i, '').trim().slice(0, 80) || '自定义宠物';
  return { id: `custom:${token}`, label, src: source };
}

export function preferencePatchWithCustomPet(
  preferences: PetWhalePreferences,
  pet: CustomPetManifest,
): Partial<PetWhalePreferences> {
  const customPets = [...customPetsFromPreferences(preferences), pet];
  const storageChars = customPets.reduce((total, item) => total + item.src.length, 0);
  if (storageChars > MAX_DSH_CUSTOM_PET_STORAGE_CHARS) {
    throw new Error('自定义宠物总存储不能超过约 2 MB，请先删除旧宠物');
  }
  return {
    renderer: 'sprite',
    rendererConfig: {
      ...preferences.rendererConfig,
      petId: pet.id,
      customPets,
    },
  };
}

export function preferencePatchWithoutCustomPet(
  preferences: PetWhalePreferences,
  id: CustomPetId,
): Partial<PetWhalePreferences> {
  const customPets = customPetsFromPreferences(preferences).filter((pet) => pet.id !== id);
  const selected = preferences.rendererConfig?.petId;
  return {
    renderer: selected === id ? 'orb' : preferences.renderer,
    rendererConfig: {
      ...preferences.rendererConfig,
      petId: selected === id ? undefined : selected,
      customPets,
    },
  };
}
