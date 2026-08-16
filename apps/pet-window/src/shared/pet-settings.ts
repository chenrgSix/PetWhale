export const PET_CHOICES = [
  { id: 'orb', label: '能量球' },
  { id: 'whale', label: '蓝色小鲸' },
  { id: 'cat', label: '橘色小猫' },
] as const;

export type PetChoiceId = (typeof PET_CHOICES)[number]['id'];

export interface PetSettings {
  locked: boolean;
  size: 'small' | 'large';
  pet: PetChoiceId;
}

export const DEFAULT_PET_SETTINGS: PetSettings = {
  locked: false,
  size: 'large',
  pet: 'orb',
};

export function isPetChoiceId(value: unknown): value is PetChoiceId {
  return PET_CHOICES.some((choice) => choice.id === value);
}

export function normalizePetSettings(value: unknown): PetSettings {
  const parsed = value !== null && typeof value === 'object'
    ? value as Partial<PetSettings>
    : {};
  return {
    locked: parsed.locked === true,
    size: parsed.size === 'small' ? 'small' : 'large',
    pet: isPetChoiceId(parsed.pet) ? parsed.pet : 'orb',
  };
}

export function petMenuOptions(selected: PetChoiceId) {
  return PET_CHOICES.map((choice) => ({
    ...choice,
    checked: choice.id === selected,
  }));
}
