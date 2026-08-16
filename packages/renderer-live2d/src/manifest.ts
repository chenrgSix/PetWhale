import type { CompanionState } from '@petwhale/core';

export interface Live2DMotionBinding {
  group: string;
  index?: number;
  loop?: boolean;
}

export type Live2DMotionMap = Partial<Record<CompanionState, Live2DMotionBinding>>;

export interface Live2DPetManifest {
  type: 'live2d';
  id: `custom:${string}`;
  label: string;
  modelUrl: string;
  motions: Live2DMotionMap;
}

function isMotionBinding(value: unknown): value is Live2DMotionBinding {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Partial<Live2DMotionBinding>;
  return (
    typeof binding.group === 'string' &&
    binding.group.length > 0 &&
    (binding.index === undefined || (Number.isInteger(binding.index) && binding.index >= 0)) &&
    (binding.loop === undefined || typeof binding.loop === 'boolean')
  );
}

export function isLive2DPetManifest(value: unknown): value is Live2DPetManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Partial<Live2DPetManifest>;
  return (
    manifest.type === 'live2d' &&
    typeof manifest.id === 'string' &&
    /^custom:[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(manifest.id) &&
    typeof manifest.label === 'string' &&
    manifest.label.trim().length > 0 &&
    manifest.label.length <= 80 &&
    typeof manifest.modelUrl === 'string' &&
    /^petwhale-live2d:\/\/[a-f\d-]+\//i.test(manifest.modelUrl) &&
    manifest.motions !== null &&
    typeof manifest.motions === 'object' &&
    !Array.isArray(manifest.motions) &&
    Object.values(manifest.motions).every((binding) =>
      binding === undefined || isMotionBinding(binding),
    )
  );
}
