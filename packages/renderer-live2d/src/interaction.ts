function normalizeMotionName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export interface InteractionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InteractionTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export function unionInteractionBounds(
  candidates: Iterable<InteractionBounds>,
): InteractionBounds | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const bounds of candidates) {
    if (
      !Number.isFinite(bounds.x)
      || !Number.isFinite(bounds.y)
      || !Number.isFinite(bounds.width)
      || !Number.isFinite(bounds.height)
      || bounds.width <= 0
      || bounds.height <= 0
    ) continue;
    left = Math.min(left, bounds.x);
    top = Math.min(top, bounds.y);
    right = Math.max(right, bounds.x + bounds.width);
    bottom = Math.max(bottom, bounds.y + bounds.height);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top)) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function padInteractionBounds(
  bounds: InteractionBounds,
  ratio: number,
): InteractionBounds {
  const paddingX = bounds.width * Math.max(0, ratio);
  const paddingY = bounds.height * Math.max(0, ratio);
  return {
    x: bounds.x - paddingX,
    y: bounds.y - paddingY,
    width: bounds.width + paddingX * 2,
    height: bounds.height + paddingY * 2,
  };
}

function applyTransform(
  transform: InteractionTransform,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.tx,
    y: transform.b * point.x + transform.d * point.y + transform.ty,
  };
}

export function transformInteractionBounds(
  bounds: InteractionBounds,
  localTransform: InteractionTransform,
  worldTransform: InteractionTransform,
): InteractionBounds {
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
  ].map(point => applyTransform(worldTransform, applyTransform(localTransform, point)));
  const xs = corners.map(point => point.x);
  const ys = corners.map(point => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function selectHitMotionGroup(
  hitAreas: readonly string[],
  availableGroups: readonly string[],
): string | undefined {
  const groupsByNormalizedName = new Map<string, string>();
  for (const group of availableGroups) {
    const normalized = normalizeMotionName(group);
    if (normalized.length > 0 && !groupsByNormalizedName.has(normalized)) {
      groupsByNormalizedName.set(normalized, group);
    }
  }

  const candidates: string[] = [];
  for (const hitArea of hitAreas) {
    const area = normalizeMotionName(hitArea);
    if (area.length === 0) continue;
    candidates.push(`tap${area}`, `touch${area}`, area);
  }
  candidates.push('tapbody', 'tap', 'touch', 'poke');

  for (const candidate of candidates) {
    const group = groupsByNormalizedName.get(candidate);
    if (group !== undefined) return group;
  }
  return undefined;
}
