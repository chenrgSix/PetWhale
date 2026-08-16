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

const STYLE_TAG_ID = '@petwhale/dsh/overlay';

/**
 * Inject the overlay stylesheet once. The tag carries `data-plugin` so the
 * DSH client module loader removes it on plugin unload.
 * @returns the injected tag, or null when it already exists / DOM is absent.
 */
export function injectOverlayStyle(): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null;
  if (document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`)) {
    return null;
  }
  const tag = document.createElement('style');
  tag.dataset.plugin = '@petwhale/dsh';
  tag.dataset.pluginCss = STYLE_TAG_ID;
  tag.textContent = OVERLAY_CSS;
  document.head.appendChild(tag);
  return tag;
}
