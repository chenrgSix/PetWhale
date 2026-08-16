import { useEffect, useRef } from 'react';
import type {
  CompanionEngine,
  CompanionRenderer,
  CompanionRendererOptions,
} from '@petwhale/core';
import { OrbRenderer } from '@petwhale/renderer-orb';
import { OVERLAY_CLASS, PET_CLASS } from '../styles';

/** The shell.overlay entry id (design doc §17). */
export const OVERLAY_ENTRY_ID = 'petwhale';

/** Props injected through the register inject face (design doc §18). */
export interface PetWhaleOverlayProps {
  engine: CompanionEngine;
  rendererOptions?: CompanionRendererOptions;
}

/**
 * The shell.overlay entry: an absolutely positioned, click-through overlay
 * containing the pet surface. The orb is mounted imperatively into the
 * `.pw-pet` container — the engine lives in the plugin apply() closure and
 * outlives the component; the renderer is created and disposed with the
 * component so the animation loop never outlives the surface.
 *
 * Geometry (design doc §18): the layer is click-through; the pet entry opts
 * back into pointer events once interaction lands (M9).
 */
export function PetWhaleOverlay({
  engine,
  rendererOptions,
}: PetWhaleOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const renderer: CompanionRenderer = new OrbRenderer();
    void engine.setRenderer(renderer, container, rendererOptions);
    return () => {
      renderer.dispose();
    };
  }, [engine, rendererOptions]);

  return (
    <div className={OVERLAY_CLASS}>
      <div ref={containerRef} className={PET_CLASS} />
    </div>
  );
}
