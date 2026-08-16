import { describe, expect, it } from 'vitest';
import { clampOverlayPosition } from './position';

describe('clampOverlayPosition', () => {
  const overlay = { w: 280, h: 360 };
  const viewport = { w: 1440, h: 900 };

  it('keeps in-frame positions unchanged', () => {
    expect(clampOverlayPosition(100, 100, overlay.w, overlay.h, viewport.w, viewport.h)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it('clamps to the top-left margin', () => {
    expect(clampOverlayPosition(-50, -20, overlay.w, overlay.h, viewport.w, viewport.h)).toEqual({
      x: 8,
      y: 8,
    });
  });

  it('clamps to the bottom-right margin', () => {
    expect(clampOverlayPosition(2000, 1000, overlay.w, overlay.h, viewport.w, viewport.h)).toEqual({
      x: viewport.w - overlay.w - 8,
      y: viewport.h - overlay.h - 8,
    });
  });

  it('keeps the pet reachable when the viewport is smaller than the overlay', () => {
    expect(clampOverlayPosition(-100, -100, overlay.w, overlay.h, 200, 200)).toEqual({
      x: 8,
      y: 8,
    });
    expect(clampOverlayPosition(500, 500, overlay.w, overlay.h, 200, 200)).toEqual({
      x: 8,
      y: 8,
    });
  });
});
