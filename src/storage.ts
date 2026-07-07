export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class JsonStorage {
  constructor(
    private readonly storage: StorageLike,
    private readonly prefix = "solanascape-deck:",
    private readonly fallbackPrefixes: readonly string[] = Object.freeze(["solanalite:"]),
  ) {}

  read<T>(key: string): T | null {
    for (const prefix of [this.prefix, ...this.fallbackPrefixes]) {
      try {
        const raw = this.storage.getItem(prefix + key);
        if (raw !== null) return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }
    return null;
  }

  write(key: string, value: unknown): boolean {
    try {
      this.storage.setItem(this.prefix + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): boolean {
    try {
      this.storage.removeItem(this.prefix + key);
      return true;
    } catch {
      return false;
    }
  }
}

export interface UiSettings {
  readonly version: 13;
  readonly panelX: number | null;
  readonly panelY: number | null;
  readonly collapsed: boolean;
  readonly showAllSkills: boolean;
  readonly showXpDrops: boolean;
  readonly showXpGlobes: boolean;
  readonly placement: "canvas" | "floating";
  readonly showOpponentInfo: boolean;
  readonly showHoveredTile: boolean;
  readonly showDestinationTile: boolean;
  readonly showGroundItemLabels: boolean;
  readonly showPlayerNames: boolean;
  readonly showClueLocator: boolean;
  readonly showAttackStyle: boolean;
  readonly hideDefensiveStyle: boolean;
  readonly hitpointsAlerts: boolean;
  readonly prayerAlerts: boolean;
  readonly menuSwapperEnabled: boolean;
  readonly menuPlayerAttack: boolean;
  readonly menuNpcAttack: boolean;
  readonly menuPickpocket: boolean;
  readonly menuShopBuy10: boolean;
  readonly menuPetClickThrough: boolean;
}

export const DEFAULT_SETTINGS: UiSettings = Object.freeze({
  version: 13,
  panelX: null,
  panelY: null,
  collapsed: true,
  showAllSkills: false,
  showXpDrops: true,
  showXpGlobes: true,
  placement: "canvas",
  showOpponentInfo: true,
  showHoveredTile: false,
  showDestinationTile: true,
  showGroundItemLabels: true,
  showPlayerNames: true,
  showClueLocator: true,
  showAttackStyle: true,
  hideDefensiveStyle: false,
  hitpointsAlerts: true,
  prayerAlerts: true,
  menuSwapperEnabled: true,
  menuPlayerAttack: true,
  menuNpcAttack: true,
  menuPickpocket: false,
  menuShopBuy10: true,
  menuPetClickThrough: true,
});

const BOOLEAN_KEYS = Object.freeze([
  "collapsed",
  "showAllSkills",
  "showXpDrops",
  "showXpGlobes",
  "showOpponentInfo",
  "showHoveredTile",
  "showDestinationTile",
  "showGroundItemLabels",
  "showPlayerNames",
  "showClueLocator",
  "showAttackStyle",
  "hideDefensiveStyle",
  "hitpointsAlerts",
  "prayerAlerts",
  "menuSwapperEnabled",
  "menuPlayerAttack",
  "menuNpcAttack",
  "menuPickpocket",
  "menuShopBuy10",
  "menuPetClickThrough",
] as const satisfies readonly (keyof UiSettings)[]);

function validCoordinate(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function validateCurrent(value: unknown): UiSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 13 ||
    !validCoordinate(candidate.panelX) ||
    !validCoordinate(candidate.panelY) ||
    (candidate.placement !== "canvas" && candidate.placement !== "floating") ||
    BOOLEAN_KEYS.some((key) => typeof candidate[key] !== "boolean")
  ) return null;
  return Object.freeze({ ...DEFAULT_SETTINGS, ...candidate, version: 13 }) as UiSettings;
}

function migrateLegacy(value: unknown): UiSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const version = candidate.version;
  if (typeof version !== "number" || version < 1 || version > 12) return null;
  const migrated: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of BOOLEAN_KEYS) {
    if (typeof candidate[key] === "boolean") migrated[key] = candidate[key];
  }
  if (validCoordinate(candidate.panelX)) migrated.panelX = candidate.panelX;
  if (validCoordinate(candidate.panelY)) migrated.panelY = candidate.panelY;
  if (candidate.placement === "canvas" || candidate.placement === "floating") migrated.placement = candidate.placement;
  migrated.version = 13;
  return Object.freeze(migrated) as unknown as UiSettings;
}

export class SettingsStore {
  private value: UiSettings;

  constructor(private readonly storage: JsonStorage) {
    this.value = validateCurrent(storage.read<unknown>("settings:v13")) ??
      migrateLegacy(storage.read<unknown>("settings:v12")) ??
      migrateLegacy(storage.read<unknown>("settings:v11")) ??
      migrateLegacy(storage.read<unknown>("settings:v10")) ??
      migrateLegacy(storage.read<unknown>("settings:v9")) ??
      migrateLegacy(storage.read<unknown>("settings:v8")) ??
      migrateLegacy(storage.read<unknown>("settings:v7")) ??
      migrateLegacy(storage.read<unknown>("settings:v6")) ??
      migrateLegacy(storage.read<unknown>("settings:v5")) ??
      migrateLegacy(storage.read<unknown>("settings:v4")) ??
      migrateLegacy(storage.read<unknown>("settings:v3")) ??
      migrateLegacy(storage.read<unknown>("settings:v2")) ??
      migrateLegacy(storage.read<unknown>("settings:v1")) ??
      DEFAULT_SETTINGS;
    this.storage.write("settings:v13", this.value);
  }

  get(): UiSettings {
    return this.value;
  }

  update(patch: Partial<Omit<UiSettings, "version">>): UiSettings {
    this.value = Object.freeze({ ...this.value, ...patch, version: 13 });
    this.storage.write("settings:v13", this.value);
    return this.value;
  }

  reset(): UiSettings {
    this.value = DEFAULT_SETTINGS;
    this.storage.write("settings:v13", this.value);
    return this.value;
  }
}
