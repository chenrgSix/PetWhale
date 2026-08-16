import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from './index';
import { petChoiceFromPreferences, preferencePatchForPet } from './options';

describe('pet preference mapping', () => {
  it('keeps existing users on Orb', () => {
    expect(petChoiceFromPreferences(DEFAULT_PREFERENCES)).toBe('orb');
  });

  it('round-trips a sprite choice through rendererConfig', () => {
    const patch = preferencePatchForPet('cat');
    expect(petChoiceFromPreferences({ ...DEFAULT_PREFERENCES, ...patch })).toBe('cat');
  });

  it('preserves unrelated renderer configuration when changing pets', () => {
    expect(preferencePatchForPet('whale', { fit: 0.9 })).toEqual({
      renderer: 'sprite',
      rendererConfig: { fit: 0.9, petId: 'whale' },
    });
    expect(preferencePatchForPet('orb', { fit: 0.9, petId: 'cat' })).toEqual({
      renderer: 'orb',
      rendererConfig: { fit: 0.9 },
    });
  });

  it('selects a stored custom pet', () => {
    const customPet = {
      id: 'custom:my-pet' as const,
      label: 'My Pet',
      src: 'data:image/png;base64,abc',
    };
    const preferences = {
      ...DEFAULT_PREFERENCES,
      renderer: 'sprite',
      rendererConfig: { petId: customPet.id, customPets: [customPet] },
    };
    expect(petChoiceFromPreferences(preferences)).toBe(customPet.id);
  });
});
