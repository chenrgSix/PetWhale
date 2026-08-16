export const PET_CHOICES = [
  { id: 'orb', label: '能量球' },
  { id: 'whale', label: '蓝色小鲸' },
  { id: 'cat', label: '橘色小猫' },
] as const;

export type BuiltInPetChoiceId = (typeof PET_CHOICES)[number]['id'];
export type CustomPetChoiceId = `custom:${string}`;
export type PetChoiceId = BuiltInPetChoiceId | CustomPetChoiceId;

export interface CustomPetOption {
  id: CustomPetChoiceId;
  label: string;
}

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
  return (
    PET_CHOICES.some((choice) => choice.id === value) ||
    (typeof value === 'string' && /^custom:[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value))
  );
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

export function petMenuOptions(
  selected: PetChoiceId,
  customPets: readonly CustomPetOption[] = [],
) {
  return [...PET_CHOICES, ...customPets].map((choice) => ({
    ...choice,
    checked: choice.id === selected,
  }));
}
