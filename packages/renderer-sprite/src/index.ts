import catUrl from './assets/cat.png';
import whaleUrl from './assets/whale.png';

export { animationForState } from './animations';
export type { SpriteAnimationSpec } from './animations';
export { SpriteRenderer } from './sprite';
export type { SpritePetManifest, SpriteRendererOptions } from './sprite';

export const SPRITE_PETS = [
  { id: 'whale', label: '蓝色小鲸', src: whaleUrl },
  { id: 'cat', label: '橘色小猫', src: catUrl },
] as const;

export type SpritePetId = (typeof SPRITE_PETS)[number]['id'];

export function isSpritePetId(value: unknown): value is SpritePetId {
  return SPRITE_PETS.some((pet) => pet.id === value);
}

export function spritePetById(id: SpritePetId) {
  return SPRITE_PETS.find((pet) => pet.id === id) ?? SPRITE_PETS[0];
}
