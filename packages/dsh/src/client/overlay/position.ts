/** Free-form overlay position, in viewport CSS px (design doc §37 drag). */
export interface OverlayPosition {
  x: number;
  y: number;
}

/**
 * Clamp a dragged overlay position into the visible frame so the pet can
 * never be dragged fully off-screen.
 * @param x - requested left edge (CSS px).
 * @param y - requested top edge (CSS px).
 * @param overlayWidth - overlay width (CSS px).
 * @param overlayHeight - overlay height (CSS px).
 * @param viewportWidth - frame width (CSS px).
 * @param viewportHeight - frame height (CSS px).
 * @returns the clamped position.
 */
export function clampOverlayPosition(
  x: number,
  y: number,
  overlayWidth: number,
  overlayHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): OverlayPosition {
  const minX = 8;
  const minY = 8;
  const maxX = Math.max(minX, viewportWidth - overlayWidth - 8);
  const maxY = Math.max(minY, viewportHeight - overlayHeight - 8);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}
