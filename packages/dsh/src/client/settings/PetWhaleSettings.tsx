import { useSyncExternalStore } from 'react';
import type { PreferencesStore } from './preferences-store';
import {
  ANCHOR_OPTIONS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  SLEEP_OPTIONS,
} from './options';
import { ROW_CLASS, SETTINGS_CLASS } from '../styles';

/** Props injected through the settings.section register inject face. */
export interface PetWhaleSettingsProps {
  preferences: PreferencesStore;
}

/**
 * The PetWhale settings page (design doc §33–§35): one `settings.section`
 * entry. First version persists to localStorage through the shared
 * PreferencesStore; every change notifies the store, which the overlay entry
 * and the plugin body subscribe to.
 */
export function PetWhaleSettings({ preferences }: PetWhaleSettingsProps) {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.get);

  return (
    <div className={SETTINGS_CLASS}>
      <label className={ROW_CLASS}>
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(event) => preferences.update({ enabled: event.target.checked })}
        />
        <span>启用 Companion</span>
      </label>

      <label className={ROW_CLASS}>
        <span>渲染器</span>
        <select
          value={prefs.renderer}
          onChange={(event) => preferences.update({ renderer: event.target.value })}
        >
          <option value="orb">Orb</option>
        </select>
      </label>

      <label className={ROW_CLASS}>
        <span>位置</span>
        <select
          value={prefs.anchor}
          onChange={(event) =>
            preferences.update({ anchor: event.target.value as 'bottom-left' | 'bottom-right' })
          }
        >
          {ANCHOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={ROW_CLASS}>
        <span>缩放</span>
        <input
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={SCALE_STEP}
          value={prefs.scale}
          onChange={(event) => preferences.update({ scale: Number(event.target.value) })}
        />
        <span className="pw-value">{prefs.scale.toFixed(1)}</span>
      </label>

      <label className={ROW_CLASS}>
        <input
          type="checkbox"
          checked={prefs.motion}
          onChange={(event) => preferences.update({ motion: event.target.checked })}
        />
        <span>启用动画</span>
      </label>

      <label className={ROW_CLASS}>
        <span>空闲入睡</span>
        <select
          value={prefs.sleepAfterMs}
          onChange={(event) => preferences.update({ sleepAfterMs: Number(event.target.value) })}
        >
          {SLEEP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
