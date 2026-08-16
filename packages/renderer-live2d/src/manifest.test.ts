import { describe, expect, it } from 'vitest';
import { isLive2DPetManifest } from './manifest';

describe('isLive2DPetManifest', () => {
  it('accepts a validated Live2D renderer manifest', () => {
    expect(isLive2DPetManifest({
      type: 'live2d',
      id: 'custom:550e8400-e29b-41d4-a716-446655440000',
      label: 'Mao',
      modelUrl: 'petwhale-live2d://550e8400-e29b-41d4-a716-446655440000/Mao.model3.json',
      motions: { idle: { group: 'Idle', loop: true }, answering: { group: 'Talk', index: 0 } },
    })).toBe(true);
  });

  it('rejects external model URLs and invalid motion indexes', () => {
    expect(isLive2DPetManifest({
      type: 'live2d',
      id: 'custom:model',
      label: 'Unsafe',
      modelUrl: 'https://example.com/model.model3.json',
      motions: {},
    })).toBe(false);
    expect(isLive2DPetManifest({
      type: 'live2d',
      id: 'custom:model',
      label: 'Broken',
      modelUrl: 'petwhale-live2d://550e8400-e29b-41d4-a716-446655440000/model.model3.json',
      motions: { idle: { group: 'Idle', index: -1 } },
    })).toBe(false);
  });
});
