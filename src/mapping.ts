import { levelForXp } from "./experience";

export interface ClientFieldMap {
  readonly build: string;
  readonly skills: {
    readonly xp: string;
    readonly current: string;
    readonly base: string;
  };
  readonly session: {
    readonly ingame: string;
  };
  readonly player: {
    readonly local: string;
    readonly localX: string;
    readonly localZ: string;
    readonly level: string;
    readonly name: string;
    readonly combatLevel: string;
    readonly baseX: string;
    readonly baseZ: string;
    readonly plane: string;
    readonly animation: string;
    readonly targetIndex: string;
    readonly pathX: string;
    readonly pathZ: string;
    readonly pathLength: string;
  };
  readonly npcs: {
    readonly table: string;
    readonly activeIndices: string;
    readonly activeCount: string;
    readonly type: string;
    readonly id: string;
    readonly name: string;
    readonly healthRatio: string;
    readonly healthScale: string;
  };
  readonly players: {
    readonly table: string;
    readonly activeIndices: string;
    readonly activeCount: string;
  };
  readonly groundItems: {
    readonly grid: string;
    readonly sentinel: string;
    readonly next: string;
    readonly id: string;
    readonly count: string;
  };
  readonly chat: {
    readonly types: string;
    readonly senders: string;
    readonly messages: string;
  };
  readonly combat: {
    readonly state: string;
    readonly attackStyleIndex: number;
  };
  readonly menu: {
    readonly count: string;
    readonly options: string;
    readonly opcodes: string;
    readonly identifiers: string;
  };
  readonly scene: {
    readonly graph: string;
    readonly tag: string;
    readonly info: string;
    readonly getters: {
      readonly wall: string;
      readonly wallDecoration: string;
      readonly object: string;
      readonly groundDecoration: string;
    };
  };
  readonly projection: {
    readonly heights: string;
    readonly renderFlags: string;
    readonly cameraX: string;
    readonly cameraHeight: string;
    readonly cameraZ: string;
    readonly yaw: string;
    readonly pitch: string;
    readonly mouseX: string;
    readonly mouseY: string;
  };
}

export const CURRENT_FIELD_MAP: ClientFieldMap = Object.freeze({
  build: "client.js?v=20260702c",
  skills: { xp: "Fz", current: "Dz", base: "Ez" },
  session: { ingame: "Xr" },
  player: {
    local: "tz",
    localX: "x",
    localZ: "z",
    level: "level",
    name: "name",
    combatLevel: "Vo",
    baseX: "ev",
    baseZ: "fv",
    plane: "xn",
    animation: "so",
    targetIndex: "mo",
    pathX: "Mo",
    pathZ: "No",
    pathLength: "Lo",
  },
  npcs: {
    table: "Nu",
    activeIndices: "Pu",
    activeCount: "Ou",
    type: "type",
    id: "id",
    name: "name",
    healthRatio: "eo",
    healthScale: "fo",
  },
  players: { table: "mz", activeIndices: "oz", activeCount: "nz" },
  groundItems: { grid: "zz", sentinel: "Y", next: "next", id: "id", count: "count" },
  chat: { types: "DA", senders: "EA", messages: "FA" },
  combat: { state: "lA", attackStyleIndex: 43 },
  menu: { count: "Jz", options: "Tz", opcodes: "Rz", identifiers: "Sz" },
  scene: {
    graph: "nv",
    tag: "Jk",
    info: "Kk",
    getters: { wall: "Rm", wallDecoration: "Sm", object: "Tm", groundDecoration: "Um" },
  },
  projection: {
    heights: "jm",
    renderFlags: "yn",
    cameraX: "xy",
    cameraHeight: "yy",
    cameraZ: "zy",
    yaw: "By",
    pitch: "Ay",
    mouseX: "Lc",
    mouseY: "Mc",
  },
});

export interface ResolvedSkills {
  readonly xpField: string;
  readonly currentField: string;
  readonly baseField: string;
  readonly source: "mapped-field" | "adaptive";
  readonly xp: readonly number[];
  readonly current: readonly number[];
  readonly base: readonly number[];
}

export interface SkillResolution {
  readonly resolved: ResolvedSkills | null;
  readonly failures: readonly string[];
  readonly candidates: readonly string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getField(target: unknown, name: string): unknown {
  if (!isRecord(target)) return undefined;
  return Reflect.get(target, name);
}

function getOwnDataField(target: Record<string, unknown>, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

export function readFiniteNumbers(value: unknown, expectedLength?: number): readonly number[] | null {
  if (value === null || value === undefined || typeof value === "string") return null;
  const length = getArrayLikeLength(value);
  if (length === null || (expectedLength !== undefined && length !== expectedLength)) return null;
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const item = Reflect.get(Object(value), String(index));
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    result.push(item);
  }
  return result;
}

export function getArrayLikeLength(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "function" || typeof value === "string") return null;
  const length = Reflect.get(Object(value), "length");
  return typeof length === "number" && Number.isInteger(length) && length >= 0 ? length : null;
}

function isXpArray(values: readonly number[]): boolean {
  return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 1_000_000_000);
}

function isLevelArray(values: readonly number[]): boolean {
  return values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255);
}

function baseMatchesXp(xp: readonly number[], base: readonly number[]): number {
  let matches = 0;
  for (let index = 0; index < xp.length; index += 1) {
    const level = base[index] ?? 0;
    if (level === 0 && (xp[index] ?? 0) === 0) matches += 1;
    else if (levelForXp(xp[index] ?? 0) === level) matches += 1;
  }
  return matches;
}

function currentMatchesBase(current: readonly number[], base: readonly number[]): number {
  let score = 0;
  for (let index = 0; index < current.length; index += 1) {
    const difference = Math.abs((current[index] ?? 0) - (base[index] ?? 0));
    if (difference === 0) score += 2;
    else if (difference <= 20) score += 1;
  }
  return score;
}

function validateTriplet(
  xp: readonly number[] | null,
  current: readonly number[] | null,
  base: readonly number[] | null,
): boolean {
  if (!xp || !current || !base || !isXpArray(xp) || !isLevelArray(current) || !isLevelArray(base)) return false;
  return baseMatchesXp(xp, base) >= 18;
}

export function resolveSkillFields(client: unknown, mapping: ClientFieldMap = CURRENT_FIELD_MAP): SkillResolution {
  const failures: string[] = [];
  if (!isRecord(client)) {
    return { resolved: null, failures: ["gameClient is not available"], candidates: [] };
  }

  const mappedXp = readFiniteNumbers(getField(client, mapping.skills.xp), 21);
  const mappedCurrent = readFiniteNumbers(getField(client, mapping.skills.current), 21);
  const mappedBase = readFiniteNumbers(getField(client, mapping.skills.base), 21);
  if (validateTriplet(mappedXp, mappedCurrent, mappedBase)) {
    return {
      resolved: {
        xpField: mapping.skills.xp,
        currentField: mapping.skills.current,
        baseField: mapping.skills.base,
        source: "mapped-field",
        xp: mappedXp ?? [],
        current: mappedCurrent ?? [],
        base: mappedBase ?? [],
      },
      failures,
      candidates: [mapping.skills.xp, mapping.skills.current, mapping.skills.base],
    };
  }
  failures.push("Configured skill fields failed their 21-skill shape or XP/level validation.");

  const numericArrays = Reflect.ownKeys(client)
    .filter((key): key is string => typeof key === "string")
    .map((name) => ({ name, values: readFiniteNumbers(getOwnDataField(client, name), 21) }))
    .filter((entry): entry is { name: string; values: readonly number[] } => entry.values !== null);
  const xpCandidates = numericArrays.filter((entry) => isXpArray(entry.values));
  const levelCandidates = numericArrays.filter((entry) => isLevelArray(entry.values));
  const matches: Array<{ xp: typeof numericArrays[number]; current: typeof numericArrays[number]; base: typeof numericArrays[number]; score: number }> = [];

  for (const xp of xpCandidates) {
    for (const base of levelCandidates) {
      if (xp.name === base.name) continue;
      const baseScore = baseMatchesXp(xp.values, base.values);
      if (baseScore < 18) continue;
      for (const current of levelCandidates) {
        if (current.name === xp.name || current.name === base.name) continue;
        matches.push({ xp, current, base, score: baseScore * 3 + currentMatchesBase(current.values, base.values) });
      }
    }
  }
  matches.sort((left, right) => right.score - left.score);
  const best = matches[0];
  const second = matches[1];
  if (!best || (second && best.score === second.score)) {
    failures.push(best ? "Adaptive skill mapping was ambiguous." : "No adaptive skill mapping satisfied validation.");
    return { resolved: null, failures, candidates: numericArrays.map((entry) => entry.name) };
  }
  return {
    resolved: {
      xpField: best.xp.name,
      currentField: best.current.name,
      baseField: best.base.name,
      source: "adaptive",
      xp: best.xp.values,
      current: best.current.values,
      base: best.base.values,
    },
    failures,
    candidates: numericArrays.map((entry) => entry.name),
  };
}
