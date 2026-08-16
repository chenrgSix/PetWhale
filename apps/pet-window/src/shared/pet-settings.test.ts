import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PET_SETTINGS,
  normalizePetSettings,
  petMenuOptions,
} from './pet-settings';

describe('normalizePetSettings', () => {
  it('migrates existing settings without a pet to Orb', () => {
    expect(normalizePetSettings({ locked: true, size: 'small' })).toEqual({
      locked: true,
      size: 'small',
      pet: 'orb',
    });
  });

  it('keeps a supported sprite pet', () => {
    expect(normalizePetSettings({ pet: 'cat' }).pet).toBe('cat');
  });

  it('keeps a safe custom pet id for registry resolution', () => {
    expect(normalizePetSettings({ pet: 'custom:my-pet_1' }).pet).toBe('custom:my-pet_1');
  });

  it('falls back safely for corrupt settings', () => {
    expect(normalizePetSettings({ pet: 'dragon', size: 'huge' })).toEqual(
      DEFAULT_PET_SETTINGS,
    );
  });
});

describe('petMenuOptions', () => {
  it('checks only the selected pet', () => {
    const options = petMenuOptions('whale', [
      { id: 'custom:my-pet', label: 'My Pet' },
    ]);
    expect(options.filter((option) => option.checked).map((option) => option.id)).toEqual([
      'whale',
    ]);
    expect(options.at(-1)?.label).toBe('My Pet');
  });
});
