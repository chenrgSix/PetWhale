import { useEffect, useRef, useSyncExternalStore } from 'react';
import type {
  CompanionEngine,
  CompanionRenderer,
  CompanionRendererOptions,
} from '@petwhale/core';
import { OrbRenderer } from '@petwhale/renderer-orb';
import {
  SpriteRenderer,
} from '@petwhale/renderer-sprite';
import type { PreferencesStore } from '../settings/preferences-store';
import { petChoiceFromPreferences, petManifestFromPreferences } from '../settings/options';
import { clampOverlayPosition } from './position';
import { LABEL_CLASS, OVERLAY_CLASS, PET_CLASS } from '../styles';

/** The shell.overlay entry id (design doc §17). */
export const OVERLAY_ENTRY_ID = 'petwhale';

/** Props injected through the register inject face (design doc §18). */
export interface PetWhaleOverlayProps {
  engine: CompanionEngine;
  preferences: PreferencesStore;
}

interface DragState {
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

/**
 * The shell.overlay entry: an absolutely positioned, click-through overlay
 * containing the pet surface. The orb is mounted imperatively into the
 * `.pw-pet` container — the engine lives in the plugin apply() closure and
 * outlives the component; the renderer is created and disposed with the
 * component so the animation loop never outlives the surface.
 *
 * Preferences (design doc §33) drive the surface reactively: scale / motion
 * re-mount the renderer with fresh options, `enabled: false` unmounts the
 * pet, and the pet is draggable (M9): the free-form position is clamped to
 * the frame and persisted; `anchor` applies only while no position is saved.
 */
export function PetWhaleOverlay({ engine, preferences }: PetWhaleOverlayProps) {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.get);
  // The current effective snapshot (for the activity label), published by
  // the engine on every renderer update.
  const snapshot = useSyncExternalStore(engine.onUpdate, () => engine.getLastSnapshot());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const pet = petChoiceFromPreferences(prefs);
  const petManifest = petManifestFromPreferences(prefs);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !prefs.enabled) return;
    const renderer: CompanionRenderer = petManifest !== null
      ? new SpriteRenderer(petManifest)
      : new OrbRenderer();
    const rendererOptions: CompanionRendererOptions = {
      scale: prefs.scale,
      reducedMotion: !prefs.motion,
    };
    void engine.setRenderer(renderer, container, rendererOptions);
    return () => {
      renderer.dispose();
    };
  }, [engine, pet, petManifest?.src, prefs.enabled, prefs.scale, prefs.motion]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: overlay.offsetLeft,
      originY: overlay.offsetTop,
    };
    overlay.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const moveOverlay = (clientX: number, clientY: number): void => {
    const drag = dragState.current;
    const overlay = overlayRef.current;
    if (!drag || !overlay) return;
    const next = clampOverlayPosition(
      drag.originX + (clientX - drag.startX),
      drag.originY + (clientY - drag.startY),
      overlay.offsetWidth,
      overlay.offsetHeight,
      window.innerWidth,
      window.innerHeight,
    );
    overlay.style.left = `${next.x}px`;
    overlay.style.top = `${next.y}px`;
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    moveOverlay(event.clientX, event.clientY);
  };

  const endDrag = (clientX: number, clientY: number, pointerId: number): void => {
    const drag = dragState.current;
    const overlay = overlayRef.current;
    dragState.current = null;
    if (!drag || !overlay) return;
    try {
      overlay.releasePointerCapture(pointerId);
    } catch {
      // Capture may already be released (pointercancel).
    }
    const next = clampOverlayPosition(
      drag.originX + (clientX - drag.startX),
      drag.originY + (clientY - drag.startY),
      overlay.offsetWidth,
      overlay.offsetHeight,
      window.innerWidth,
      window.innerHeight,
    );
    preferences.update({ position: next });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    endDrag(event.clientX, event.clientY, event.pointerId);
  };

  if (!prefs.enabled) return null;

  const style = prefs.position
    ? { left: prefs.position.x, top: prefs.position.y, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div
      ref={overlayRef}
      className={OVERLAY_CLASS}
      data-anchor={prefs.position ? undefined : prefs.anchor}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div ref={containerRef} className={PET_CLASS} />
      {snapshot?.activity?.label ? (
        <div className={LABEL_CLASS}>{snapshot.activity.label}</div>
      ) : null}
    </div>
  );
}
