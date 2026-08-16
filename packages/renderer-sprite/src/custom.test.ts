import { describe, expect, it } from 'vitest';
import {
  detectCustomPetMime,
  isCustomPetId,
  isCustomPetManifest,
  isStoredCustomPetManifest,
} from './custom';

describe('custom pet validation', () => {
  it('accepts namespaced custom ids', () => {
    expect(isCustomPetId('custom:7b45f7f2-25a7-443d')).toBe(true);
    expect(isCustomPetId('cat')).toBe(false);
    expect(isCustomPetId('custom:../cat')).toBe(false);
  });

  it('requires a complete renderer manifest', () => {
    expect(
      isCustomPetManifest({
        id: 'custom:my-pet',
        label: 'My Pet',
        src: 'data:image/png;base64,abc',
      }),
    ).toBe(true);
    expect(isCustomPetManifest({ id: 'custom:my-pet', label: '', src: 'x' })).toBe(false);
  });

  it('detects supported content and restricts persisted browser sources', () => {
    expect(detectCustomPetMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])))
      .toBe('image/png');
    expect(detectCustomPetMime(new TextEncoder().encode('RIFF0000WEBP'))).toBe('image/webp');
    expect(
      isStoredCustomPetManifest({
        id: 'custom:browser-pet',
        label: 'Browser Pet',
        src: 'data:image/png;base64,abc',
      }),
    ).toBe(true);
  });
});
