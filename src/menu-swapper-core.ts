const LOW_PRIORITY_OFFSET = 2_000;
const PLAYER_ACTION_OPCODES = new Set([639, 499, 27, 387, 185]);
const NPC_ACTION_OPCODES = new Set([242, 209, 309, 852, 793]);
const PATCH_MARKER = Symbol("fatbeef-plugin-sandbox-menu-swapper");
const FALLBACK_MARKER = Symbol("fatbeef-plugin-sandbox-menu-fallback");
const RAW_MENU_FIELDS = Object.freeze(["Tz", "Rz", "Sz"] as const);

export interface MenuSwapperSettings {
  readonly enabled: boolean;
  readonly playerAttack: boolean;
  readonly npcAttack: boolean;
  readonly talkTo: boolean;
  readonly pickpocket: boolean;
  readonly bank: boolean;
  readonly trade: boolean;
  readonly travel: boolean;
  readonly take: boolean;
  readonly shopBuy10: boolean;
  readonly petClickThrough: boolean;
}

export const DEFAULT_MENU_SWAPPER_SETTINGS: MenuSwapperSettings = Object.freeze({
  enabled: true,
  playerAttack: true,
  npcAttack: true,
  talkTo: false,
  pickpocket: false,
  bank: false,
  trade: false,
  travel: false,
  take: false,
  shopBuy10: true,
  petClickThrough: true,
});

type MenuKind = "scene" | "shop" | "player" | "npc";
type SettingsProvider = () => MenuSwapperSettings;

interface PatchMetadata {
  readonly kind: MenuKind;
  readonly countField: string;
  readonly indexedFields: readonly string[];
}

interface PatchableFunction extends Function {
  [PATCH_MARKER]?: PatchMetadata;
}

interface FallbackPatchedClient {
  [FALLBACK_MARKER]?: true;
}

interface BuilderMatch {
  readonly prototype: object;
  readonly methodName: string;
  readonly countField: string;
  readonly indexedFields: readonly string[];
  readonly optionField?: string;
  readonly opcodeField?: string;
  readonly descriptor: PropertyDescriptor;
}

interface MenuBuilderConfig {
  readonly kind: "player" | "npc";
  readonly signature: string;
  readonly actionOpcodes: ReadonlySet<number>;
  readonly enabled: (settings: MenuSwapperSettings) => boolean;
}

const MENU_BUILDERS: readonly MenuBuilderConfig[] = Object.freeze([
  Object.freeze({
    kind: "player",
    signature: "Walk here @whi@",
    actionOpcodes: PLAYER_ACTION_OPCODES,
    enabled: (settings: MenuSwapperSettings) => settings.playerAttack,
  }),
  Object.freeze({
    kind: "npc",
    signature: "Examine @yel@",
    actionOpcodes: NPC_ACTION_OPCODES,
    enabled: (settings: MenuSwapperSettings) => settings.npcAttack,
  }),
]);

export interface AttackMenuPatchResult {
  readonly patched: boolean;
  readonly methodNames: readonly string[];
  readonly sceneMenu: boolean;
  readonly reason?: string;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function indexValue(value: unknown, index: number): unknown {
  if (value === null || value === undefined) return undefined;
  return Reflect.get(Object(value), String(index));
}

function isAttackOption(value: unknown): boolean {
  return typeof value === "string" && /^attack(?:\s|@|$)/i.test(value.trim());
}

function actionText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.split(/\s+@[a-z0-9]+@/i, 1)[0]?.trim().toLowerCase() ?? "";
}

function targetText(value: unknown): string {
  if (typeof value !== "string") return "";
  const marker = value.match(/\s+@[a-z0-9]+@/i);
  const target = marker ? value.slice((marker.index ?? 0) + marker[0].length) : value;
  return target.replace(/@[a-z0-9]+@/gi, "").trim().toLowerCase();
}

function attackOpcodeWithoutPriority(value: unknown, actionOpcodes: ReadonlySet<number>): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  const baseOpcode = value - LOW_PRIORITY_OFFSET;
  return actionOpcodes.has(baseOpcode) ? baseOpcode : null;
}

function getFunctionSource(method: Function): string | null {
  try {
    return Function.prototype.toString.call(method);
  } catch {
    return null;
  }
}

function walkPrototypeMethods(client: unknown, visit: (prototype: object, methodName: string, descriptor: PropertyDescriptor, source: string) => BuilderMatch | null): BuilderMatch | null {
  if (!isRecord(client)) return null;
  let prototype: object | null = Object.getPrototypeOf(client) as object | null;
  for (let depth = 0; prototype && prototype !== Object.prototype && depth < 8; depth += 1) {
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      if (methodName === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (!descriptor || typeof descriptor.value !== "function") continue;
      const method = descriptor.value as PatchableFunction;
      const source = getFunctionSource(method);
      if (!source) continue;
      const result = visit(prototype, methodName, descriptor, source);
      if (result) return result;
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return null;
}

function existingMatch(prototype: object, methodName: string, descriptor: PropertyDescriptor, kind: MenuKind): BuilderMatch | null {
  const metadata = (descriptor.value as PatchableFunction)[PATCH_MARKER];
  if (metadata?.kind !== kind) return null;
  return {
    prototype,
    methodName,
    countField: metadata.countField,
    indexedFields: metadata.indexedFields,
    descriptor,
  };
}

function findMenuBuilder(client: unknown, config: MenuBuilderConfig): BuilderMatch | null {
  return walkPrototypeMethods(client, (prototype, methodName, descriptor, source) => {
    const alreadyPatched = existingMatch(prototype, methodName, descriptor, config.kind);
    if (alreadyPatched) return alreadyPatched;
    if ((descriptor.value as PatchableFunction)[PATCH_MARKER]) return null;
    if (!source.includes(config.signature) || !/["']attack["']/i.test(source)) return null;
    const countMatch = source.match(/this\.([A-Za-z_$][\w$]*)\s*>=\s*400/);
    const countField = countMatch?.[1];
    if (!countField) return null;
    const indexedPattern = new RegExp(
      `this\\.([A-Za-z_$][\\w$]*)\\[this\\.${escapeRegExp(countField)}\\]`,
      "g",
    );
    const indexedFields = new Set<string>();
    for (const match of source.matchAll(indexedPattern)) {
      if (match[1]) indexedFields.add(match[1]);
    }
    if (indexedFields.size < 2) return null;
    return { prototype, methodName, countField, indexedFields: Object.freeze([...indexedFields]), descriptor };
  });
}

function findSceneMenuBuilder(client: unknown): BuilderMatch | null {
  return walkPrototypeMethods(client, (prototype, methodName, descriptor, source) => {
    const alreadyPatched = existingMatch(prototype, methodName, descriptor, "scene");
    if (alreadyPatched) return alreadyPatched;
    if ((descriptor.value as PatchableFunction)[PATCH_MARKER]) return null;
    if (!source.includes("Examine @cya@") || !source.includes("Take @lre@") || !source.includes("Walk here")) return null;

    const walkMatch = source.match(
      /this\.([A-Za-z_$][\w$]*)\[this\.([A-Za-z_$][\w$]*)\]\s*=\s*["']Walk here["'][\s\S]{0,180}?this\.([A-Za-z_$][\w$]*)\[this\.\2\]\s*=\s*718/,
    );
    const optionField = walkMatch?.[1];
    const countField = walkMatch?.[2];
    const opcodeField = walkMatch?.[3];
    if (!optionField || !countField || !opcodeField) return null;

    const indexedPattern = new RegExp(
      `this\\.([A-Za-z_$][\\w$]*)\\[this\\.${escapeRegExp(countField)}\\]`,
      "g",
    );
    const indexedFields = new Set<string>();
    for (const match of source.matchAll(indexedPattern)) {
      if (match[1]) indexedFields.add(match[1]);
    }
    if (!indexedFields.has(optionField) || !indexedFields.has(opcodeField) || indexedFields.size < 4) return null;
    return {
      prototype,
      methodName,
      countField,
      indexedFields: Object.freeze([...indexedFields]),
      optionField,
      opcodeField,
      descriptor,
    };
  });
}

function findShopMenuBuilder(client: unknown): BuilderMatch | null {
  return walkPrototypeMethods(client, (prototype, methodName, descriptor, source) => {
    const alreadyPatched = existingMatch(prototype, methodName, descriptor, "shop");
    if (alreadyPatched) return alreadyPatched;
    if ((descriptor.value as PatchableFunction)[PATCH_MARKER]) return null;
    if (!source.includes("Buy 10")) return null;

    const countMatch = source.match(/this\.([A-Za-z_$][\w$]*)\s*>=\s*400/);
    const countField = countMatch?.[1];
    if (!countField) return null;
    const buyMatch = source.match(
      /this\.([A-Za-z_$][\w$]*)\[this\.([A-Za-z_$][\w$]*)\]\s*=\s*["']Buy 10\b/,
    );
    const optionField = buyMatch?.[1];
    if (!optionField || buyMatch?.[2] !== countField) return null;
    const indexedPattern = new RegExp(
      `this\\.([A-Za-z_$][\\w$]*)\\[this\\.${escapeRegExp(countField)}\\]`,
      "g",
    );
    const indexedFields = new Set<string>();
    for (const match of source.matchAll(indexedPattern)) {
      if (match[1]) indexedFields.add(match[1]);
    }
    if (!indexedFields.has(optionField) || indexedFields.size < 2) return null;
    return {
      prototype,
      methodName,
      countField,
      indexedFields: Object.freeze([...indexedFields]),
      optionField,
      descriptor,
    };
  });
}

function boundedCount(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(0, Math.min(400, value))
    : fallback;
}

function moveRowsToEnd(client: Record<PropertyKey, unknown>, fields: readonly string[], indexes: readonly number[], start: number, end: number): void {
  if (indexes.length === 0) return;
  const selected = new Set(indexes);
  const order = [
    ...Array.from({ length: end - start }, (_, offset) => start + offset).filter((index) => !selected.has(index)),
    ...indexes,
  ];
  for (const field of fields) {
    const collection = Reflect.get(client, field);
    if (collection === null || collection === undefined) continue;
    const rows = order.map((index) => indexValue(collection, index));
    rows.forEach((value, offset) => Reflect.set(Object(collection), String(start + offset), value));
  }
}

function moveRowsToStart(client: Record<PropertyKey, unknown>, fields: readonly string[], indexes: readonly number[], start: number, end: number): void {
  if (indexes.length === 0) return;
  const selected = new Set(indexes);
  const order = [
    ...indexes,
    ...Array.from({ length: end - start }, (_, offset) => start + offset).filter((index) => !selected.has(index)),
  ];
  for (const field of fields) {
    const collection = Reflect.get(client, field);
    if (collection === null || collection === undefined) continue;
    const rows = order.map((index) => indexValue(collection, index));
    rows.forEach((value, offset) => Reflect.set(Object(collection), String(start + offset), value));
  }
}

function moveKnownRawRowsToEnd(client: Record<PropertyKey, unknown>, indexes: readonly number[], start: number, end: number): void {
  moveRowsToEnd(client, RAW_MENU_FIELDS, indexes, start, end);
}

function matchingIndexes(client: Record<PropertyKey, unknown>, optionField: string, start: number, end: number, predicate: (action: string) => boolean): number[] {
  const options = Reflect.get(client, optionField);
  const indexes: number[] = [];
  for (let index = start; index < end; index += 1) {
    if (predicate(actionText(indexValue(options, index)))) indexes.push(index);
  }
  return indexes;
}

function petIndexes(client: Record<PropertyKey, unknown>, optionField: string, start: number, end: number): number[] {
  const options = Reflect.get(client, optionField);
  const indexes: number[] = [];
  for (let index = start; index < end; index += 1) {
    const option = indexValue(options, index);
    const action = actionText(option);
    const target = targetText(option);
    const petAction = /^(?:pick-up|toggle aura|stroke|shoo-away)$/.test(action);
    if (petAction || (action === "examine" && /\b(?:pet|drake)\b/.test(target))) indexes.push(index);
  }
  return indexes;
}

function prioritizeConfiguredActions(client: Record<PropertyKey, unknown>, match: BuilderMatch, start: number, end: number, settings: MenuSwapperSettings): void {
  const { optionField, opcodeField } = match;
  if (!optionField || !opcodeField || !settings.enabled) return;
  const options = Reflect.get(client, optionField);
  const opcodes = Reflect.get(client, opcodeField);

  if (settings.petClickThrough) {
    moveRowsToStart(client, match.indexedFields, petIndexes(client, optionField, start, end), start, end);
  }

  for (let index = start; index < end; index += 1) {
    const option = indexValue(options, index);
    const isPlayer = typeof option === "string" && /@whi@/i.test(option);
    const isNpc = typeof option === "string" && /@yel@/i.test(option);
    if (!isAttackOption(option) || (!isPlayer && !isNpc)) continue;
    const configured = isPlayer ? settings.playerAttack : settings.npcAttack;
    const knownOpcodes = isPlayer ? PLAYER_ACTION_OPCODES : NPC_ACTION_OPCODES;
    if (!configured) continue;
    const baseOpcode = attackOpcodeWithoutPriority(indexValue(opcodes, index), knownOpcodes);
    if (baseOpcode !== null) Reflect.set(Object(opcodes), String(index), baseOpcode);
  }

  // These run from broad to specific. If several enabled actions exist on the
  // same target, the later (more specific) rule becomes the native left-click.
  const rules: Array<[boolean, (action: string) => boolean]> = [
    [settings.talkTo, (action) => action === "talk-to"],
    [settings.travel, (action) => /^(?:enter|open|climb(?:-up|-down)?|quick-.+|travel|charter|pay-fare)$/.test(action)],
    [settings.take, (action) => action === "take"],
    [settings.shopBuy10, (action) => action === "buy 10"],
    [settings.pickpocket, (action) => action === "pickpocket"],
    [settings.trade, (action) => action === "trade" || action === "trade with"],
    [settings.bank, (action) => action === "bank" || action === "banker" || action === "collect"],
  ];
  for (const [enabled, predicate] of rules) {
    if (!enabled) continue;
    const indexes = matchingIndexes(client, optionField, start, end, predicate);
    moveRowsToEnd(client, match.indexedFields, indexes, start, end);
  }
}

function prioritizeShopActions(client: Record<PropertyKey, unknown>, match: BuilderMatch, start: number, end: number, settings: MenuSwapperSettings): void {
  const { optionField } = match;
  if (!optionField || !settings.enabled || !settings.shopBuy10) return;
  const indexes = matchingIndexes(client, optionField, start, end, (action) => action === "buy 10");
  moveRowsToEnd(client, match.indexedFields, indexes, start, end);
}

function prioritizeRawShopActions(client: Record<PropertyKey, unknown>, settings: MenuSwapperSettings): void {
  if (!settings.enabled || !settings.shopBuy10) return;
  const count = boundedCount(Reflect.get(client, "Jz"));
  if (count <= 1) return;
  const indexes = matchingIndexes(client, "Tz", 0, count, (action) => action === "buy 10");
  moveKnownRawRowsToEnd(client, indexes, 0, count);
}

function patchAttackBuilder(match: BuilderMatch, config: MenuBuilderConfig, getSettings: SettingsProvider): boolean {
  const existing = match.descriptor.value as PatchableFunction;
  if (existing[PATCH_MARKER]) return false;
  const { countField, indexedFields } = match;
  const wrapped: PatchableFunction = function (this: unknown, ...args: unknown[]): unknown {
    const before = isRecord(this) ? boundedCount(Reflect.get(this, countField)) : 0;
    const result = Reflect.apply(existing, this, args);
    if (!isRecord(this)) return result;
    const settings = getSettings();
    if (!settings.enabled || !config.enabled(settings)) return result;
    const after = boundedCount(Reflect.get(this, countField), before);
    for (let index = before; index < after; index += 1) {
      const hasAttackOption = indexedFields.some((field) => isAttackOption(indexValue(Reflect.get(this, field), index)));
      if (!hasAttackOption) continue;
      for (const field of indexedFields) {
        const collection = Reflect.get(this, field);
        const baseOpcode = attackOpcodeWithoutPriority(indexValue(collection, index), config.actionOpcodes);
        if (baseOpcode !== null) Reflect.set(Object(collection), String(index), baseOpcode);
      }
    }
    return result;
  };
  Object.defineProperty(wrapped, PATCH_MARKER, {
    value: Object.freeze({ kind: config.kind, countField, indexedFields }),
  });
  Object.defineProperty(match.prototype, match.methodName, { ...match.descriptor, value: wrapped });
  return true;
}

function patchSceneBuilder(match: BuilderMatch, getSettings: SettingsProvider): boolean {
  const existing = match.descriptor.value as PatchableFunction;
  if (existing[PATCH_MARKER]) return false;
  const { countField, indexedFields } = match;
  const wrapped: PatchableFunction = function (this: unknown, ...args: unknown[]): unknown {
    const before = isRecord(this) ? boundedCount(Reflect.get(this, countField)) : 0;
    const result = Reflect.apply(existing, this, args);
    if (!isRecord(this)) return result;
    const after = boundedCount(Reflect.get(this, countField), before);
    prioritizeConfiguredActions(this, match, before, after, getSettings());
    return result;
  };
  Object.defineProperty(wrapped, PATCH_MARKER, {
    value: Object.freeze({ kind: "scene", countField, indexedFields }),
  });
  Object.defineProperty(match.prototype, match.methodName, { ...match.descriptor, value: wrapped });
  return true;
}

function patchShopBuilder(match: BuilderMatch, getSettings: SettingsProvider): boolean {
  const existing = match.descriptor.value as PatchableFunction;
  if (existing[PATCH_MARKER]) return false;
  const { countField, indexedFields } = match;
  const wrapped: PatchableFunction = function (this: unknown, ...args: unknown[]): unknown {
    const before = isRecord(this) ? boundedCount(Reflect.get(this, countField)) : 0;
    const result = Reflect.apply(existing, this, args);
    if (!isRecord(this)) return result;
    const after = boundedCount(Reflect.get(this, countField), before);
    prioritizeShopActions(this, match, before, after, getSettings());
    return result;
  };
  Object.defineProperty(wrapped, PATCH_MARKER, {
    value: Object.freeze({ kind: "shop", countField, indexedFields }),
  });
  Object.defineProperty(match.prototype, match.methodName, { ...match.descriptor, value: wrapped });
  return true;
}

function installRawMenuFallback(client: unknown, getSettings: SettingsProvider): boolean {
  if (!isRecord(client)) return false;
  const marked = client as FallbackPatchedClient;
  if (marked[FALLBACK_MARKER]) return true;
  Object.defineProperty(marked, FALLBACK_MARKER, { value: true });
  const tick = (): void => {
    if (!marked[FALLBACK_MARKER]) return;
    prioritizeRawShopActions(client, getSettings());
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
  return true;
}

export function installMenuSwapper(client: unknown, getSettings: SettingsProvider = () => DEFAULT_MENU_SWAPPER_SETTINGS): AttackMenuPatchResult {
  const methodNames: string[] = [];
  const fallbackInstalled = installRawMenuFallback(client, getSettings);
  const sceneMatch = findSceneMenuBuilder(client);
  if (sceneMatch) {
    methodNames.push(sceneMatch.methodName);
    patchSceneBuilder(sceneMatch, getSettings);
  }
  const shopMatch = findShopMenuBuilder(client);
  if (shopMatch) {
    methodNames.push(shopMatch.methodName);
    patchShopBuilder(shopMatch, getSettings);
  }
  for (const config of MENU_BUILDERS) {
    const match = findMenuBuilder(client, config);
    if (!match) continue;
    methodNames.push(match.methodName);
    patchAttackBuilder(match, config, getSettings);
  }
  if (methodNames.length === 0 && !fallbackInstalled) {
    return Object.freeze({
      patched: false,
      methodNames: Object.freeze([]),
      sceneMenu: false,
      reason: "Native menu builders were not recognized.",
    });
  }
  return Object.freeze({ patched: true, methodNames: Object.freeze(methodNames), sceneMenu: Boolean(sceneMatch) });
}

export function installLeftClickPlayerAttack(client: unknown): AttackMenuPatchResult {
  return installMenuSwapper(client);
}
