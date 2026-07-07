import type { AttackMenuPatchResult } from "../menu-swapper";
import type { SettingsStore, UiSettings } from "../storage";
import type { CapabilityMap, ClientSnapshot, MappingReport, WorldTile } from "../types";

type SettingKey = Exclude<keyof UiSettings, "version" | "panelX" | "panelY" | "collapsed" | "showAllSkills" | "placement">;
type ToggleSettingKey = { [Key in SettingKey]: UiSettings[Key] extends boolean ? Key : never }[SettingKey];
type CategoryId = "xp" | "combat" | "tiles" | "tools" | "menu";

interface DeckSettingsContext {
  readonly shadowRoot: ShadowRoot;
  readonly settings: SettingsStore;
  getCapabilities(): CapabilityMap;
  getSnapshot(): ClientSnapshot | null;
  getMappingReport(): MappingReport;
  resetXpSession(): void;
}

export interface DeckSettingsUi {
  readonly element: HTMLElement;
  setMenuStatus(result: AttackMenuPatchResult): void;
  destroy(): void;
}

const CATEGORIES = Object.freeze([
  { id: "xp", label: "XP" },
  { id: "combat", label: "Combat" },
  { id: "tiles", label: "Tiles" },
  { id: "tools", label: "Tools" },
  { id: "menu", label: "Menu Swaps" },
] as const);

function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function section(title: string): HTMLElement {
  return createElement("h3", "deck-section-title", title);
}

function formatTile(tile: WorldTile | null | undefined): string {
  return tile ? `${tile.x}, ${tile.z}, ${tile.level}` : "Unknown";
}

function distanceBetween(a: WorldTile, b: WorldTile): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

function directionToTarget(player: WorldTile, target: WorldTile): string {
  const eastWest = target.x > player.x ? "east" : target.x < player.x ? "west" : "";
  const northSouth = target.z > player.z ? "north" : target.z < player.z ? "south" : "";
  return [northSouth, eastWest].filter(Boolean).join("-") || "here";
}

function parseTileTarget(value: string): WorldTile | null {
  const match = value.match(/(\d{3,5})\D+(\d{3,5})(?:\D+(\d))?/);
  if (!match) return null;
  const x = Number(match[1]);
  const z = Number(match[2]);
  const level = match[3] === undefined ? 0 : Number(match[3]);
  return Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(level) ? { x, z, level } : null;
}

function findRecentTileTarget(snapshot: ClientSnapshot | null): WorldTile | null {
  for (const message of snapshot?.chat ?? []) {
    const target = parseTileTarget(`${message.sender ?? ""} ${message.text}`);
    if (target) return target;
  }
  return null;
}

function findRecentClueText(snapshot: ClientSnapshot | null): readonly string[] {
  return (snapshot?.chat ?? [])
    .map((message) => message.text.trim())
    .filter((text) => /\b(clue|dig|search|coordinate|degrees?|north|south|east|west)\b/i.test(text))
    .slice(0, 3);
}

export function createDeckSettingsUi(context: DeckSettingsContext): DeckSettingsUi {
  const layer = createElement("div", "deck-settings-layer");
  layer.hidden = true;
  const scene = createElement("div", "deck-settings-scene");
  const gear = createElement("button", "deck-settings-gear");
  gear.type = "button";
  gear.title = "Fatbeef Plugin Sandbox settings";
  gear.setAttribute("aria-label", "Open Fatbeef Plugin Sandbox settings");
  gear.setAttribute("aria-expanded", "false");

  const backdrop = createElement("div", "deck-modal-backdrop");
  backdrop.hidden = true;
  const modal = createElement("section", "deck-modal");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "Fatbeef Plugin Sandbox settings");

  const titlebar = createElement("header", "deck-modal-titlebar");
  const title = createElement("div", "deck-modal-title", "Fatbeef Plugin Sandbox");
  const close = createElement("button", "deck-modal-close");
  close.type = "button";
  close.title = "Close";
  close.setAttribute("aria-label", "Close settings");
  titlebar.append(title, close);

  const body = createElement("div", "deck-modal-body");
  const navigation = createElement("nav", "deck-category-nav");
  navigation.setAttribute("aria-label", "Settings categories");
  const content = createElement("main", "deck-settings-content");
  const panels = new Map<CategoryId, HTMLElement>();
  const tabs = new Map<CategoryId, HTMLButtonElement>();
  const checkboxes = new Map<ToggleSettingKey, HTMLInputElement[]>();
  let activeCategory: CategoryId = "xp";
  let menuStatus: AttackMenuPatchResult | null = null;

  const addPanel = (id: CategoryId): HTMLElement => {
    const panel = createElement("div", "deck-category-panel");
    panel.dataset.category = id;
    panel.hidden = id !== activeCategory;
    panels.set(id, panel);
    content.append(panel);
    return panel;
  };

  const activate = (id: CategoryId): void => {
    activeCategory = id;
    tabs.forEach((button, category) => button.setAttribute("aria-pressed", String(category === id)));
    panels.forEach((panel, category) => { panel.hidden = category !== id; });
  };

  CATEGORIES.forEach(({ id, label }) => {
    const tab = createElement("button", "deck-category-button", label);
    tab.type = "button";
    tab.dataset.category = id;
    tab.setAttribute("aria-pressed", String(id === activeCategory));
    tab.addEventListener("click", () => activate(id));
    tabs.set(id, tab);
    navigation.append(tab);
    addPanel(id);
  });

  const copyDiagnostics = createElement("button", "deck-category-button deck-diagnostics-copy", "Diagnostics");
  copyDiagnostics.type = "button";
  copyDiagnostics.title = "Copy redacted client diagnostics";
  copyDiagnostics.addEventListener("click", () => {
    const payload = JSON.stringify(context.getMappingReport(), null, 2);
    if (!navigator.clipboard?.writeText) {
      copyDiagnostics.textContent = "Unavailable";
      window.setTimeout(() => { copyDiagnostics.textContent = "Diagnostics"; }, 1_500);
      return;
    }
    void navigator.clipboard.writeText(payload).then(
      () => {
        copyDiagnostics.textContent = "Copied!";
        window.setTimeout(() => { copyDiagnostics.textContent = "Diagnostics"; }, 1_500);
      },
      () => {
        copyDiagnostics.textContent = "Copy failed";
        window.setTimeout(() => { copyDiagnostics.textContent = "Diagnostics"; }, 1_500);
      },
    );
  });
  navigation.append(copyDiagnostics);

  const syncCheckboxes = (): void => {
    const settings = context.settings.get();
    checkboxes.forEach((entries, key) => entries.forEach((checkbox) => { checkbox.checked = Boolean(settings[key]); }));
  };

  const addToggle = (panel: HTMLElement, key: ToggleSettingKey, label: string, description: string): void => {
    const row = createElement("label", "deck-setting-row");
    const copy = createElement("span", "deck-setting-copy");
    copy.append(createElement("span", "deck-setting-name", label), createElement("span", "deck-setting-description", description));
    const input = createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(context.settings.get()[key]);
    input.addEventListener("change", () => {
      context.settings.update({ [key]: input.checked });
      checkboxes.get(key)?.forEach((entry) => { entry.checked = input.checked; });
    });
    const sprite = createElement("span", "deck-checkbox");
    sprite.setAttribute("aria-hidden", "true");
    row.append(copy, input, sprite);
    panel.append(row);
    checkboxes.set(key, [...checkboxes.get(key) ?? [], input]);
  };

  const addButton = (panel: HTMLElement, label: string, description: string, action: () => void): void => {
    const row = createElement("div", "deck-setting-row deck-action-row");
    const copy = createElement("span", "deck-setting-copy");
    copy.append(createElement("span", "deck-setting-name", label), createElement("span", "deck-setting-description", description));
    const button = createElement("button", "deck-stone-button", label);
    button.type = "button";
    button.addEventListener("click", action);
    row.append(copy, button);
    panel.append(row);
  };

  const addReadout = (panel: HTMLElement, text: string): HTMLElement => {
    const readout = createElement("div", "deck-readout", text);
    panel.append(readout);
    return readout;
  };

  const xp = panels.get("xp")!;
  xp.append(section("Experience"));
  addToggle(xp, "showXpDrops", "XP drops", "Show skill icons and XP gains beside the scene.");
  addToggle(xp, "showXpGlobes", "XP globes", "Show temporary skill progress globes after gains.");
  addButton(xp, "Clear", "Clear active XP drops and globes.", () => context.resetXpSession());

  const combat = panels.get("combat")!;
  combat.append(section("Combat overlays"));
  addToggle(combat, "showOpponentInfo", "Opponent health", "Show the current opponent's approximate health.");
  addToggle(combat, "showAttackStyle", "Attack style", "Display the selected combat style.");
  addToggle(combat, "hideDefensiveStyle", "Hide defensive style", "Block the defensive style while the combat tab is open.");
  combat.append(section("Threshold alerts"));
  addToggle(combat, "hitpointsAlerts", "Low Hitpoints", "Beep once below 10 HP and again below 5 HP.");
  addToggle(combat, "prayerAlerts", "Low Prayer", "Beep once below 10 Prayer and again below 5 Prayer.");

  const tiles = panels.get("tiles")!;
  tiles.append(section("Tile indicators"));
  addToggle(tiles, "showHoveredTile", "Hovered tile", "Shade the tile under the game cursor.");
  addToggle(tiles, "showDestinationTile", "Destination tile", "Shade your destination until it is reached.");
  addToggle(tiles, "showGroundItemLabels", "Ground item names", "Show names and quantities above nearby ground items.");
  addToggle(tiles, "showPlayerNames", "Player names", "Show names above nearby players.");

  const tools = panels.get("tools")!;
  tools.append(section("Clue solver"));
  const clueHelpReadout = addReadout(tools, "Recent clue-like chat text will appear here.");
  addToggle(tools, "showClueLocator", "Enable clue locator", "Read recent chat only while this locator is enabled.");
  const clueInputRow = createElement("div", "deck-setting-row deck-input-row");
  const clueInputCopy = createElement("span", "deck-setting-copy");
  clueInputCopy.append(createElement("span", "deck-setting-name", "Target tile"), createElement("span", "deck-setting-description", "Paste x,z or x z level coordinates."));
  const clueInput = createElement("input", "deck-text-input");
  clueInput.type = "text";
  clueInput.inputMode = "numeric";
  clueInput.placeholder = "3200, 3200";
  clueInputRow.append(clueInputCopy, clueInput);
  tools.append(clueInputRow);
  const clueReadout = addReadout(tools, "Enter a target tile or refresh after a coordinate appears in chat.");
  addButton(tools, "Refresh", "Refresh clue text and coordinate data from the latest client snapshot.", () => updateToolsText());

  const menu = panels.get("menu")!;
  menu.append(section("Menu Swapper"));
  const menuStatusElement = createElement("div", "deck-hook-status", "Waiting for game client");
  menu.append(menuStatusElement);
  addToggle(menu, "menuSwapperEnabled", "Enable menu swaps", "Master switch for native left-click priorities.");
  menu.append(section("Attack options"));
  addToggle(menu, "menuPlayerAttack", "Player Attack", "Prioritize native Attack on players.");
  addToggle(menu, "menuNpcAttack", "NPC Attack", "Prioritize native Attack on NPCs.");
  menu.append(section("Interaction priority"));
  addToggle(menu, "menuShopBuy10", "Shop Buy 10", "Prioritize Buy 10 in shop item menus.");
  addToggle(menu, "menuPetClickThrough", "Pet click-through", "Make Walk here win over pet interaction options.");
  addToggle(menu, "menuPickpocket", "Pickpocket", "Prioritize Pickpocket over Talk-to.");

  function updateToolsText(): void {
    const snapshot = context.getSnapshot();
    const settings = context.settings.get();
    if (!snapshot?.ingame) {
      clueHelpReadout.textContent = "Waiting for an in-game snapshot.";
      clueReadout.textContent = "Waiting for an in-game snapshot.";
      return;
    }

    if (!settings.showClueLocator) {
      clueHelpReadout.textContent = "Clue helper is disabled.";
      clueReadout.textContent = "Clue locator is disabled.";
      return;
    }
    const clueText = findRecentClueText(snapshot);
    clueHelpReadout.textContent = clueText.length ? `Recent: ${clueText.join(" | ")}` : "No recent clue text found in chat.";
    const playerTile = snapshot.player?.tile ?? null;
    const chatTarget = findRecentTileTarget(snapshot);
    if (!clueInput.value.trim() && chatTarget) clueInput.value = formatTile(chatTarget);
    const target = parseTileTarget(clueInput.value) ?? chatTarget;
    if (!playerTile) {
      clueReadout.textContent = `Player tile: ${formatTile(playerTile)}. Target: ${formatTile(target)}.`;
    } else if (!target) {
      clueReadout.textContent = `Player tile: ${formatTile(playerTile)}. Enter a target tile to locate it.`;
    } else {
      clueReadout.textContent = `Player: ${formatTile(playerTile)} - Target: ${formatTile(target)} - ${distanceBetween(playerTile, target)} tiles ${directionToTarget(playerTile, target)}.`;
    }
  }

  const updateDynamicText = (): void => {
    syncCheckboxes();
    updateToolsText();
    if (menuStatus) {
      menuStatusElement.textContent = menuStatus.patched
        ? menuStatus.sceneMenu ? "Scene menu swaps active" : "Attack swaps active"
        : menuStatus.reason ?? "Menu hook unavailable";
      menuStatusElement.classList.toggle("deck-live", menuStatus.patched);
    }
  };

  body.append(navigation, content);
  modal.append(titlebar, body);
  backdrop.append(modal);
  scene.append(gear, backdrop);
  layer.append(scene);
  context.shadowRoot.append(layer);

  const setOpen = (open: boolean): void => {
    backdrop.hidden = !open;
    gear.setAttribute("aria-expanded", String(open));
    if (open) updateDynamicText();
  };
  gear.addEventListener("click", () => setOpen(backdrop.hidden !== false));
  close.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) setOpen(false); });

  const syncPlacement = (): void => {
    const rect = document.querySelector<HTMLCanvasElement>("canvas#canvas")?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      layer.hidden = true;
      return;
    }
    layer.hidden = false;
    layer.style.left = `${Math.round(rect.left)}px`;
    layer.style.top = `${Math.round(rect.top)}px`;
    layer.style.width = `${Math.round(rect.width)}px`;
    layer.style.height = `${Math.round(rect.height)}px`;
  };
  syncPlacement();
  const placementTimer = window.setInterval(syncPlacement, 500);
  window.addEventListener("resize", syncPlacement, { passive: true });
  window.addEventListener("scroll", syncPlacement, { passive: true });

  return Object.freeze({
    element: layer,
    setMenuStatus(result: AttackMenuPatchResult): void {
      menuStatus = result;
      updateDynamicText();
    },
    destroy(): void {
      window.clearInterval(placementTimer);
      window.removeEventListener("resize", syncPlacement);
      window.removeEventListener("scroll", syncPlacement);
      layer.remove();
    },
  });
}
