import { afterEach, describe, expect, it, vi } from "vitest";
import { readCurrentSideTab, resolveCurrentSideTabField } from "../src/defensive-style-guard";
import { DefensiveStyleGuardPlugin } from "../src/plugins/defensive-style-guard";
import { JsonStorage, SettingsStore, type StorageLike } from "../src/storage";
import type { CapabilityMap, ObserverUpdate } from "../src/types";
import { createUiRoot } from "../src/ui/root";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function makeClient(): { activeTab: number; pluginSetSideTab(tab: number): void } {
  return new class {
    activeTab = 0;
    availableTabs = Array.from({ length: 14 }, (_, index) => index);
    pluginSetSideTab(tab: number): void { this.applySideTab(tab); }
    applySideTab(tab: number): void {
      if (tab < 0 || tab > 13 || this.availableTabs[tab] === -1) return;
      this.activeTab = tab;
    }
  }();
}

function update(): ObserverUpdate {
  return {
    snapshot: {
      at: 1, visible: true, ingame: true, username: null, skills: null,
      player: null, opponent: null, attackStyle: null,
    },
    previous: null,
    capabilities: {} as CapabilityMap,
    activeDeltaMs: 0,
    clientChanged: false,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("defensive style guard", () => {
  it("resolves the current side-tab field structurally", () => {
    const client = makeClient();
    expect(resolveCurrentSideTabField(client)).toBe("activeTab");
    expect(readCurrentSideTab(client)).toBe(0);
    client.pluginSetSideTab(3);
    expect(readCurrentSideTab(client)).toBe(3);
  });

  it("blocks the defensive row only while the combat tab is open", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 765, bottom: 503, width: 765, height: 503, toJSON: () => ({}),
    });
    document.body.append(canvas);
    const root = createUiRoot();
    const settings = new SettingsStore(new JsonStorage(new MemoryStorage()));
    settings.update({ hideDefensiveStyle: true });
    const client = makeClient();
    const plugin = new DefensiveStyleGuardPlugin();
    plugin.mount({
      shadowRoot: root.shadowRoot,
      settings,
      getClient: () => client,
      getMappingReport: () => ({
        clientBuild: "test", generatedAt: "now", clientAvailable: true, resolvedFields: {},
        capabilities: {} as CapabilityMap, properties: [], prototypeMethods: [], validationFailures: [],
      }),
    });
    plugin.onAvailability(true);
    plugin.onUpdate(update());
    expect((root.shadowRoot.querySelector(".sl-defensive-style-layer") as HTMLElement).hidden).toBe(false);
    expect(root.shadowRoot.querySelector(".sl-defensive-style-message")?.textContent).toBe("Defensive style hidden");

    client.pluginSetSideTab(1);
    plugin.onUpdate(update());
    expect((root.shadowRoot.querySelector(".sl-defensive-style-layer") as HTMLElement).hidden).toBe(true);
    plugin.unmount();
    root.destroy();
  });
});
