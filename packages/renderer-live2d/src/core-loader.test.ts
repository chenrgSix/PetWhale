import { describe, expect, it } from 'vitest';
import { LIVE2D_CUBISM_CORE_URL } from './core-loader';

describe('Live2D Cubism Core loader', () => {
  it('loads the Cubism 5 runtime supported by the renderer engine', () => {
    expect(LIVE2D_CUBISM_CORE_URL).toBe(
      'https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js',
    );
  });
});
