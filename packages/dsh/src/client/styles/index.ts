/**
 * CSS for the PetWhale overlay surface (design doc §18). Injected by the DSH
 * client plugin when the overlay mounts (M2); kept as strings for now.
 */

export const OVERLAY_CLASS = 'pw-overlay';
export const PET_CLASS = 'pw-pet';

export const OVERLAY_CSS = `
.${OVERLAY_CLASS} {
  position: absolute;
  right: 24px;
  bottom: 20px;
  width: 280px;
  height: 360px;
  pointer-events: none;
  z-index: 40;
}
.${PET_CLASS} {
  pointer-events: auto;
  width: 100%;
  height: 100%;
}
`;
