import { describe, expect, it, vi } from "vitest";
import { PluginManager, type SolanaPlugin } from "../src/plugin-manager";
import { AttackStyleHudPlugin } from "../src/plugins/attack-style-hud";
import { CombatHudPlugin } from "../src/plugins/combat-hud";
import { PlayerNamesPlugin } from "../src/plugins/player-names";
import { TileOverlayPlugin } from "../src/plugins/tile-overlay";
import { XpTrackerPlugin } from "../src/plugins/xp-tracker";
import { JsonStorage, SettingsStore, type StorageLike } from "../src/storage";
import { SKILL_NAMES, type CapabilityMap, type ObserverUpdate } from "../src/types";
import { createUiRoot } from "../src/ui/root";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("UI and plugin framework", () => {
  it("migrates the old floating layout into the compact canvas dock", () => {
    const memory = new MemoryStorage();
    memory.setItem("solanalite:settings:v1", JSON.stringify({
      version: 1,
      panelX: 20,
      panelY: 20,
      collapsed: false,
      showAllSkills: true,
    }));
    const settings = new SettingsStore(new JsonStorage(memory)).get();
    expect(settings).toMatchObject({
      version: 13,
      placement: "canvas",
      collapsed: false,
      showAllSkills: true,
      showXpDrops: true,
      showXpGlobes: true,
      showHoveredTile: false,
      showDestinationTile: true,
      showGroundItemLabels: true,
      showClueLocator: true,
      menuShopBuy10: true,
      menuPetClickThrough: true,
    });
  });

  it("isolates its UI in a shadow root", () => {
    const ui = createUiRoot();
    expect(document.getElementById("solanascape-deck-root")).toBe(ui.host);
    expect(ui.shadowRoot.querySelector("style")?.textContent).toContain("pointer-events: none");
    ui.destroy();
    expect(document.getElementById("solanascape-deck-root")).toBeNull();
  });

  it("mounts plugins and reports capability availability", () => {
    const ui = createUiRoot();
    const manager = new PluginManager();
    const onAvailability = vi.fn();
    const onUpdate = vi.fn();
    const plugin: SolanaPlugin = {
      id: "test",
      requiredCapabilities: ["skills"],
      requiredSlices: ["skills"],
      mount: vi.fn(),
      onAvailability,
      onUpdate,
      unmount: vi.fn(),
    };
    manager.register(plugin);
    manager.mount({
      shadowRoot: ui.shadowRoot,
      settings: new SettingsStore(new JsonStorage(new MemoryStorage())),
      getMappingReport: () => ({
        clientBuild: "test",
        generatedAt: "now",
        clientAvailable: false,
        resolvedFields: {},
        capabilities: {} as CapabilityMap,
        properties: [],
        prototypeMethods: [],
        validationFailures: [],
      }),
    });
    const baseCapabilities = Object.fromEntries(
      ["session", "skills", "player", "npcs", "players", "groundItems", "chat", "sceneObjects", "inventoryLookup", "varps", "projection", "animation", "bankItems"].map(
        (name) => [name, { available: name !== "skills", source: name !== "skills" ? "public-api" : "unavailable", reason: name === "skills" ? "missing" : undefined }],
      ),
    ) as CapabilityMap;
    const update: ObserverUpdate = {
      snapshot: null,
      previous: null,
      capabilities: baseCapabilities,
      activeDeltaMs: 0,
      clientChanged: false,
    };
    manager.update(update);
    expect(onAvailability).toHaveBeenCalledWith(false, ["missing"]);
    expect(onUpdate).toHaveBeenCalledWith(update);
    expect(manager.requiredSlices()).toEqual(new Set(["skills"]));
    manager.unmount();
    ui.destroy();
  });

  it("renders a gained skill through the real XP plugin", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 865,
      bottom: 703,
      width: 765,
      height: 503,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.append(canvas);
    const ui = createUiRoot();
    const storage = new MemoryStorage();
    const settings = new SettingsStore(new JsonStorage(storage));
    const plugin = new XpTrackerPlugin();
    plugin.mount({
      shadowRoot: ui.shadowRoot,
      settings,
      getMappingReport: () => ({
        clientBuild: "test",
        generatedAt: "now",
        clientAvailable: true,
        resolvedFields: {},
        capabilities: {} as CapabilityMap,
        properties: [],
        prototypeMethods: [],
        validationFailures: [],
      }),
    });
    plugin.onAvailability(true);
    const makeSkills = (attackXp: number) => SKILL_NAMES.map((name, id) => ({
      id,
      name,
      xp: id === 0 ? attackXp : 0,
      currentLevel: id === 0 && attackXp >= 83 ? 2 : 1,
      baseLevel: id === 0 && attackXp >= 83 ? 2 : 1,
    }));
    const capabilities = {} as CapabilityMap;
    const baseline = {
      at: 1_000,
      visible: true,
      ingame: true,
      username: null,
      skills: makeSkills(0),
      player: null,
      opponent: null,
      attackStyle: null,
    } as const;
    plugin.onUpdate({
      snapshot: baseline,
      previous: null,
      capabilities,
      activeDeltaMs: 0,
      clientChanged: false,
    });
    plugin.onUpdate({
      snapshot: {
        at: 2_000,
        visible: true,
        ingame: true,
        username: null,
        skills: makeSkills(100),
        player: null,
        opponent: null,
        attackStyle: null,
      },
      previous: baseline,
      capabilities,
      activeDeltaMs: 1_000,
      clientChanged: false,
    });
    expect(ui.shadowRoot.querySelector(".sl-skill-name")).toBeNull();
    expect(ui.shadowRoot.querySelector(".sl-xp-drop")?.textContent).toBe("+100 xp");
    expect(ui.shadowRoot.querySelector(".sl-xp-drop")?.getAttribute("aria-label")).toBe("Attack, plus 100 XP");
    expect(ui.shadowRoot.querySelector<HTMLImageElement>(".sl-xp-drop-icon")?.src).toContain("attack.png");
    expect(ui.shadowRoot.querySelector<HTMLImageElement>(".sl-xp-globe-icon")?.src).toContain("attack.png");
    expect(ui.shadowRoot.querySelector(".sl-xp-globe-track")?.getAttribute("r")).toBe("20");
    expect(ui.shadowRoot.querySelector(".sl-xp-globe-progress")?.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(ui.shadowRoot.querySelector(".sl-xp-globe-tooltip")?.textContent).toContain("Current XP:100");
    expect(ui.shadowRoot.querySelector(".sl-xp-globe-tooltip")?.textContent).toContain("XP left:74");
    expect(ui.shadowRoot.querySelector(".sl-panel")).toBeNull();
    plugin.unmount();
    ui.destroy();
    canvas.remove();
  });

  it("renders the current attack style as a RuneLite-sized overlay", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 775,
      bottom: 523,
      width: 765,
      height: 503,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.append(canvas);
    const ui = createUiRoot();
    const plugin = new AttackStyleHudPlugin();
    plugin.mount({
      shadowRoot: ui.shadowRoot,
      settings: new SettingsStore(new JsonStorage(new MemoryStorage())),
      getMappingReport: () => ({
        clientBuild: "test",
        generatedAt: "now",
        clientAvailable: true,
        resolvedFields: {},
        capabilities: {} as CapabilityMap,
        properties: [],
        prototypeMethods: [],
        validationFailures: [],
      }),
    });
    plugin.onAvailability(true);
    plugin.onUpdate({
      snapshot: {
        at: 1,
        visible: true,
        ingame: true,
        username: null,
        skills: null,
        player: null,
        opponent: null,
        attackStyle: { index: 1, name: "Slash" },
      },
      previous: null,
      capabilities: {} as CapabilityMap,
      activeDeltaMs: 0,
      clientChanged: false,
    });
    expect(ui.shadowRoot.querySelector(".sl-attack-style-title")?.textContent).toBe("Slash");
    expect((ui.shadowRoot.querySelector(".sl-attack-style-layer") as HTMLElement).hidden).toBe(false);
    plugin.unmount();
    ui.destroy();
    canvas.remove();
  });

  it("renders opponent HP and projected tile toggles", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 765, bottom: 503, width: 765, height: 503,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.append(canvas);
    const ui = createUiRoot();
    const settings = new SettingsStore(new JsonStorage(new MemoryStorage()));
    const hoveredTile = {
      tile: { x: 3200, z: 3200, level: 0 }, playerTile: true,
      points: [{ x: 200, y: 200 }, { x: 240, y: 200 }, { x: 250, y: 230 }, { x: 190, y: 230 }],
    } as const;
    const destinationTile = {
      tile: { x: 3201, z: 3200, level: 0 }, playerTile: false,
      points: [{ x: 250, y: 200 }, { x: 290, y: 200 }, { x: 300, y: 230 }, { x: 240, y: 230 }],
    } as const;
    const context = {
      shadowRoot: ui.shadowRoot,
      settings,
      getHoveredTile: () => hoveredTile,
      getDestinationTile: () => destinationTile,
      getMappingReport: () => ({
        clientBuild: "test", generatedAt: "now", clientAvailable: true, resolvedFields: {},
        capabilities: {} as CapabilityMap, properties: [], prototypeMethods: [], validationFailures: [],
      }),
    };
    const tiles = new TileOverlayPlugin();
    const combat = new CombatHudPlugin();
    tiles.mount(context);
    combat.mount(context);
    settings.update({ showHoveredTile: true });
    tiles.onAvailability(true);
    combat.onAvailability(true);
    const skills = SKILL_NAMES.map((name, id) => ({
      id, name, xp: 0, currentLevel: id === 3 ? 38 : id === 5 ? 3 : 1,
      baseLevel: id === 3 ? 41 : id === 5 ? 10 : 1,
    }));
    const update: ObserverUpdate = {
      snapshot: {
        at: 1, visible: true, ingame: true, username: null, skills,
        player: { tile: { x: 3200, z: 3200, level: 0 }, runEnergy: 50, running: false, animation: -1 },
        opponent: { slot: 3, id: 1, name: "Man", healthRatio: 26, healthScale: 32, healthPercent: 81.25, animation: 31 },
        attackStyle: null,
        tiles: [hoveredTile],
      },
      previous: null, capabilities: {} as CapabilityMap, activeDeltaMs: 0, clientChanged: false,
    };
    tiles.onUpdate(update);
    combat.onUpdate(update);
    expect(ui.shadowRoot.querySelector(".sl-hovered-tile")).not.toBeNull();
    expect(ui.shadowRoot.querySelector(".sl-destination-tile")).not.toBeNull();
    expect(ui.shadowRoot.querySelector(".sl-opponent-name")?.textContent).toBe("Man");
    expect(ui.shadowRoot.querySelector(".sl-opponent-label")?.textContent).toBe("81%");
    expect(ui.shadowRoot.querySelector(".sl-hp-tile")).toBeNull();
    expect(ui.shadowRoot.querySelector(".sl-prayer-tile")).toBeNull();
    tiles.unmount();
    combat.unmount();
    ui.destroy();
    canvas.remove();
  });

  it("renders projected player names above nearby characters", () => {
    const rafBox: { callback: FrameRequestCallback | null } = { callback: null };
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      rafBox.callback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 765, bottom: 503, width: 765, height: 503,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.append(canvas);
    const ui = createUiRoot();
    const settings = new SettingsStore(new JsonStorage(new MemoryStorage()));
    const plugin = new PlayerNamesPlugin();
    let players = [
      { slot: -1, name: "Local", combatLevel: 100, tile: { x: 3200, z: 3200, level: 0 }, local: true },
      { slot: 2, name: "Neighbor", combatLevel: 55, tile: { x: 3201, z: 3200, level: 0 }, local: false },
    ];
    plugin.mount({
      shadowRoot: ui.shadowRoot,
      settings,
      getPlayers: () => players,
      projectPlayers: (players) => players.map((player, index) => ({
        ...player,
        point: { x: 220 + index * 30, y: 180 },
      })),
      getMappingReport: () => ({
        clientBuild: "test", generatedAt: "now", clientAvailable: true, resolvedFields: {},
        capabilities: {} as CapabilityMap, properties: [], prototypeMethods: [], validationFailures: [],
      }),
    });
    plugin.onAvailability(true);
    plugin.onUpdate({
      snapshot: {
        at: 1, visible: true, ingame: true, username: null, skills: null,
        player: null, opponent: null, attackStyle: null,
      },
      previous: null,
      capabilities: {} as CapabilityMap,
      activeDeltaMs: 0,
      clientChanged: false,
    });
    if (!rafBox.callback) throw new Error("Player names did not request an animation frame");
    rafBox.callback(0);
    expect(ui.shadowRoot.querySelector(".sl-player-name-local")?.textContent).toBe("Local level-100");
    expect([...ui.shadowRoot.querySelectorAll(".sl-player-name-label")].map((label) => label.textContent)).toContain("Neighbor level-55");
    players = [{ slot: -1, name: "Local", combatLevel: 100, tile: { x: 3200, z: 3200, level: 0 }, local: true }];
    rafBox.callback(16);
    expect([...ui.shadowRoot.querySelectorAll(".sl-player-name-label")].map((label) => label.textContent)).toEqual(["Local level-100"]);
    plugin.unmount();
    ui.destroy();
    canvas.remove();
  });

});
