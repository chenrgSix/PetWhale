import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from './index';
import {
  customPetFromFile,
  customPetFromPreferences,
  customPetsFromPreferences,
  preferencePatchWithCustomPet,
  preferencePatchWithoutCustomPet,
} from './custom-pets';

const pet = {
  id: 'custom:test-pet' as const,
  label: 'Test Pet',
  src: 'data:image/png;base64,abc',
};

describe('DSH custom pet preferences', () => {
  it('imports a browser file after content validation', async () => {
    const file = new File(
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])],
      'My Browser Pet.apng',
      { type: 'image/png' },
    );
    const imported = await customPetFromFile(file);
    expect(imported.id).toMatch(/^custom:/);
    expect(imported.label).toBe('My Browser Pet');
    expect(imported.src).toMatch(/^data:image\/png;base64,/);
  });

  it('adds, resolves and removes a persisted custom pet', () => {
    const added = { ...DEFAULT_PREFERENCES, ...preferencePatchWithCustomPet(DEFAULT_PREFERENCES, pet) };
    expect(customPetsFromPreferences(added)).toEqual([pet]);
    expect(customPetFromPreferences(added, pet.id)).toEqual(pet);

    const removed = { ...added, ...preferencePatchWithoutCustomPet(added, pet.id) };
    expect(customPetsFromPreferences(removed)).toEqual([]);
    expect(removed.renderer).toBe('orb');
  });

  it('drops malformed or unsafe stored entries', () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      rendererConfig: {
        customPets: [{ id: 'custom:bad', label: 'Bad', src: 'javascript:alert(1)' }],
      },
    };
    expect(customPetsFromPreferences(preferences)).toEqual([]);
  });

  it('rejects a custom collection that exceeds the browser storage budget', () => {
    expect(() => preferencePatchWithCustomPet(DEFAULT_PREFERENCES, {
      ...pet,
      src: `data:image/png;base64,${'a'.repeat(2_000_000)}`,
    })).toThrow('自定义宠物总存储不能超过约 2 MB');
  });
});
