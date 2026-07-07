export const SKILL_NAMES = Object.freeze([
  "Attack",
  "Defence",
  "Strength",
  "Hitpoints",
  "Ranged",
  "Prayer",
  "Magic",
  "Cooking",
  "Woodcutting",
  "Fletching",
  "Fishing",
  "Firemaking",
  "Crafting",
  "Smithing",
  "Mining",
  "Herblore",
  "Agility",
  "Thieving",
  "Slayer",
  "Farming",
  "Runecraft",
] as const);

export type SkillName = (typeof SKILL_NAMES)[number];

export type Capability =
  | "session"
  | "skills"
  | "player"
  | "npcs"
  | "players"
  | "groundItems"
  | "chat"
  | "sceneObjects"
  | "inventoryLookup"
  | "varps"
  | "projection"
  | "animation"
  | "opponent"
  | "bankItems"
  | "attackStyle";

export type SnapshotSlice = "skills" | "npcs" | "players" | "groundItems" | "chat" | "sceneObjects" | "tiles";

export interface CapabilityStatus {
  readonly available: boolean;
  readonly source: "public-api" | "mapped-field" | "adaptive" | "unavailable";
  readonly reason?: string;
}

export type CapabilityMap = Readonly<Record<Capability, CapabilityStatus>>;

export interface WorldTile {
  readonly x: number;
  readonly z: number;
  readonly level: number;
}

export interface SkillState {
  readonly id: number;
  readonly name: SkillName;
  readonly xp: number;
  readonly currentLevel: number;
  readonly baseLevel: number;
}

export interface PlayerState {
  readonly tile: WorldTile | null;
  readonly runEnergy: number | null;
  readonly running: boolean | null;
  readonly animation: number | null;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ProjectedTileState {
  readonly tile: WorldTile;
  readonly points: readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
  readonly playerTile: boolean;
}

export interface OpponentState {
  readonly slot: number;
  readonly id: number | null;
  readonly name: string | null;
  readonly healthRatio: number;
  readonly healthScale: number;
  readonly healthPercent: number;
  readonly animation: number | null;
}

export const ATTACK_STYLE_NAMES = Object.freeze(["Chop", "Slash", "Lunge", "Block"] as const);
export type AttackStyleName = (typeof ATTACK_STYLE_NAMES)[number];

export interface AttackStyleState {
  readonly index: number;
  readonly name: AttackStyleName;
}

export interface NpcState {
  readonly slot: number;
  readonly id: number | null;
  readonly name: string | null;
  readonly tile: WorldTile;
}

export interface NearbyPlayerState {
  readonly slot: number;
  readonly name: string | null;
  readonly combatLevel: number | null;
  readonly tile: WorldTile;
  readonly local: boolean;
}

export interface GroundItemState {
  readonly id: number;
  readonly count: number;
  readonly name: string | null;
  readonly tile: WorldTile;
}

export interface ProjectedGroundItemState extends GroundItemState {
  readonly point: ScreenPoint;
}

export interface ProjectedPlayerState extends NearbyPlayerState {
  readonly point: ScreenPoint;
}

export interface ChatMessageState {
  readonly index: number;
  readonly type: number;
  readonly sender: string | null;
  readonly text: string;
}

export type SceneObjectKind = "wall" | "wallDecoration" | "object" | "groundDecoration";

export interface SceneObjectState {
  readonly id: number;
  readonly tag: number;
  readonly kind: SceneObjectKind;
  readonly orientation: number | null;
  readonly tile: WorldTile;
}

export interface ClientSnapshot {
  readonly at: number;
  readonly visible: boolean;
  readonly ingame: boolean;
  readonly username: string | null;
  readonly skills: readonly SkillState[] | null;
  readonly player: PlayerState | null;
  readonly opponent: OpponentState | null;
  readonly attackStyle: AttackStyleState | null;
  readonly tiles?: readonly ProjectedTileState[];
  readonly npcs?: readonly NpcState[];
  readonly players?: readonly NearbyPlayerState[];
  readonly groundItems?: readonly GroundItemState[];
  readonly chat?: readonly ChatMessageState[];
  readonly sceneObjects?: readonly SceneObjectState[];
}

export interface ObserverUpdate {
  readonly snapshot: ClientSnapshot | null;
  readonly previous: ClientSnapshot | null;
  readonly capabilities: CapabilityMap;
  readonly activeDeltaMs: number;
  readonly clientChanged: boolean;
}

export interface MappingReportEntry {
  readonly name: string;
  readonly type: string;
  readonly length?: number;
}

export interface MappingReport {
  readonly clientBuild: string;
  readonly generatedAt: string;
  readonly clientAvailable: boolean;
  readonly resolvedFields: Readonly<Record<string, string | null>>;
  readonly capabilities: CapabilityMap;
  readonly properties: readonly MappingReportEntry[];
  readonly prototypeMethods: readonly string[];
  readonly validationFailures: readonly string[];
}

export interface SolanascapeDeckFacade {
  readonly version: string;
  getCapabilities(): CapabilityMap;
  getMappingReport(): MappingReport;
  resetXpSession(): void;
}

declare global {
  const __SOLANASCAPE_DECK_VERSION__: string;

  interface Window {
    gameClient?: unknown;
    SolanascapeDeck?: SolanascapeDeckFacade;
  }
}
