import { describe, expect, it } from "vitest";
import { SolanaClientAdapter } from "../src/adapter";
import { XP_FOR_LEVEL } from "../src/experience";
import { resolveSkillFields } from "../src/mapping";

function skillVectors(): { xp: number[]; current: number[]; base: number[] } {
  const base = Array.from({ length: 21 }, (_, index) => (index % 10) + 1);
  return {
    base,
    current: [...base],
    xp: base.map((level) => XP_FOR_LEVEL[level] ?? 0),
  };
}

function makeGrid(): unknown[] {
  return Array.from({ length: 4 }, () => Array.from({ length: 104 }, () => new Array(104).fill(null)));
}

function makeHeights(): number[][][] {
  return Array.from({ length: 4 }, () => Array.from({ length: 105 }, () => new Array<number>(105).fill(0)));
}

function fullClientFixture(): Record<string, unknown> {
  const skills = skillVectors();
  const grid = makeGrid() as Array<Array<Array<unknown>>>;
  const sentinel: Record<string, unknown> = {};
  const item = { id: 995, count: 42, next: sentinel };
  sentinel.next = item;
  grid[0]![10]![10] = { Y: sentinel };

  const local = {
    name: "Example", x: 10 * 128 + 64, z: 10 * 128 + 64, level: 0, Vo: 77, so: -1, mo: 3,
    Mo: Int32Array.from([12, 11, 10, 0, 0, 0, 0, 0, 0, 0]),
    No: Int32Array.from([11, 10, 10, 0, 0, 0, 0, 0, 0, 0]),
    Lo: 2,
  };
  const npcTable = new Array<unknown>(16).fill(null);
  npcTable[3] = { x: 11 * 128 + 64, z: 12 * 128 + 64, level: 0, so: 31, eo: 26, fo: 32, type: { id: 1, name: "Man" } };
  const playerTable = new Array<unknown>(8).fill(null);
  playerTable[2] = { name: "Neighbor", x: 12 * 128 + 64, z: 10 * 128 + 64, level: 0, Vo: 55 };
  const messages = new Array<string | null>(100).fill(null);
  const senders = new Array<string | null>(100).fill(null);
  const types = new Int32Array(100);
  const combatState = new Array<number>(44).fill(0);
  combatState[43] = 2;
  messages[0] = "Hello world";
  senders[0] = "Neighbor";
  types[0] = 2;
  return {
    Fz: skills.xp,
    Dz: skills.current,
    Ez: skills.base,
    Xr: true,
    ev: 3_200,
    fv: 3_400,
    $u: 3_200,
    _u: 3_400,
    xn: 0,
    tz: local,
    Nu: npcTable,
    Pu: Int32Array.from([3]),
    Ou: 1,
    mz: playerTable,
    oz: Int32Array.from([2]),
    nz: 1,
    zz: grid,
    DA: types,
    EA: senders,
    FA: messages,
    lA: combatState,
    nv: {
      Rm: (_level: number, x: number, z: number) => (x === 10 && z === 10 ? { Jk: (123 << 14) | 1, Kk: 2 } : null),
      Sm: () => null,
      Tm: () => null,
      Um: () => null,
    },
    jm: makeHeights(),
    yn: makeHeights(),
    xy: 10 * 128 + 64,
    yy: -1_000,
    zy: 0,
    By: 0,
    Ay: 256,
    Lc: 260,
    Mc: 100,
    pluginIsIngame: () => true,
    pluginGetPlayerTile: () => ({ x: 3_210, z: 3_410, level: 0 }),
    pluginGetRunEnergy: () => 88,
    pluginIsRunning: () => true,
    pluginGetUsername: () => "Example",
    pluginGetStatXp: (id: number) => skills.xp[id],
    pluginGetStatLevel: (id: number) => skills.current[id],
    pluginGetStatBase: (id: number) => skills.base[id],
    pluginGetInvItemCount: (id: number) => (id === 995 ? 42 : 0),
    pluginGetComponentItemCount: (_component: number, id: number) => (id === 995 ? 42 : 0),
    pluginGetItemName: (id: number) => (id === 995 ? "Coins" : null),
    pluginGetVarp: (id: number) => (id === 43 ? 2 : id + 1),
  };
}

describe("skill mapping", () => {
  it("uses the confirmed current fields", () => {
    const client = fullClientFixture();
    const resolution = resolveSkillFields(client);
    expect(resolution.resolved?.source).toBe("mapped-field");
    expect(resolution.resolved?.xpField).toBe("Fz");
  });

  it("adaptively resolves one unique renamed triplet", () => {
    const values = skillVectors();
    values.current[0] = (values.current[0] ?? 1) + 5;
    const resolution = resolveSkillFields({ alpha: values.xp, beta: values.current, gamma: values.base });
    expect(resolution.resolved).toMatchObject({
      source: "adaptive",
      xpField: "alpha",
      currentField: "beta",
      baseField: "gamma",
    });
  });

  it("rejects an ambiguous adaptive mapping", () => {
    const values = skillVectors();
    const resolution = resolveSkillFields({
      alpha: values.xp,
      beta: values.current,
      duplicateCurrent: [...values.current],
      gamma: values.base,
    });
    expect(resolution.resolved).toBeNull();
    expect(resolution.failures).toContain("Adaptive skill mapping was ambiguous.");
  });
});

describe("client adapter", () => {
  it("normalizes core and passive state without writes", () => {
    const target = fullClientFixture();
    const client = new Proxy(target, {
      set: () => {
        throw new Error("adapter attempted a write");
      },
    });
    const adapter = new SolanaClientAdapter(client);
    const snapshot = adapter.readSnapshot(
      1_000,
      true,
      new Set(["skills", "npcs", "players", "groundItems", "chat", "sceneObjects", "tiles"]),
    );
    expect(snapshot.ingame).toBe(true);
    expect(snapshot.skills).toHaveLength(21);
    expect(snapshot.player).toMatchObject({ tile: { x: 3_210, z: 3_410, level: 0 }, animation: -1 });
    expect(snapshot.opponent).toMatchObject({ slot: 3, name: "Man", healthRatio: 26, healthScale: 32 });
    expect(snapshot.attackStyle).toEqual({ index: 2, name: "Lunge" });
    expect(snapshot.npcs).toEqual([
      { slot: 3, id: 1, name: "Man", tile: { x: 3_211, z: 3_412, level: 0 } },
    ]);
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.groundItems).toEqual([
      { id: 995, count: 42, name: "Coins", tile: { x: 3_210, z: 3_410, level: 0 } },
    ]);
    expect(adapter.projectGroundItems(snapshot.groundItems ?? [])[0]).toMatchObject({
      id: 995,
      name: "Coins",
      point: { x: expect.any(Number), y: expect.any(Number) },
    });
    expect(adapter.projectPlayers(snapshot.players ?? []).find((player) => player.name === "Neighbor")).toMatchObject({
      name: "Neighbor",
      combatLevel: 55,
      point: { x: expect.any(Number), y: expect.any(Number) },
    });
    expect(snapshot.chat?.[0]).toEqual({ index: 0, type: 2, sender: "Neighbor", text: "Hello world" });
    expect(snapshot.sceneObjects?.[0]).toMatchObject({ id: 123, kind: "wall", tile: { x: 3_210, z: 3_410, level: 0 } });
    expect(snapshot.tiles?.some((tile) => tile.playerTile)).toBe(true);
    expect(adapter.readProjectedDestinationTile()?.tile).toEqual({ x: 3_212, z: 3_411, level: 0 });
    expect(adapter.getInventoryCount(995)).toBe(42);
    expect(adapter.getVarp(4)).toBe(5);
    expect(adapter.getCapabilities().attackStyle.available).toBe(true);
  });

  it("clears the projected destination when the route is consumed", () => {
    const client = fullClientFixture();
    const adapter = new SolanaClientAdapter(client);
    expect(adapter.readProjectedDestinationTile()).not.toBeNull();
    (client.tz as { Lo: number }).Lo = 0;
    expect(adapter.readProjectedDestinationTile()).toBeNull();
  });

  it("learns exact custom item names from native ground-item menu entries", () => {
    const client = fullClientFixture();
    client.pluginGetItemName = undefined;
    client.Jz = 1;
    client.Tz = ["Take @lre@Server coins"];
    client.Rz = [617];
    client.Sz = [995];
    const adapter = new SolanaClientAdapter(client);
    expect(adapter.readGroundItems()[0]?.name).toBe("Server coins");
  });

  it("degrades capabilities independently", () => {
    const adapter = new SolanaClientAdapter({});
    const capabilities = adapter.getCapabilities();
    expect(capabilities.skills.available).toBe(false);
    expect(capabilities.projection.available).toBe(false);
    expect(capabilities.bankItems.available).toBe(false);
  });

  it("revalidates capabilities as the existing client finishes loading", () => {
    const client: Record<string, unknown> = { Fz: [], Dz: [], Ez: [] };
    const adapter = new SolanaClientAdapter(client);
    expect(adapter.getCapabilities().skills.available).toBe(false);
    const values = skillVectors();
    client.Fz = values.xp;
    client.Dz = values.current;
    client.Ez = values.base;
    const snapshot = adapter.readSnapshot(Date.now() + 3_000, true, new Set(["skills"]));
    expect(snapshot.skills).toHaveLength(21);
    expect(adapter.getCapabilities().skills.available).toBe(true);
  });

  it("rejects out-of-range attack style values", () => {
    const client = fullClientFixture();
    (client.lA as number[])[43] = 9;
    client.pluginGetVarp = (id: number) => (id === 43 ? 9 : id + 1);
    const adapter = new SolanaClientAdapter(client);
    expect(adapter.readAttackStyle()).toBeNull();
    expect(adapter.getCapabilities().attackStyle.available).toBe(false);
  });
});
