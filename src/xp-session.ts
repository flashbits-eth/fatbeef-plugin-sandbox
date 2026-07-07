import type { SkillState } from "./types";

export interface PersistedXpSession {
  readonly version: 1;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly baselineXp: readonly number[];
  readonly currentXp: readonly number[];
  readonly activeMs: number;
  readonly firstGainActiveMs: readonly (number | null)[];
  readonly lastGainAt: readonly (number | null)[];
}

export interface XpSessionSkillView {
  readonly gained: number;
  readonly xpPerHour: number;
  readonly firstGainActiveMs: number | null;
  readonly lastGainAt: number | null;
}

export interface XpSessionView {
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly activeMs: number;
  readonly totalGained: number;
  readonly skills: readonly XpSessionSkillView[];
}

export interface XpUpdateResult {
  readonly initialized: boolean;
  readonly gained: boolean;
  readonly rebased: boolean;
  readonly changed: boolean;
}

const SKILL_COUNT = 21;

function xpVector(skills: readonly SkillState[]): readonly number[] {
  return Object.freeze(skills.map((skill) => Math.max(0, Math.floor(skill.xp))));
}

function validVector(value: unknown, nullable = false): boolean {
  return (
    Array.isArray(value) &&
    value.length === SKILL_COUNT &&
    value.every((item) => (nullable && item === null) || (typeof item === "number" && Number.isFinite(item) && item >= 0))
  );
}

export function validatePersistedSession(value: unknown): PersistedXpSession | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<PersistedXpSession>;
  if (
    candidate.version !== 1 ||
    typeof candidate.startedAt !== "number" ||
    typeof candidate.updatedAt !== "number" ||
    typeof candidate.activeMs !== "number" ||
    !Number.isFinite(candidate.activeMs) ||
    candidate.activeMs < 0 ||
    !validVector(candidate.baselineXp) ||
    !validVector(candidate.currentXp) ||
    !validVector(candidate.firstGainActiveMs, true) ||
    !validVector(candidate.lastGainAt, true)
  ) {
    return null;
  }
  return Object.freeze({
    version: 1,
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
    baselineXp: Object.freeze([...(candidate.baselineXp ?? [])]),
    currentXp: Object.freeze([...(candidate.currentXp ?? [])]),
    activeMs: candidate.activeMs,
    firstGainActiveMs: Object.freeze([...(candidate.firstGainActiveMs ?? [])]),
    lastGainAt: Object.freeze([...(candidate.lastGainAt ?? [])]),
  });
}

export class XpSessionEngine {
  private data: PersistedXpSession | null = null;

  load(value: unknown, skills: readonly SkillState[], at: number): XpUpdateResult {
    const validated = validatePersistedSession(value);
    const current = xpVector(skills);
    if (!validated || validated.currentXp.some((xp, index) => xp > (current[index] ?? 0))) {
      this.data = this.create(current, at);
      return Object.freeze({ initialized: true, gained: false, rebased: validated !== null, changed: true });
    }
    this.data = validated;
    return Object.freeze({ initialized: true, gained: false, rebased: false, changed: false });
  }

  reset(skills: readonly SkillState[], at: number): void {
    this.data = this.create(xpVector(skills), at);
  }

  update(skills: readonly SkillState[], activeDeltaMs: number, at: number): XpUpdateResult {
    const current = xpVector(skills);
    if (!this.data) {
      this.data = this.create(current, at);
      return Object.freeze({ initialized: true, gained: false, rebased: false, changed: true });
    }
    if (this.data.currentXp.some((xp, index) => xp > (current[index] ?? 0))) {
      this.data = this.create(current, at);
      return Object.freeze({ initialized: false, gained: false, rebased: true, changed: true });
    }

    const safeDelta = Number.isFinite(activeDeltaMs) ? Math.max(0, Math.min(5_000, activeDeltaMs)) : 0;
    const activeMs = this.data.activeMs + safeDelta;
    const firstGainActiveMs = [...this.data.firstGainActiveMs];
    const lastGainAt = [...this.data.lastGainAt];
    let gained = false;
    for (let index = 0; index < SKILL_COUNT; index += 1) {
      if ((current[index] ?? 0) > (this.data.currentXp[index] ?? 0)) {
        gained = true;
        if (firstGainActiveMs[index] === null) firstGainActiveMs[index] = activeMs;
        lastGainAt[index] = at;
      }
    }
    const changed = gained || safeDelta > 0;
    if (changed) {
      this.data = Object.freeze({
        ...this.data,
        updatedAt: at,
        currentXp: current,
        activeMs,
        firstGainActiveMs: Object.freeze(firstGainActiveMs),
        lastGainAt: Object.freeze(lastGainAt),
      });
    }
    return Object.freeze({ initialized: false, gained, rebased: false, changed });
  }

  getPersisted(): PersistedXpSession | null {
    return this.data;
  }

  getView(): XpSessionView | null {
    if (!this.data) return null;
    let totalGained = 0;
    const skills = this.data.currentXp.map((xp, index) => {
      const gained = Math.max(0, xp - (this.data?.baselineXp[index] ?? xp));
      totalGained += gained;
      const firstGainActiveMs = this.data?.firstGainActiveMs[index] ?? null;
      const elapsed = firstGainActiveMs === null ? 0 : Math.max(0, (this.data?.activeMs ?? 0) - firstGainActiveMs);
      const xpPerHour = gained > 0 && elapsed > 0 ? Math.floor((gained * 3_600_000) / elapsed) : 0;
      return Object.freeze({
        gained,
        xpPerHour,
        firstGainActiveMs,
        lastGainAt: this.data?.lastGainAt[index] ?? null,
      });
    });
    return Object.freeze({
      startedAt: this.data.startedAt,
      updatedAt: this.data.updatedAt,
      activeMs: this.data.activeMs,
      totalGained,
      skills: Object.freeze(skills),
    });
  }

  private create(xp: readonly number[], at: number): PersistedXpSession {
    return Object.freeze({
      version: 1,
      startedAt: at,
      updatedAt: at,
      baselineXp: Object.freeze([...xp]),
      currentXp: Object.freeze([...xp]),
      activeMs: 0,
      firstGainActiveMs: Object.freeze(new Array<number | null>(SKILL_COUNT).fill(null)),
      lastGainAt: Object.freeze(new Array<number | null>(SKILL_COUNT).fill(null)),
    });
  }
}

export async function hashUsername(username: string): Promise<string> {
  const normalized = username.trim().toLowerCase();
  if (normalized.length === 0) return "anonymous";
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

