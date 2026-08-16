import { useState, useSyncExternalStore } from 'react';
import type { CustomPetId } from '@petwhale/renderer-sprite';
import type { PreferencesStore } from './preferences-store';
import {
  customPetFromFile,
  customPetsFromPreferences,
  preferencePatchWithCustomPet,
  preferencePatchWithoutCustomPet,
} from './custom-pets';
import {
  ANCHOR_OPTIONS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  SLEEP_OPTIONS,
  petChoiceFromPreferences,
  petOptionsFromPreferences,
  preferencePatchForPet,
  type PetChoiceId,
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
  const [importError, setImportError] = useState('');
  const petOptions = petOptionsFromPreferences(prefs);
  const customPets = customPetsFromPreferences(prefs);

  const importPet = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    setImportError('');
    try {
      const pet = await customPetFromFile(file);
      const persisted = preferences.update(preferencePatchWithCustomPet(prefs, pet));
      if (!persisted) setImportError('浏览器存储空间不足；宠物仅在当前会话可用');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const removePet = (id: CustomPetId, label: string): void => {
    if (!window.confirm(`确定删除“${label}”吗？`)) return;
    preferences.update(preferencePatchWithoutCustomPet(prefs, id));
  };

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
        <span>宠物</span>
        <select
          value={petChoiceFromPreferences(prefs)}
          onChange={(event) =>
            preferences.update(
              preferencePatchForPet(
                event.target.value as PetChoiceId,
                prefs.rendererConfig,
              ),
            )
          }
        >
          {petOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="pw-import-pet">
        <span>导入自定义宠物</span>
        <input
          type="file"
          accept="image/png,image/webp,.apng"
          onChange={(event) => {
            void importPet(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {importError ? <div className="pw-error" role="alert">{importError}</div> : null}
      {customPets.length > 0 ? (
        <div className="pw-custom-pets">
          {customPets.map((pet) => (
            <div key={pet.id}>
              <span>{pet.label}</span>
              <button type="button" onClick={() => removePet(pet.id, pet.label)}>删除</button>
            </div>
          ))}
        </div>
      ) : null}

      <label className={ROW_CLASS}>
        <span>位置</span>
        <select
          value={prefs.anchor}
          onChange={(event) =>
            preferences.update({
              anchor: event.target.value as 'bottom-left' | 'bottom-right',
              // A manual anchor choice overrides any dragged position.
              position: undefined,
            })
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
