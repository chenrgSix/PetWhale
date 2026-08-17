function normalizeMotionName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
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
