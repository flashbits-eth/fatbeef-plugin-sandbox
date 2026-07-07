import {
  CURRENT_FIELD_MAP,
  type ClientFieldMap,
  getArrayLikeLength,
  getField,
  isRecord,
  readFiniteNumbers,
  resolveSkillFields,
  type ResolvedSkills,
} from "./mapping";
import {
  ATTACK_STYLE_NAMES,
  type AttackStyleState,
  SKILL_NAMES,
  type Capability,
  type CapabilityMap,
  type CapabilityStatus,
  type ChatMessageState,
  type ClientSnapshot,
  type GroundItemState,
  type NearbyPlayerState,
  type NpcState,
  type OpponentState,
  type PlayerState,
  type ProjectedGroundItemState,
  type ProjectedPlayerState,
  type ProjectedTileState,
  type ScreenPoint,
  type SceneObjectKind,
  type SceneObjectState,
  type SkillState,
  type SnapshotSlice,
  type WorldTile,
} from "./types";
import { STANDARD_ITEM_NAMES } from "./item-name-data";

const CAPABILITIES: readonly Capability[] = Object.freeze([
  "session",
  "skills",
  "player",
  "npcs",
  "players",
  "groundItems",
  "chat",
  "sceneObjects",
  "inventoryLookup",
  "varps",
  "projection",
  "animation",
  "opponent",
  "bankItems",
  "attackStyle",
]);

type MutableCapabilities = Record<Capability, CapabilityStatus>;

function available(source: CapabilityStatus["source"]): CapabilityStatus {
  return Object.freeze({ available: true, source });
}

function unavailable(reason: string): CapabilityStatus {
  return Object.freeze({ available: false, source: "unavailable", reason });
}

function freezeList<T>(values: T[]): readonly T[] {
  for (const value of values) {
    if (typeof value === "object" && value !== null) Object.freeze(value);
  }
  return Object.freeze(values);
}

function numericField(target: unknown, name: string): number | null {
  const value = getField(target, name);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringField(target: unknown, name: string): string | null {
  const value = getField(target, name);
  return typeof value === "string" ? value : null;
}

function booleanField(target: unknown, name: string): boolean | null {
  const value = getField(target, name);
  return typeof value === "boolean" ? value : null;
}

function indexValue(target: unknown, index: number): unknown {
  if (target === null || target === undefined) return undefined;
  return Reflect.get(Object(target), String(index));
}

function hasMethod(target: unknown, name: string): boolean {
  return typeof getField(target, name) === "function";
}

function callReadMethod(target: unknown, name: string, args: readonly unknown[] = []): unknown {
  const method = getField(target, name);
  if (typeof method !== "function") return undefined;
  try {
    return Reflect.apply(method, target, args);
  } catch {
    return undefined;
  }
}

function validTile(value: unknown): WorldTile | null {
  if (!isRecord(value)) return null;
  const x = numericField(value, "x");
  const z = numericField(value, "z");
  const level = numericField(value, "level");
  if (x === null || z === null || level === null) return null;
  return Object.freeze({ x: Math.floor(x), z: Math.floor(z), level: Math.floor(level) });
}

function validIndexCollection(value: unknown, minimumLength = 1): boolean {
  const length = getArrayLikeLength(value);
  return length !== null && length >= minimumLength;
}

export class SolanaClientAdapter {
  readonly mapping: ClientFieldMap;
  readonly client: unknown;
  private skills: ResolvedSkills | null = null;
  private cachedSkillInputs: Pick<ResolvedSkills, "xp" | "current" | "base"> | null = null;
  private cachedSkillStates: readonly SkillState[] | null = null;
  private readonly validationFailures = new Set<string>();
  private capabilities: MutableCapabilities;
  private lastCapabilityRefreshAt = 0;
  private readonly itemNameCache = new Map<number, string | null>();

  constructor(client: unknown, mapping: ClientFieldMap = CURRENT_FIELD_MAP) {
    this.client = client;
    this.mapping = mapping;
    this.capabilities = this.detectCapabilities();
    this.lastCapabilityRefreshAt = Date.now();
  }

  getCapabilities(): CapabilityMap {
    return Object.freeze({ ...this.capabilities });
  }

  getResolvedFields(): Readonly<Record<string, string | null>> {
    return Object.freeze({
      skillXp: this.skills?.xpField ?? null,
      skillCurrent: this.skills?.currentField ?? null,
      skillBase: this.skills?.baseField ?? null,
      localPlayer: this.mapping.player.local,
      npcTable: this.mapping.npcs.table,
      playerTable: this.mapping.players.table,
      groundItems: this.mapping.groundItems.grid,
      chatTypes: this.mapping.chat.types,
      chatSenders: this.mapping.chat.senders,
      chatMessages: this.mapping.chat.messages,
      sceneGraph: this.mapping.scene.graph,
      attackStyleState: this.mapping.combat.state,
      playerAnimation: this.mapping.player.animation,
      opponentIndex: this.mapping.player.targetIndex,
      playerPathX: this.mapping.player.pathX,
      playerPathZ: this.mapping.player.pathZ,
      playerPathLength: this.mapping.player.pathLength,
      projectionHeights: this.mapping.projection.heights,
    });
  }

  getValidationFailures(): readonly string[] {
    return Object.freeze([...this.validationFailures]);
  }

  readSnapshot(at: number, visible: boolean, slices: ReadonlySet<SnapshotSlice>): ClientSnapshot {
    if (at - this.lastCapabilityRefreshAt >= 2_000 || at < this.lastCapabilityRefreshAt) {
      this.capabilities = this.detectCapabilities();
      this.lastCapabilityRefreshAt = at;
    }
    const ingame = this.readIngame();
    const skills = slices.has("skills") ? this.readSkills() : null;
    const player = this.readPlayer();
    const attackStyle = this.readAttackStyle();
    const username = this.readUsername();
    const optional: {
      npcs?: ClientSnapshot["npcs"];
      players?: ClientSnapshot["players"];
      groundItems?: ClientSnapshot["groundItems"];
      chat?: ClientSnapshot["chat"];
      sceneObjects?: ClientSnapshot["sceneObjects"];
      tiles?: ClientSnapshot["tiles"];
    } = {};
    if (slices.has("npcs") && this.capabilities.npcs.available) optional.npcs = this.readNpcs();
    if (slices.has("players") && this.capabilities.players.available) optional.players = this.readPlayers();
    if (slices.has("groundItems") && this.capabilities.groundItems.available) {
      optional.groundItems = this.readGroundItems();
    }
    if (slices.has("chat") && this.capabilities.chat.available) optional.chat = this.readChat();
    if (slices.has("sceneObjects") && this.capabilities.sceneObjects.available) {
      optional.sceneObjects = this.readSceneObjects();
    }
    if (slices.has("tiles") && this.capabilities.projection.available) {
      optional.tiles = this.readProjectedTiles();
    }
    return Object.freeze({
      at,
      visible,
      ingame,
      username,
      skills,
      player,
      opponent: this.readOpponent(),
      attackStyle,
      ...(optional.npcs !== undefined ? { npcs: optional.npcs } : {}),
      ...(optional.players !== undefined ? { players: optional.players } : {}),
      ...(optional.groundItems !== undefined ? { groundItems: optional.groundItems } : {}),
      ...(optional.chat !== undefined ? { chat: optional.chat } : {}),
      ...(optional.sceneObjects !== undefined ? { sceneObjects: optional.sceneObjects } : {}),
      ...(optional.tiles !== undefined ? { tiles: optional.tiles } : {}),
    });
  }

  readSkills(): readonly SkillState[] | null {
    const values = this.readPublicSkills() ?? this.readResolvedSkills();
    if (!values) {
      this.capabilities.skills = unavailable("The skill mapping no longer passes validation.");
      this.validationFailures.add("Skill fields became unavailable after client initialization.");
      return null;
    }
    if (
      this.cachedSkillInputs && this.cachedSkillStates &&
      this.sameNumbers(values.xp, this.cachedSkillInputs.xp) &&
      this.sameNumbers(values.current, this.cachedSkillInputs.current) &&
      this.sameNumbers(values.base, this.cachedSkillInputs.base)
    ) return this.cachedSkillStates;
    const result = SKILL_NAMES.map((name, id) =>
      Object.freeze({
        id,
        name,
        xp: Math.max(0, Math.floor(values.xp[id] ?? 0)),
        currentLevel: Math.max(0, Math.floor(values.current[id] ?? 0)),
        baseLevel: Math.max(0, Math.floor(values.base[id] ?? 0)),
      }),
    );
    this.cachedSkillInputs = values;
    this.cachedSkillStates = Object.freeze(result);
    return this.cachedSkillStates;
  }

  readNpcs(): readonly NpcState[] {
    const table = getField(this.client, this.mapping.npcs.table);
    const indices = getField(this.client, this.mapping.npcs.activeIndices);
    const count = Math.min(16_384, Math.max(0, Math.floor(numericField(this.client, this.mapping.npcs.activeCount) ?? 0)));
    const baseX = numericField(this.client, this.mapping.player.baseX) ?? 0;
    const baseZ = numericField(this.client, this.mapping.player.baseZ) ?? 0;
    const plane = numericField(this.client, this.mapping.player.plane) ?? 0;
    const output: NpcState[] = [];
    for (let position = 0; position < count; position += 1) {
      const slot = indexValue(indices, position);
      if (typeof slot !== "number" || !Number.isInteger(slot)) continue;
      const entity = indexValue(table, slot);
      if (!isRecord(entity)) continue;
      const type = getField(entity, this.mapping.npcs.type);
      const localX = numericField(entity, this.mapping.player.localX);
      const localZ = numericField(entity, this.mapping.player.localZ);
      if (localX === null || localZ === null) continue;
      const entityLevel = numericField(entity, this.mapping.player.level) ?? plane;
      const typeId = numericField(type, this.mapping.npcs.id);
      output.push(
        Object.freeze({
          slot,
          id: typeId === null ? null : Math.floor(typeId),
          name: stringField(type, this.mapping.npcs.name),
          tile: Object.freeze({
            x: Math.floor(localX / 128) + Math.floor(baseX),
            z: Math.floor(localZ / 128) + Math.floor(baseZ),
            level: Math.floor(entityLevel),
          }),
        }),
      );
    }
    return freezeList(output);
  }

  readPlayers(): readonly NearbyPlayerState[] {
    const table = getField(this.client, this.mapping.players.table);
    const indices = getField(this.client, this.mapping.players.activeIndices);
    const count = Math.min(2_048, Math.max(0, Math.floor(numericField(this.client, this.mapping.players.activeCount) ?? 0)));
    const output: NearbyPlayerState[] = [];
    const local = getField(this.client, this.mapping.player.local);
    const localState = this.entityToPlayer(-1, local, true);
    if (localState) output.push(localState);
    for (let position = 0; position < count; position += 1) {
      const slot = indexValue(indices, position);
      if (typeof slot !== "number" || !Number.isInteger(slot)) continue;
      const entity = indexValue(table, slot);
      if (entity === local) continue;
      const state = this.entityToPlayer(slot, entity, false);
      if (state) output.push(state);
    }
    return freezeList(output);
  }

  readGroundItems(radius = 12): readonly GroundItemState[] {
    this.learnItemNamesFromMenu();
    const fromMethod = this.readPublicGroundItems(radius);
    if (fromMethod) return fromMethod;
    const playerTile = this.readPlayerTile();
    if (!playerTile) return Object.freeze([]);
    const grid = getField(this.client, this.mapping.groundItems.grid);
    const planeGrid = indexValue(grid, playerTile.level);
    const baseX = Math.floor(numericField(this.client, this.mapping.player.baseX) ?? 0);
    const baseZ = Math.floor(numericField(this.client, this.mapping.player.baseZ) ?? 0);
    const playerLocalX = playerTile.x - baseX;
    const playerLocalZ = playerTile.z - baseZ;
    const output: GroundItemState[] = [];
    for (let localX = Math.max(0, playerLocalX - radius); localX <= Math.min(103, playerLocalX + radius); localX += 1) {
      const column = indexValue(planeGrid, localX);
      for (let localZ = Math.max(0, playerLocalZ - radius); localZ <= Math.min(103, playerLocalZ + radius); localZ += 1) {
        const deque = indexValue(column, localZ);
        const sentinel = getField(deque, this.mapping.groundItems.sentinel);
        if (!isRecord(sentinel)) continue;
        const visited = new Set<unknown>([sentinel]);
        let node = getField(sentinel, this.mapping.groundItems.next);
        let iterations = 0;
        while (isRecord(node) && !visited.has(node) && iterations < 64) {
          visited.add(node);
          const id = numericField(node, this.mapping.groundItems.id);
          const count = numericField(node, this.mapping.groundItems.count);
          if (id !== null && count !== null) {
            output.push(
              Object.freeze({
                id: Math.floor(id),
                count: Math.max(0, Math.floor(count)),
                name: this.readItemName(Math.floor(id)),
                tile: Object.freeze({ x: baseX + localX, z: baseZ + localZ, level: playerTile.level }),
              }),
            );
          }
          node = getField(node, this.mapping.groundItems.next);
          iterations += 1;
        }
      }
    }
    return freezeList(output);
  }

  projectGroundItems(items: readonly GroundItemState[]): readonly ProjectedGroundItemState[] {
    const playerTile = this.readPlayerTile();
    if (!playerTile || !this.hasProjectionShape()) return Object.freeze([]);
    const baseX = numericField(this.client, this.mapping.player.baseX);
    const baseZ = numericField(this.client, this.mapping.player.baseZ);
    if (baseX === null || baseZ === null) return Object.freeze([]);
    const output: ProjectedGroundItemState[] = [];
    for (const item of items.slice(0, 80)) {
      if (item.tile.level !== playerTile.level) continue;
      const localX = (item.tile.x - Math.floor(baseX)) * 128 + 64;
      const localZ = (item.tile.z - Math.floor(baseZ)) * 128 + 64;
      const point = this.projectLocalPoint(localX, localZ, item.tile.level, 20);
      if (!point) continue;
      output.push(Object.freeze({ ...item, point }));
    }
    return Object.freeze(output);
  }

  projectPlayers(players: readonly NearbyPlayerState[]): readonly ProjectedPlayerState[] {
    const playerTile = this.readPlayerTile();
    if (!playerTile || !this.hasProjectionShape()) return Object.freeze([]);
    const baseX = numericField(this.client, this.mapping.player.baseX);
    const baseZ = numericField(this.client, this.mapping.player.baseZ);
    if (baseX === null || baseZ === null) return Object.freeze([]);
    const output: ProjectedPlayerState[] = [];
    for (let index = 0; index < Math.min(players.length, 80); index += 1) {
      const player = players[index];
      if (!player) continue;
      if (player.tile.level !== playerTile.level || !player.name) continue;
      const localX = (player.tile.x - Math.floor(baseX)) * 128 + 64;
      const localZ = (player.tile.z - Math.floor(baseZ)) * 128 + 64;
      const point = this.projectLocalPoint(localX, localZ, player.tile.level, 165);
      if (!point) continue;
      output.push(Object.freeze({ ...player, point }));
    }
    return Object.freeze(output);
  }

  private readPublicGroundItems(radius: number): readonly GroundItemState[] | null {
    if (!hasMethod(this.client, "pluginGetNearbyGroundItems")) return null;
    const value = callReadMethod(this.client, "pluginGetNearbyGroundItems", [radius]);
    const length = getArrayLikeLength(value);
    if (length === null) return Object.freeze([]);
    const output: GroundItemState[] = [];
    for (let index = 0; index < Math.min(length, 256); index += 1) {
      const entry = indexValue(value, index);
      if (!isRecord(entry)) continue;
      const id = numericField(entry, "id");
      const count = numericField(entry, "count") ?? numericField(entry, "quantity") ?? 1;
      const tile = validTile(getField(entry, "tile")) ?? validTile(entry);
      if (id === null || !Number.isInteger(id) || id < 0 || !tile) continue;
      const providedName = stringField(entry, "name");
      output.push(Object.freeze({
        id,
        count: Math.max(0, Math.floor(count)),
        name: providedName && providedName.trim() ? providedName.trim() : this.readItemName(id),
        tile,
      }));
    }
    return Object.freeze(output);
  }

  private readItemName(id: number): string | null {
    if (this.itemNameCache.has(id)) return this.itemNameCache.get(id) ?? null;
    const value = callReadMethod(this.client, "pluginGetItemName", [id]);
    const name = typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : STANDARD_ITEM_NAMES[id] ?? null;
    this.itemNameCache.set(id, name);
    return name;
  }

  private learnItemNamesFromMenu(): void {
    const count = Math.min(500, Math.max(0, Math.floor(numericField(this.client, this.mapping.menu.count) ?? 0)));
    const options = getField(this.client, this.mapping.menu.options);
    const opcodes = getField(this.client, this.mapping.menu.opcodes);
    const identifiers = getField(this.client, this.mapping.menu.identifiers);
    for (let index = 0; index < count; index += 1) {
      const option = indexValue(options, index);
      const opcodeValue = indexValue(opcodes, index);
      const identifier = indexValue(identifiers, index);
      if (typeof option !== "string" || typeof opcodeValue !== "number" || typeof identifier !== "number") continue;
      const opcode = opcodeValue >= 2_000 ? opcodeValue - 2_000 : opcodeValue;
      if (opcode !== 617 && opcode !== 1_152) continue;
      const marker = option.indexOf("@lre@");
      if (marker < 0) continue;
      const name = option.slice(marker + 5).replace(/@[a-z0-9]+@/gi, "").trim();
      if (!name) continue;
      this.itemNameCache.set(Math.floor(identifier), name);
    }
  }

  readChat(): readonly ChatMessageState[] {
    const types = getField(this.client, this.mapping.chat.types);
    const senders = getField(this.client, this.mapping.chat.senders);
    const messages = getField(this.client, this.mapping.chat.messages);
    const length = Math.min(100, getArrayLikeLength(messages) ?? 0);
    const output: ChatMessageState[] = [];
    for (let index = 0; index < length; index += 1) {
      const text = indexValue(messages, index);
      if (typeof text !== "string" || text.length === 0) continue;
      const sender = indexValue(senders, index);
      const type = indexValue(types, index);
      output.push(
        Object.freeze({
          index,
          type: typeof type === "number" && Number.isFinite(type) ? Math.floor(type) : 0,
          sender: typeof sender === "string" && sender.length > 0 ? sender : null,
          text,
        }),
      );
    }
    return freezeList(output);
  }

  readSceneObjects(radius = 15): readonly SceneObjectState[] {
    const playerTile = this.readPlayerTile();
    const scene = getField(this.client, this.mapping.scene.graph);
    if (!playerTile || !isRecord(scene)) return Object.freeze([]);
    const baseX = Math.floor(numericField(this.client, this.mapping.player.baseX) ?? 0);
    const baseZ = Math.floor(numericField(this.client, this.mapping.player.baseZ) ?? 0);
    const playerLocalX = playerTile.x - baseX;
    const playerLocalZ = playerTile.z - baseZ;
    const getters: ReadonlyArray<readonly [SceneObjectKind, string]> = [
      ["wall", this.mapping.scene.getters.wall],
      ["wallDecoration", this.mapping.scene.getters.wallDecoration],
      ["object", this.mapping.scene.getters.object],
      ["groundDecoration", this.mapping.scene.getters.groundDecoration],
    ];
    const seen = new Set<string>();
    const output: SceneObjectState[] = [];
    for (let localX = Math.max(0, playerLocalX - radius); localX <= Math.min(103, playerLocalX + radius); localX += 1) {
      for (let localZ = Math.max(0, playerLocalZ - radius); localZ <= Math.min(103, playerLocalZ + radius); localZ += 1) {
        for (const [kind, methodName] of getters) {
          const value = callReadMethod(scene, methodName, [playerTile.level, localX, localZ]);
          if (!isRecord(value)) continue;
          const rawTag = numericField(value, this.mapping.scene.tag);
          if (rawTag === null || rawTag === 0) continue;
          const tag = rawTag | 0;
          const key = `${kind}:${tag}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const info = numericField(value, this.mapping.scene.info);
          output.push(
            Object.freeze({
              id: (tag >>> 14) & 0x7fff,
              tag,
              kind,
              orientation: info === null ? null : Math.floor(info) & 0xff,
              tile: Object.freeze({ x: baseX + localX, z: baseZ + localZ, level: playerTile.level }),
            }),
          );
        }
      }
    }
    return freezeList(output);
  }

  getInventoryCount(itemId: number): number | null {
    if (!this.capabilities.inventoryLookup.available || !Number.isInteger(itemId) || itemId < 0) return null;
    const result = callReadMethod(this.client, "pluginGetInvItemCount", [itemId]);
    return typeof result === "number" && Number.isFinite(result) ? Math.max(0, Math.floor(result)) : null;
  }

  getComponentItemCount(componentId: number, itemId: number): number | null {
    if (!hasMethod(this.client, "pluginGetComponentItemCount")) return null;
    if (!Number.isInteger(componentId) || !Number.isInteger(itemId) || componentId < 0 || itemId < 0) return null;
    const result = callReadMethod(this.client, "pluginGetComponentItemCount", [componentId, itemId]);
    return typeof result === "number" && Number.isFinite(result) ? Math.max(0, Math.floor(result)) : null;
  }

  getVarp(id: number): number | null {
    if (!this.capabilities.varps.available || !Number.isInteger(id) || id < 0) return null;
    const result = callReadMethod(this.client, "pluginGetVarp", [id]);
    return typeof result === "number" && Number.isFinite(result) ? Math.floor(result) : null;
  }

  readAttackStyle(): AttackStyleState | null {
    const publicIndex = callReadMethod(this.client, "pluginGetVarp", [this.mapping.combat.attackStyleIndex]);
    if (typeof publicIndex === "number" && Number.isInteger(publicIndex)) {
      const publicName = ATTACK_STYLE_NAMES[publicIndex];
      if (publicName !== undefined) return Object.freeze({ index: publicIndex, name: publicName });
    }
    const state = getField(this.client, this.mapping.combat.state);
    const rawIndex = indexValue(state, this.mapping.combat.attackStyleIndex);
    if (typeof rawIndex !== "number" || !Number.isInteger(rawIndex)) return null;
    const name = ATTACK_STYLE_NAMES[rawIndex];
    return name === undefined ? null : Object.freeze({ index: rawIndex, name });
  }

  readOpponent(): OpponentState | null {
    const local = getField(this.client, this.mapping.player.local);
    const slot = numericField(local, this.mapping.player.targetIndex);
    if (slot === null || !Number.isInteger(slot) || slot < 0 || slot >= 32_768) return null;
    const entity = indexValue(getField(this.client, this.mapping.npcs.table), slot);
    if (!isRecord(entity)) return null;
    const healthRatio = numericField(entity, this.mapping.npcs.healthRatio);
    const healthScale = numericField(entity, this.mapping.npcs.healthScale);
    if (
      healthRatio === null || healthScale === null ||
      !Number.isInteger(healthRatio) || !Number.isInteger(healthScale) ||
      healthRatio < 0 || healthScale <= 0 || healthRatio > healthScale
    ) return null;
    const type = getField(entity, this.mapping.npcs.type);
    const id = numericField(type, this.mapping.npcs.id);
    const animation = numericField(entity, this.mapping.player.animation);
    return Object.freeze({
      slot,
      id: id === null ? null : Math.floor(id),
      name: stringField(type, this.mapping.npcs.name),
      healthRatio,
      healthScale,
      healthPercent: Math.max(0, Math.min(100, (healthRatio / healthScale) * 100)),
      animation: animation === null ? null : Math.floor(animation),
    });
  }

  readProjectedTiles(): readonly ProjectedTileState[] {
    const playerTile = this.readPlayerTile();
    if (!playerTile || !this.hasProjectionShape()) return Object.freeze([]);
    const mouseX = numericField(this.client, this.mapping.projection.mouseX);
    const mouseY = numericField(this.client, this.mapping.projection.mouseY);
    if (mouseX === null || mouseY === null || mouseX < 4 || mouseX >= 516 || mouseY < 4 || mouseY >= 338) {
      return Object.freeze([]);
    }
    const baseX = Math.floor(numericField(this.client, this.mapping.player.baseX) ?? 0);
    const baseZ = Math.floor(numericField(this.client, this.mapping.player.baseZ) ?? 0);
    const intersection = this.findTerrainIntersection(mouseX, mouseY, playerTile.level);
    if (!intersection) return Object.freeze([]);
    const intersectedTileX = Math.floor(intersection.x / 128);
    const intersectedTileZ = Math.floor(intersection.z / 128);
    let best: { tile: ProjectedTileState; distance: number } | null = null;
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const sceneX = intersectedTileX + offsetX;
        const sceneZ = intersectedTileZ + offsetZ;
        const worldX = baseX + sceneX;
        const worldZ = baseZ + sceneZ;
        const tile = this.projectWorldTile({ x: worldX, z: worldZ, level: playerTile.level }, playerTile);
        if (!tile) continue;
        const points = tile.points;
        if (!this.pointInPolygon(mouseX, mouseY, points)) continue;
        const centerX = points.reduce((sum, point) => sum + point.x, 0) / 4;
        const centerY = points.reduce((sum, point) => sum + point.y, 0) / 4;
        const distance = (centerX - mouseX) ** 2 + (centerY - mouseY) ** 2;
        if (!best || distance < best.distance) best = { tile, distance };
      }
    }
    return best ? Object.freeze([best.tile]) : Object.freeze([]);
  }

  readProjectedDestinationTile(): ProjectedTileState | null {
    const playerTile = this.readPlayerTile();
    const local = getField(this.client, this.mapping.player.local);
    const pathLength = numericField(local, this.mapping.player.pathLength);
    if (!playerTile || !this.hasProjectionShape() || pathLength === null || !Number.isInteger(pathLength) || pathLength <= 0) {
      return null;
    }
    const localX = indexValue(getField(local, this.mapping.player.pathX), 0);
    const localZ = indexValue(getField(local, this.mapping.player.pathZ), 0);
    const baseX = numericField(this.client, this.mapping.player.baseX);
    const baseZ = numericField(this.client, this.mapping.player.baseZ);
    if (
      typeof localX !== "number" || !Number.isInteger(localX) ||
      typeof localZ !== "number" || !Number.isInteger(localZ) ||
      baseX === null || baseZ === null
    ) return null;
    const destination = Object.freeze({
      x: Math.floor(baseX) + localX,
      z: Math.floor(baseZ) + localZ,
      level: playerTile.level,
    });
    if (destination.x === playerTile.x && destination.z === playerTile.z) return null;
    return this.projectWorldTile(destination, playerTile);
  }

  private projectWorldTile(tile: WorldTile, playerTile: WorldTile): ProjectedTileState | null {
    const baseX = numericField(this.client, this.mapping.player.baseX);
    const baseZ = numericField(this.client, this.mapping.player.baseZ);
    if (baseX === null || baseZ === null || tile.level !== playerTile.level) return null;
    const localX = (tile.x - Math.floor(baseX)) * 128;
    const localZ = (tile.z - Math.floor(baseZ)) * 128;
    const corners = [
      this.projectLocalPoint(localX, localZ, tile.level),
      this.projectLocalPoint(localX + 128, localZ, tile.level),
      this.projectLocalPoint(localX + 128, localZ + 128, tile.level),
      this.projectLocalPoint(localX, localZ + 128, tile.level),
    ] as const;
    if (corners.some((point) => point === null)) return null;
    const points = corners as readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
    return Object.freeze({
      tile: Object.freeze({ ...tile }),
      points: Object.freeze(points),
      playerTile: tile.x === playerTile.x && tile.z === playerTile.z,
    });
  }

  private detectCapabilities(): MutableCapabilities {
    const result = {} as MutableCapabilities;
    for (const capability of CAPABILITIES) result[capability] = unavailable("Not detected.");
    result.session = hasMethod(this.client, "pluginIsIngame")
      ? available("public-api")
      : booleanField(this.client, this.mapping.session.ingame) !== null
        ? available("mapped-field")
        : unavailable("No validated in-game state getter or field.");
    this.resolveSkills();
    result.skills = this.skills ? available(this.skills.source) : unavailable("No unique validated 21-skill mapping.");
    result.player = hasMethod(this.client, "pluginGetPlayerTile") || this.readRawPlayerTile() !== null
      ? available(hasMethod(this.client, "pluginGetPlayerTile") ? "public-api" : "mapped-field")
      : unavailable("No validated player tile source.");
    result.npcs = this.hasNpcShape() ? available("mapped-field") : unavailable("NPC table/index/count mapping failed validation.");
    result.players = this.hasPlayerShape() ? available("mapped-field") : unavailable("Player table/index/count mapping failed validation.");
    result.groundItems = this.hasGroundItemShape()
      ? available("mapped-field")
      : unavailable("Ground-item grid mapping failed validation.");
    result.chat = this.hasChatShape() ? available("mapped-field") : unavailable("Chat ring-buffer mapping failed validation.");
    result.sceneObjects = this.hasSceneShape()
      ? available("mapped-field")
      : unavailable("Scene graph or passive tile getters are unavailable.");
    result.inventoryLookup = hasMethod(this.client, "pluginGetInvItemCount")
      ? available("public-api")
      : unavailable("Full inventory enumeration is not exposed; item-ID lookup is also unavailable.");
    result.varps = hasMethod(this.client, "pluginGetVarp")
      ? available("public-api")
      : unavailable("No public varp getter.");
    result.projection = this.hasProjectionShape()
      ? available("mapped-field")
      : unavailable("Camera or terrain-height projection fields failed validation.");
    const local = getField(this.client, this.mapping.player.local);
    result.animation = hasMethod(this.client, "pluginGetPlayerAnimation")
      ? available("public-api")
      : numericField(local, this.mapping.player.animation) !== null
        ? available("mapped-field")
        : unavailable("No validated player-animation getter or field.");
    result.opponent = this.hasOpponentShape()
      ? available("mapped-field")
      : unavailable("Opponent index or NPC table failed validation.");
    result.bankItems = hasMethod(this.client, "pluginGetBankItems")
      ? available("public-api")
      : unavailable("The current build does not expose bank enumeration.");
    result.attackStyle = this.readAttackStyle()
      ? available("mapped-field")
      : unavailable("Attack-style state kA[43] is not currently a validated index from 0 to 3.");
    return result;
  }

  private resolveSkills(): void {
    this.validationFailures.clear();
    const resolution = resolveSkillFields(this.client, this.mapping);
    this.skills = resolution.resolved;
    for (const failure of resolution.failures) this.validationFailures.add(failure);
    if (this.capabilities) {
      this.capabilities.skills = this.skills
        ? available(this.skills.source)
        : unavailable("No unique validated 21-skill mapping.");
    }
  }

  private readResolvedSkills(): Pick<ResolvedSkills, "xp" | "current" | "base"> | null {
    if (!this.skills) return null;
    const xp = readFiniteNumbers(getField(this.client, this.skills.xpField), 21);
    const current = readFiniteNumbers(getField(this.client, this.skills.currentField), 21);
    const base = readFiniteNumbers(getField(this.client, this.skills.baseField), 21);
    if (!xp || !current || !base) return null;
    return { xp, current, base };
  }

  private readPublicSkills(): Pick<ResolvedSkills, "xp" | "current" | "base"> | null {
    if (
      !hasMethod(this.client, "pluginGetStatXp") ||
      !hasMethod(this.client, "pluginGetStatLevel") ||
      !hasMethod(this.client, "pluginGetStatBase")
    ) return null;
    const xp: number[] = [];
    const current: number[] = [];
    const base: number[] = [];
    for (let id = 0; id < SKILL_NAMES.length; id += 1) {
      const skillXp = callReadMethod(this.client, "pluginGetStatXp", [id]);
      const currentLevel = callReadMethod(this.client, "pluginGetStatLevel", [id]);
      const baseLevel = callReadMethod(this.client, "pluginGetStatBase", [id]);
      if (
        typeof skillXp !== "number" || !Number.isFinite(skillXp) || skillXp < 0 ||
        typeof currentLevel !== "number" || !Number.isFinite(currentLevel) || currentLevel < 0 ||
        typeof baseLevel !== "number" || !Number.isFinite(baseLevel) || baseLevel < 0
      ) return null;
      xp.push(skillXp);
      current.push(currentLevel);
      base.push(baseLevel);
    }
    return { xp, current, base };
  }

  private sameNumbers(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private readIngame(): boolean {
    const fromMethod = callReadMethod(this.client, "pluginIsIngame");
    if (typeof fromMethod === "boolean") return fromMethod;
    return booleanField(this.client, this.mapping.session.ingame) ?? false;
  }

  private readUsername(): string | null {
    const fromMethod = callReadMethod(this.client, "pluginGetUsername");
    if (typeof fromMethod === "string" && fromMethod.trim().length > 0) return fromMethod.trim();
    return stringField(getField(this.client, this.mapping.player.local), this.mapping.player.name);
  }

  private readPlayer(): PlayerState | null {
    const tile = this.readPlayerTile();
    if (!tile && !this.capabilities.player.available) return null;
    const energy = callReadMethod(this.client, "pluginGetRunEnergy");
    const running = callReadMethod(this.client, "pluginIsRunning");
    return Object.freeze({
      tile,
      runEnergy: typeof energy === "number" && Number.isFinite(energy) ? energy : null,
      running: typeof running === "boolean" ? running : null,
      animation: (() => {
        const fromMethod = callReadMethod(this.client, "pluginGetPlayerAnimation");
        if (typeof fromMethod === "number" && Number.isFinite(fromMethod)) return Math.floor(fromMethod);
        const raw = numericField(getField(this.client, this.mapping.player.local), this.mapping.player.animation);
        return raw === null ? null : Math.floor(raw);
      })(),
    });
  }

  private readPlayerTile(): WorldTile | null {
    const fromMethod = validTile(callReadMethod(this.client, "pluginGetPlayerTile"));
    return fromMethod ?? this.readRawPlayerTile();
  }

  private readRawPlayerTile(): WorldTile | null {
    const local = getField(this.client, this.mapping.player.local);
    const localX = numericField(local, this.mapping.player.localX);
    const localZ = numericField(local, this.mapping.player.localZ);
    const baseX = numericField(this.client, this.mapping.player.baseX);
    const baseZ = numericField(this.client, this.mapping.player.baseZ);
    if (localX === null || localZ === null || baseX === null || baseZ === null) return null;
    const level = numericField(local, this.mapping.player.level) ?? numericField(this.client, this.mapping.player.plane) ?? 0;
    return Object.freeze({
      x: Math.floor(localX / 128) + Math.floor(baseX),
      z: Math.floor(localZ / 128) + Math.floor(baseZ),
      level: Math.floor(level),
    });
  }

  private entityToPlayer(slot: number, entity: unknown, local: boolean): NearbyPlayerState | null {
    if (!isRecord(entity)) return null;
    const localX = numericField(entity, this.mapping.player.localX);
    const localZ = numericField(entity, this.mapping.player.localZ);
    const baseX = numericField(this.client, this.mapping.player.baseX);
    const baseZ = numericField(this.client, this.mapping.player.baseZ);
    if (localX === null || localZ === null || baseX === null || baseZ === null) return null;
    const plane = numericField(entity, this.mapping.player.level) ?? numericField(this.client, this.mapping.player.plane) ?? 0;
    const combatLevel =
      numericField(entity, this.mapping.player.combatLevel) ??
      numericField(entity, "combatLevel") ??
      (local ? numericField(this.client, this.mapping.player.combatLevel) ?? numericField(this.client, "combatLevel") : null);
    return Object.freeze({
      slot,
      name: stringField(entity, this.mapping.player.name),
      combatLevel: combatLevel === null ? null : Math.floor(combatLevel),
      tile: Object.freeze({
        x: Math.floor(localX / 128) + Math.floor(baseX),
        z: Math.floor(localZ / 128) + Math.floor(baseZ),
        level: Math.floor(plane),
      }),
      local,
    });
  }

  private hasNpcShape(): boolean {
    return (
      validIndexCollection(getField(this.client, this.mapping.npcs.table), 1) &&
      validIndexCollection(getField(this.client, this.mapping.npcs.activeIndices), 1) &&
      numericField(this.client, this.mapping.npcs.activeCount) !== null
    );
  }

  private hasPlayerShape(): boolean {
    return (
      validIndexCollection(getField(this.client, this.mapping.players.table), 1) &&
      validIndexCollection(getField(this.client, this.mapping.players.activeIndices), 1) &&
      numericField(this.client, this.mapping.players.activeCount) !== null
    );
  }

  private hasGroundItemShape(): boolean {
    return hasMethod(this.client, "pluginGetNearbyGroundItems") ||
      validIndexCollection(getField(this.client, this.mapping.groundItems.grid), 4);
  }

  private hasChatShape(): boolean {
    return (
      validIndexCollection(getField(this.client, this.mapping.chat.types), 100) &&
      validIndexCollection(getField(this.client, this.mapping.chat.senders), 100) &&
      validIndexCollection(getField(this.client, this.mapping.chat.messages), 100)
    );
  }

  private hasSceneShape(): boolean {
    const scene = getField(this.client, this.mapping.scene.graph);
    return (
      isRecord(scene) &&
      Object.values(this.mapping.scene.getters).every((methodName) => hasMethod(scene, methodName))
    );
  }

  private hasOpponentShape(): boolean {
    const local = getField(this.client, this.mapping.player.local);
    const target = numericField(local, this.mapping.player.targetIndex);
    return target !== null && Number.isInteger(target) && validIndexCollection(getField(this.client, this.mapping.npcs.table), 1);
  }

  private hasProjectionShape(): boolean {
    const projection = this.mapping.projection;
    const heights = getField(this.client, projection.heights);
    const yaw = numericField(this.client, projection.yaw);
    const pitch = numericField(this.client, projection.pitch);
    return (
      validIndexCollection(heights, 4) &&
      numericField(this.client, projection.cameraX) !== null &&
      numericField(this.client, projection.cameraHeight) !== null &&
      numericField(this.client, projection.cameraZ) !== null &&
      yaw !== null && Number.isInteger(yaw) && yaw >= 0 && yaw < 2_048 &&
      pitch !== null && Number.isInteger(pitch) && pitch >= 0 && pitch < 2_048
      && numericField(this.client, projection.mouseX) !== null
      && numericField(this.client, projection.mouseY) !== null
    );
  }

  private pointInPolygon(x: number, y: number, points: readonly ScreenPoint[]): boolean {
    let inside = false;
    for (let current = 0, previous = points.length - 1; current < points.length; previous = current, current += 1) {
      const a = points[current];
      const b = points[previous];
      if (!a || !b) continue;
      const crosses = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  private findTerrainIntersection(mouseX: number, mouseY: number, plane: number): { x: number; z: number } | null {
    const projection = this.mapping.projection;
    const cameraX = numericField(this.client, projection.cameraX);
    const cameraHeight = numericField(this.client, projection.cameraHeight);
    const cameraZ = numericField(this.client, projection.cameraZ);
    const yaw = numericField(this.client, projection.yaw);
    const pitch = numericField(this.client, projection.pitch);
    if (cameraX === null || cameraHeight === null || cameraZ === null || yaw === null || pitch === null) return null;

    const angleUnit = 0.0030679615757712823;
    const sinYaw = Math.sin(angleUnit * yaw);
    const cosYaw = Math.cos(angleUnit * yaw);
    const sinPitch = Math.sin(angleUnit * pitch);
    const cosPitch = Math.cos(angleUnit * pitch);
    const normalizedX = (mouseX - 260) / 512;
    const normalizedY = (mouseY - 171) / 512;
    const cameraPlaneZ = cosPitch - normalizedY * sinPitch;
    const directionX = normalizedX * cosYaw - cameraPlaneZ * sinYaw;
    const directionZ = normalizedX * sinYaw + cameraPlaneZ * cosYaw;
    const directionHeight = normalizedY * cosPitch + sinPitch;

    let previousT = 50;
    let previousDelta: number | null = null;
    for (let t = 50; t <= 3_500; t += 64) {
      const x = cameraX + directionX * t;
      const z = cameraZ + directionZ * t;
      const terrain = this.readTerrainHeight(Math.floor(x), Math.floor(z), plane);
      if (terrain === null) {
        previousDelta = null;
        previousT = t;
        continue;
      }
      const delta = cameraHeight + directionHeight * t - terrain;
      if (previousDelta !== null && ((previousDelta <= 0 && delta >= 0) || (previousDelta >= 0 && delta <= 0))) {
        let low = previousT;
        let high = t;
        let lowDelta = previousDelta;
        for (let iteration = 0; iteration < 9; iteration += 1) {
          const middle = (low + high) / 2;
          const middleX = cameraX + directionX * middle;
          const middleZ = cameraZ + directionZ * middle;
          const middleTerrain = this.readTerrainHeight(Math.floor(middleX), Math.floor(middleZ), plane);
          if (middleTerrain === null) break;
          const middleDelta = cameraHeight + directionHeight * middle - middleTerrain;
          if ((lowDelta <= 0 && middleDelta >= 0) || (lowDelta >= 0 && middleDelta <= 0)) {
            high = middle;
          } else {
            low = middle;
            lowDelta = middleDelta;
          }
        }
        const hitT = (low + high) / 2;
        return Object.freeze({ x: cameraX + directionX * hitT, z: cameraZ + directionZ * hitT });
      }
      previousDelta = delta;
      previousT = t;
    }
    return null;
  }

  private projectLocalPoint(localX: number, localZ: number, plane: number, heightOffset = 0): ScreenPoint | null {
    if (localX < 128 || localZ < 128 || localX > 13_056 || localZ > 13_056) return null;
    const terrainHeight = this.readTerrainHeight(localX, localZ, plane);
    if (terrainHeight === null) return null;
    const height = terrainHeight - heightOffset;
    const projection = this.mapping.projection;
    const cameraX = numericField(this.client, projection.cameraX);
    const cameraHeight = numericField(this.client, projection.cameraHeight);
    const cameraZ = numericField(this.client, projection.cameraZ);
    const yaw = numericField(this.client, projection.yaw);
    const pitch = numericField(this.client, projection.pitch);
    if (cameraX === null || cameraHeight === null || cameraZ === null || yaw === null || pitch === null) return null;

    const angleUnit = 0.0030679615757712823;
    const sinYaw = Math.trunc(65_536 * Math.sin(angleUnit * yaw));
    const cosYaw = Math.trunc(65_536 * Math.cos(angleUnit * yaw));
    const sinPitch = Math.trunc(65_536 * Math.sin(angleUnit * pitch));
    const cosPitch = Math.trunc(65_536 * Math.cos(angleUnit * pitch));
    const dx = localX - cameraX;
    const dy = height - cameraHeight;
    const dz = localZ - cameraZ;
    const rotatedX = Math.trunc((dz * sinYaw + dx * cosYaw) / 65_536);
    const rotatedZ = Math.trunc((dz * cosYaw - dx * sinYaw) / 65_536);
    const screenYDepth = Math.trunc((dy * sinPitch + rotatedZ * cosPitch) / 65_536);
    if (screenYDepth < 50) return null;
    const rotatedY = Math.trunc((dy * cosPitch - rotatedZ * sinPitch) / 65_536);
    return Object.freeze({
      x: 4 + 256 + Math.trunc((rotatedX * 512) / screenYDepth),
      y: 4 + 167 + Math.trunc((rotatedY * 512) / screenYDepth),
    });
  }

  private readTerrainHeight(localX: number, localZ: number, plane: number): number | null {
    const tileX = Math.floor(localX / 128);
    const tileZ = Math.floor(localZ / 128);
    if (tileX < 0 || tileZ < 0 || tileX > 103 || tileZ > 103) return null;
    let effectivePlane = Math.max(0, Math.min(3, Math.floor(plane)));
    const flagsPlane = indexValue(getField(this.client, this.mapping.projection.renderFlags), 1);
    const flagsColumn = indexValue(flagsPlane, tileX);
    const flags = indexValue(flagsColumn, tileZ);
    if (effectivePlane < 3 && typeof flags === "number" && (flags & 2) !== 0) effectivePlane += 1;
    const heightPlane = indexValue(getField(this.client, this.mapping.projection.heights), effectivePlane);
    const column = indexValue(heightPlane, tileX);
    const nextColumn = indexValue(heightPlane, tileX + 1);
    const h00 = indexValue(column, tileZ);
    const h10 = indexValue(nextColumn, tileZ);
    const h01 = indexValue(column, tileZ + 1);
    const h11 = indexValue(nextColumn, tileZ + 1);
    if (![h00, h10, h01, h11].every((value) => typeof value === "number" && Number.isFinite(value))) return null;
    const offsetX = localX & 127;
    const offsetZ = localZ & 127;
    const north = Math.trunc(((h00 as number) * (128 - offsetX) + (h10 as number) * offsetX) / 128);
    const south = Math.trunc(((h01 as number) * (128 - offsetX) + (h11 as number) * offsetX) / 128);
    return Math.trunc((north * (128 - offsetZ) + south * offsetZ) / 128);
  }
}
