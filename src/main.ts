import { cloneReport, createMappingReport } from "./diagnostics";
import { installMenuSwapper, type MenuSwapperSettings } from "./menu-swapper";
import { ClientObserver } from "./observer";
import { PluginManager } from "./plugin-manager";
import { AttackStyleHudPlugin } from "./plugins/attack-style-hud";
import { CombatHudPlugin } from "./plugins/combat-hud";
import { DefensiveStyleGuardPlugin } from "./plugins/defensive-style-guard";
import { HitpointsNotifierPlugin } from "./plugins/hitpoints-notifier";
import { GroundItemLabelsPlugin } from "./plugins/ground-item-labels";
import { PrayerNotifierPlugin } from "./plugins/prayer-notifier";
import { PlayerNamesPlugin } from "./plugins/player-names";
import { TileOverlayPlugin } from "./plugins/tile-overlay";
import { XpTrackerPlugin } from "./plugins/xp-tracker";
import { JsonStorage, SettingsStore, type UiSettings } from "./storage";
import type { CapabilityMap, SnapshotSlice, FatbeefPluginSandboxFacade } from "./types";
import { createDeckSettingsUi } from "./ui/deck-settings";
import { createUiRoot } from "./ui/root";

function cloneCapabilities(capabilities: CapabilityMap): CapabilityMap {
  return structuredClone(capabilities);
}

function menuSettings(settings: UiSettings): MenuSwapperSettings {
  return Object.freeze({
    enabled: settings.menuSwapperEnabled,
    playerAttack: settings.menuPlayerAttack,
    npcAttack: settings.menuNpcAttack,
    talkTo: false,
    pickpocket: settings.menuPickpocket,
    bank: false,
    trade: false,
    travel: false,
    take: false,
    shopBuy10: settings.menuShopBuy10,
    petClickThrough: settings.menuPetClickThrough,
  });
}

function migrateStandaloneMenuSettings(store: SettingsStore, storage: Storage, hadDeckSettings: boolean): void {
  if (hadDeckSettings) return;
  try {
    const raw = storage.getItem("fatbeef-plugin-sandbox.menu-swapper.settings.v1") ??
      storage.getItem(`solanascape-${"deck"}.menu-swapper.settings.v1`) ??
      storage.getItem("solanalite.menu-swapper.settings.v1");
    if (!raw) return;
    const legacy = JSON.parse(raw) as Record<string, unknown>;
    const boolean = (key: string, fallback: boolean): boolean => typeof legacy[key] === "boolean" ? legacy[key] : fallback;
    store.update({
      menuSwapperEnabled: boolean("enabled", true),
      menuPlayerAttack: boolean("playerAttack", true),
      menuNpcAttack: boolean("npcAttack", true),
      menuPickpocket: boolean("pickpocket", false),
      menuShopBuy10: boolean("shopBuy10", true),
      menuPetClickThrough: boolean("petClickThrough", true),
    });
  } catch {
    // Invalid legacy settings are ignored in favor of Deck defaults.
  }
}

function migrateLegacyDeckSettings(storage: Storage): void {
  if (storage.getItem("fatbeef-plugin-sandbox:settings:v12") !== null) return;
  for (const version of [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
    const key = `settings:v${version}`;
    const legacy = storage.getItem(`solanascape-${"deck"}:${key}`) ?? storage.getItem(`solanalite:${key}`);
    if (legacy === null) continue;
    storage.setItem(`fatbeef-plugin-sandbox:${key}`, legacy);
    return;
  }
}

function bootstrap(): void {
  const pageWindow = (typeof unsafeWindow === "undefined" ? window : unsafeWindow) as Window;
  if (pageWindow.FatbeefPluginSandbox) return;

  const ui = createUiRoot();
  const hadDeckSettings = window.localStorage.getItem("fatbeef-plugin-sandbox:settings:v12") !== null ||
    window.localStorage.getItem("fatbeef-plugin-sandbox:settings:v11") !== null ||
    window.localStorage.getItem("fatbeef-plugin-sandbox:settings:v10") !== null ||
    window.localStorage.getItem(`solanascape-${"deck"}:settings:v12`) !== null ||
    window.localStorage.getItem(`solanascape-${"deck"}:settings:v11`) !== null ||
    window.localStorage.getItem(`solanascape-${"deck"}:settings:v10`) !== null ||
    window.localStorage.getItem("solanalite:settings:v12") !== null ||
    window.localStorage.getItem("solanalite:settings:v11") !== null ||
    window.localStorage.getItem("solanalite:settings:v10") !== null ||
    window.localStorage.getItem("solanalite:settings:v9") !== null ||
    window.localStorage.getItem("solanalite:settings:v8") !== null ||
    window.localStorage.getItem("solanalite:settings:v7") !== null;
  migrateLegacyDeckSettings(window.localStorage);
  const settings = new SettingsStore(new JsonStorage(window.localStorage));
  migrateStandaloneMenuSettings(settings, window.localStorage, hadDeckSettings);
  const plugins = new PluginManager();
  const attackStyleHud = new AttackStyleHudPlugin();
  const xpTracker = new XpTrackerPlugin();
  const combatHud = new CombatHudPlugin();
  const defensiveStyleGuard = new DefensiveStyleGuardPlugin();
  const hitpointsNotifier = new HitpointsNotifierPlugin();
  const groundItemLabels = new GroundItemLabelsPlugin();
  const prayerNotifier = new PrayerNotifierPlugin();
  const playerNames = new PlayerNamesPlugin();
  const tileOverlay = new TileOverlayPlugin();
  plugins.register(attackStyleHud);
  plugins.register(combatHud);
  plugins.register(defensiveStyleGuard);
  plugins.register(hitpointsNotifier);
  plugins.register(groundItemLabels);
  plugins.register(playerNames);
  plugins.register(prayerNotifier);
  plugins.register(tileOverlay);
  plugins.register(xpTracker);
  const observer = new ClientObserver(pageWindow, () => {
    const slices = new Set<SnapshotSlice>(plugins.requiredSlices());
    const currentSettings = settings.get();
    if (currentSettings.showClueLocator) slices.add("chat");
    return slices;
  });
  plugins.mount({
    shadowRoot: ui.shadowRoot,
    settings,
    getClient: () => pageWindow.gameClient,
    getHoveredTile: () => observer.getAdapter()?.readProjectedTiles()[0] ?? null,
    getDestinationTile: () => observer.getAdapter()?.readProjectedDestinationTile() ?? null,
    getPlayers: () => observer.getAdapter()?.readPlayers() ?? Object.freeze([]),
    projectGroundItems: (items) => observer.getAdapter()?.projectGroundItems(items) ?? Object.freeze([]),
    projectPlayers: (players) => observer.getAdapter()?.projectPlayers(players) ?? Object.freeze([]),
    getMappingReport: () => createMappingReport(pageWindow.gameClient, observer.getAdapter()),
  });

  const deckSettings = createDeckSettingsUi({
    shadowRoot: ui.shadowRoot,
    settings,
    getCapabilities: () => observer.getCapabilities(),
    getSnapshot: () => observer.getSnapshot(),
    getMappingReport: () => createMappingReport(pageWindow.gameClient, observer.getAdapter()),
    resetXpSession: () => xpTracker.resetSession(),
  });
  const installMenu = (): void => {
    deckSettings.setMenuStatus(installMenuSwapper(pageWindow.gameClient, () => menuSettings(settings.get())));
  };
  installMenu();
  observer.subscribe((update) => {
    if (update.clientChanged) installMenu();
    plugins.update(update);
  });

  const facade: FatbeefPluginSandboxFacade = Object.freeze({
    version: __FATBEEF_PLUGIN_SANDBOX_VERSION__,
    getCapabilities: () => cloneCapabilities(observer.getCapabilities()),
    getMappingReport: () => cloneReport(createMappingReport(pageWindow.gameClient, observer.getAdapter())),
    resetXpSession: () => xpTracker.resetSession(),
  });
  Object.defineProperty(pageWindow, "FatbeefPluginSandbox", {
    configurable: true,
    enumerable: false,
    value: facade,
    writable: false,
  });
  observer.start();
}

if (document.documentElement) {
  bootstrap();
} else {
  window.addEventListener("DOMContentLoaded", bootstrap, { once: true });
}
