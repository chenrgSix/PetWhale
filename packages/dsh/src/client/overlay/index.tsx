import { useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  CompanionEngine,
  CompanionRenderer,
  CompanionRendererOptions,
} from '@petwhale/core';
import { OrbRenderer } from '@petwhale/renderer-orb';
import type { PreferencesStore } from '../settings/preferences-store';
import { OVERLAY_CLASS, PET_CLASS } from '../styles';

/** The shell.overlay entry id (design doc §17). */
export const OVERLAY_ENTRY_ID = 'petwhale';

/** Props injected through the register inject face (design doc §18). */
export interface PetWhaleOverlayProps {
  engine: CompanionEngine;
  preferences: PreferencesStore;
}

/**
 * The shell.overlay entry: an absolutely positioned, click-through overlay
 * containing the pet surface. The orb is mounted imperatively into the
 * `.pw-pet` container — the engine lives in the plugin apply() closure and
 * outlives the component; the renderer is created and disposed with the
 * component so the animation loop never outlives the surface.
 *
 * Preferences (design doc §33) drive the surface reactively: scale / motion
 * re-mount the renderer with fresh options, the anchor moves the overlay,
 * and `enabled: false` unmounts the pet entirely.
 */
export function PetWhaleOverlay({ engine, preferences }: PetWhaleOverlayProps) {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.get);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !prefs.enabled) return;
    const renderer: CompanionRenderer = new OrbRenderer();
    const rendererOptions: CompanionRendererOptions = {
      scale: prefs.scale,
      reducedMotion: !prefs.motion,
    };
    void engine.setRenderer(renderer, container, rendererOptions);
    return () => {
      renderer.dispose();
    };
  }, [engine, prefs.enabled, prefs.scale, prefs.motion]);

  if (!prefs.enabled) return null;

  return (
    <div className={OVERLAY_CLASS} data-anchor={prefs.anchor}>
      <div ref={containerRef} className={PET_CLASS} />
    </div>
  );
}
