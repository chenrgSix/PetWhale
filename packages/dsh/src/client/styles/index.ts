/**
 * CSS for the PetWhale overlay surface (design doc §18). Injected by the DSH
 * client plugin when the overlay mounts (M2); kept as strings for now.
 */

export const OVERLAY_CLASS = 'pw-overlay';
export const PET_CLASS = 'pw-pet';
export const LABEL_CLASS = 'pw-label';
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
  cursor: grab;
  touch-action: none;
}
.${OVERLAY_CLASS}[data-anchor="bottom-left"] {
  right: auto;
  left: 24px;
}
.${OVERLAY_CLASS}:active {
  cursor: grabbing;
}
.${PET_CLASS} {
  pointer-events: auto;
  width: 100%;
  height: 100%;
}
.${LABEL_CLASS} {
  position: absolute;
  bottom: 6px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  user-select: none;
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
.pw-import-pet {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.pw-import-pet input[type="file"] {
  max-width: 190px;
}
.pw-custom-pets {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pw-custom-pets > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.pw-custom-pets button {
  color: #d94b5b;
}
.pw-error {
  color: #d94b5b;
  font-size: 12px;
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
