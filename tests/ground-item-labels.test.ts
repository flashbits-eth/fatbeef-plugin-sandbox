import { afterEach, describe, expect, it, vi } from "vitest";
import { GroundItemLabelsPlugin } from "../src/plugins/ground-item-labels";
import { JsonStorage, SettingsStore, type StorageLike } from "../src/storage";
import type { CapabilityMap, ObserverUpdate } from "../src/types";
import { createUiRoot } from "../src/ui/root";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ground item labels", () => {
  it("renders projected names and formatted quantities above nearby tiles", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 1530, bottom: 1006, width: 1530, height: 1006, toJSON: () => ({}),
    });
    document.body.append(canvas);
    let frame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const ui = createUiRoot();
    const settings = new SettingsStore(new JsonStorage(new MemoryStorage()));
    const plugin = new GroundItemLabelsPlugin();
    plugin.mount({
      shadowRoot: ui.shadowRoot,
      settings,
      getMappingReport: () => ({
        clientBuild: "test", generatedAt: "now", clientAvailable: true, resolvedFields: {},
        capabilities: {} as CapabilityMap, properties: [], prototypeMethods: [], validationFailures: [],
      }),
      projectGroundItems: (items) => items.map((item) => Object.freeze({ ...item, point: Object.freeze({ x: 200, y: 100 }) })),
    });
    plugin.onAvailability(true);
    plugin.onUpdate({
      snapshot: {
        at: 1, visible: true, ingame: true, username: null, skills: null, player: null,
        opponent: null, attackStyle: null,
        groundItems: [Object.freeze({ id: 995, count: 12_450, name: "Coins", tile: Object.freeze({ x: 3200, z: 3200, level: 0 }) })],
      },
      previous: null,
      capabilities: {} as CapabilityMap,
      activeDeltaMs: 0,
      clientChanged: false,
    } satisfies ObserverUpdate);
    const runFrame = frame as FrameRequestCallback | null;
    runFrame?.(0);

    const label = ui.shadowRoot.querySelector<HTMLElement>(".sl-ground-item-label");
    expect(label?.textContent).toBe("Coins (12.4K)");
    expect(label?.style.left).toBe("400px");
    expect(ui.shadowRoot.querySelector("style")?.textContent).toContain('font: 8px/8px "Solanascape Deck RuneScape Small"');
    plugin.unmount();
    ui.destroy();
  });
});
