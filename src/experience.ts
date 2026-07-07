export const MAX_LEVEL = 99;

export const XP_FOR_LEVEL: readonly number[] = (() => {
  const thresholds = new Array<number>(MAX_LEVEL + 1).fill(0);
  let points = 0;
  thresholds[1] = 0;
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    points += Math.floor(level + 300 * 2 ** (level / 7));
    thresholds[level + 1] = Math.floor(points / 4);
  }
  return Object.freeze(thresholds);
})();

export function levelForXp(xp: number): number {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  for (let level = MAX_LEVEL; level >= 2; level -= 1) {
    if (safeXp >= (XP_FOR_LEVEL[level] ?? 0)) return level;
  }
  return 1;
}

export function xpProgress(xp: number, level: number): {
  readonly currentLevelXp: number;
  readonly nextLevelXp: number | null;
  readonly remaining: number;
  readonly ratio: number;
} {
  const normalizedLevel = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const currentLevelXp = XP_FOR_LEVEL[normalizedLevel] ?? 0;
  if (normalizedLevel >= MAX_LEVEL) {
    return { currentLevelXp, nextLevelXp: null, remaining: 0, ratio: 1 };
  }
  const nextLevelXp = XP_FOR_LEVEL[normalizedLevel + 1] ?? currentLevelXp;
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  return {
    currentLevelXp,
    nextLevelXp,
    remaining: Math.max(0, nextLevelXp - xp),
    ratio: Math.max(0, Math.min(1, (xp - currentLevelXp) / span)),
  };
}

