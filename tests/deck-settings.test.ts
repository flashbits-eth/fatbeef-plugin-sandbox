import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonStorage, SettingsStore, type StorageLike } from "../src/storage";
import type { CapabilityMap, ClientSnapshot } from "../src/types";
import { createDeckSettingsUi } from "../src/ui/deck-settings";
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

describe("Solanascape Deck settings", () => {
  it("opens from the minimap gear and controls unified settings", () => {
    const canvas = document.createElement("canvas");
    canvas.id = "canvas";
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 10, y: 20, left: 10, top: 20, right: 775, bottom: 523, width: 765, height: 503, toJSON: () => ({}),
    });
    document.body.append(canvas);
    const root = createUiRoot();
    const settings = new SettingsStore(new JsonStorage(new MemoryStorage()));
    const deck = createDeckSettingsUi({
      shadowRoot: root.shadowRoot,
      settings,
      getCapabilities: () => ({} as CapabilityMap),
      getSnapshot: () => ({
        at: 1,
        visible: true,
        ingame: true,
        username: "Fatbeef",
        skills: null,
        player: { tile: { x: 3200, z: 3200, level: 0 }, runEnergy: null, running: null, animation: null },
        opponent: null,
        attackStyle: null,
        chat: [{ index: 1, type: 0, sender: null, text: "Dig near 3210, 3212" }],
      }) as ClientSnapshot,
      getMappingReport: () => ({
        clientBuild: "test", generatedAt: "now", clientAvailable: true, resolvedFields: {},
        capabilities: {} as CapabilityMap, properties: [], prototypeMethods: [], validationFailures: [],
      }),
      resetXpSession: vi.fn(),
    });

    expect(deck.element.style.left).toBe("10px");
    const gear = root.shadowRoot.querySelector<HTMLButtonElement>(".deck-settings-gear");
    const backdrop = root.shadowRoot.querySelector<HTMLElement>(".deck-modal-backdrop");
    expect(backdrop?.hidden).toBe(true);
    gear?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(backdrop?.hidden).toBe(false);
    expect(root.shadowRoot.querySelector(".deck-modal-title")?.textContent).toBe("Solanascape Deck");
    expect(root.shadowRoot.querySelector("style")?.textContent).toContain("data:image/png;base64");
    expect([...root.shadowRoot.querySelectorAll(".deck-category-button")].some((button) => button.textContent === "General")).toBe(false);
    expect([...root.shadowRoot.querySelectorAll(".deck-category-button")].some((button) => button.textContent === "Camera")).toBe(false);

    const tilesTab = [...root.shadowRoot.querySelectorAll<HTMLButtonElement>(".deck-category-button")]
      .find((button) => button.textContent === "Tiles");
    tilesTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const hoveredRow = [...root.shadowRoot.querySelectorAll<HTMLLabelElement>(".deck-setting-row")]
      .find((row) => row.textContent?.includes("Hovered tile"));
    const checkbox = hoveredRow?.querySelector<HTMLInputElement>("input");
    if (!checkbox) throw new Error("Hovered tile setting missing");
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    expect(settings.get().showHoveredTile).toBe(true);

    const toolsTab = [...root.shadowRoot.querySelectorAll<HTMLButtonElement>(".deck-category-button")]
      .find((button) => button.textContent === "Tools");
    toolsTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.shadowRoot.querySelector(".deck-readout")?.textContent).toContain("Dig near 3210, 3212");
    const clueInput = root.shadowRoot.querySelector<HTMLInputElement>(".deck-text-input");
    if (!clueInput) throw new Error("Clue coordinate input missing");
    clueInput.value = "3210, 3212";
    root.shadowRoot.querySelector<HTMLButtonElement>(".deck-stone-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect([...root.shadowRoot.querySelectorAll(".deck-readout")].at(-1)?.textContent).toContain("Target: 3210, 3212, 0");

    deck.setMenuStatus({ patched: true, methodNames: ["scene"], sceneMenu: true });
    expect(root.shadowRoot.querySelector(".deck-hook-status")?.textContent).toBe("Scene menu swaps active");
    deck.destroy();
    root.destroy();
  });
});
