/**
 * CSS for the PetWhale overlay surface (design doc §18). Injected by the DSH
 * client plugin when the overlay mounts (M2); kept as strings for now.
 */

export const OVERLAY_CLASS = 'pw-overlay';
export const PET_CLASS = 'pw-pet';
export const SETTINGS_CLASS = 'pw-settings';
export const ROW_CLASS = 'pw-row';

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
.${OVERLAY_CLASS}[data-anchor="bottom-left"] {
  right: auto;
  left: 24px;
}
.${PET_CLASS} {
  pointer-events: auto;
  width: 100%;
  height: 100%;
}
`;

export const SETTINGS_CSS = `
.${SETTINGS_CLASS} {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 2px;
}
.${ROW_CLASS} {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.${ROW_CLASS} span {
  flex: 0 0 auto;
}
.${ROW_CLASS} input[type="range"] {
  flex: 1 1 auto;
}
.${ROW_CLASS} select {
  max-width: 160px;
}
.pw-value {
  min-width: 2.5em;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
`;

const STYLE_TAG_ID = '@petwhale/dsh/overlay';
const SETTINGS_STYLE_TAG_ID = '@petwhale/dsh/settings';

function injectStyleTag(tagId: string, css: string): HTMLStyleElement | null {
  if (typeof document === 'undefined') return null;
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`)) {
    return null;
  }
  const tag = document.createElement('style');
  tag.dataset.plugin = '@petwhale/dsh';
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
  return tag;
}

/**
 * Inject the overlay stylesheet once. The tag carries `data-plugin` so the
 * DSH client module loader removes it on plugin unload.
 * @returns the injected tag, or null when it already exists / DOM is absent.
 */
export function injectOverlayStyle(): HTMLStyleElement | null {
  return injectStyleTag(STYLE_TAG_ID, OVERLAY_CSS);
}

/**
 * Inject the settings-page stylesheet (same data-plugin cleanup contract).
 * @returns the injected tag, or null when it already exists / DOM is absent.
 */
export function injectSettingsStyle(): HTMLStyleElement | null {
  return injectStyleTag(SETTINGS_STYLE_TAG_ID, SETTINGS_CSS);
}
