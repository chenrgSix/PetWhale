import type { SlotComponentCompat } from '../types/dsh-compat';

/** The shell.overlay entry id (design doc §17). */
export const OVERLAY_ENTRY_ID = 'petwhale';

/**
 * The shell.overlay entry component.
 *
 * M0/M2 status: this placeholder returns nothing yet. M2 mounts the real
 * surface — the engine + OrbRenderer inside a `.pw-pet` container, styled per
 * design doc §18:
 *
 *   .pw-overlay { position:absolute; right:24px; bottom:20px; width:280px;
 *                 height:360px; pointer-events:none }
 *   .pw-pet     { pointer-events:auto }
 *
 * The overlay layer is click-through by design; the pet entry opts back into
 * pointer events once interaction lands (M9).
 */
export const PetWhaleOverlay: SlotComponentCompat = () => {
  // TODO(M2): mount <PetWhaleSurface> (OrbRenderer + CompanionEngine) here.
  return null;
};
