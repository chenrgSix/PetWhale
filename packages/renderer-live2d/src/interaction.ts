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
