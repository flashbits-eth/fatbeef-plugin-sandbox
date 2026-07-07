import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MENU_SWAPPER_SETTINGS,
  installMenuSwapper,
  type MenuSwapperSettings,
} from "../src/menu-swapper";

function makeClient(): {
  menuCount: number;
  options: string[];
  opcodes: number[];
  targets: string[];
  buildPlayerMenu(targetLevel: number, option?: string): void;
  buildNpcMenu(targetLevel: number, option?: string): void;
} {
  return new class {
    menuCount = 0;
    options: string[] = [];
    opcodes: number[] = [];
    targets: string[] = [];

    buildPlayerMenu(targetLevel: number, option = "Attack"): void {
      if (this.menuCount >= 400) return;
      this.options[this.menuCount] = `${option} @whi@Target`;
      let priority = 0;
      if ("attack" === option.toLowerCase() && targetLevel > 50) priority = 2e3;
      this.opcodes[this.menuCount] = priority + 639;
      this.targets[this.menuCount] = "Walk here @whi@Target";
      this.menuCount += 1;
    }

    buildNpcMenu(targetLevel: number, option = "Attack"): void {
      if (this.menuCount >= 400) return;
      this.options[this.menuCount] = `${option} @yel@Lesser demon`;
      let priority = 0;
      if ("attack" === option.toLowerCase() && targetLevel > 50) priority = 2e3;
      this.opcodes[this.menuCount] = priority + 242;
      this.targets[this.menuCount] = "Examine @yel@Lesser demon";
      this.menuCount += 1;
    }
  }();
}

describe("left-click player Attack patch", () => {
  it("removes only the low-priority offset from player Attack", () => {
    const client = makeClient();
    const result = installMenuSwapper(client);
    expect(result.patched).toBe(true);
    client.buildPlayerMenu(100);
    expect(client.options[0]).toBe("Attack @whi@Target");
    expect(client.opcodes[0]).toBe(639);
  });

  it("removes the low-priority offset from NPC Attack", () => {
    const client = makeClient();
    const result = installMenuSwapper(client);
    expect(result.patched).toBe(true);
    client.buildNpcMenu(82);
    expect(client.options[0]).toBe("Attack @yel@Lesser demon");
    expect(client.opcodes[0]).toBe(242);
  });

  it("leaves non-Attack and already-normal entries unchanged", () => {
    const client = makeClient();
    installMenuSwapper(client);
    client.buildPlayerMenu(100, "Trade with");
    client.buildPlayerMenu(40);
    expect(client.opcodes).toEqual([639, 639]);
  });

  it("is idempotent", () => {
    const client = makeClient();
    const first = installMenuSwapper(client);
    const second = installMenuSwapper(client);
    expect(first.patched).toBe(true);
    expect(second).toMatchObject({ patched: true, methodNames: first.methodNames });
  });
});

function makeSceneClient(): {
  menuCount: number;
  options: string[];
  opcodes: number[];
  firstArgs: number[];
  secondArgs: number[];
  buildSceneMenu(): void;
} {
  return new class {
    menuCount = 1;
    options = ["Cancel"];
    opcodes = [1106];
    firstArgs = [0];
    secondArgs = [0];

    buildSceneMenu(): void {
      this.options[this.menuCount] = "Walk here";
      this.opcodes[this.menuCount] = 718;
      this.firstArgs[this.menuCount] = 1;
      this.secondArgs[this.menuCount] = 1;
      this.menuCount += 1;
      this.options[this.menuCount] = "Pickpocket @yel@Man";
      this.opcodes[this.menuCount] = 242;
      this.firstArgs[this.menuCount] = 2;
      this.secondArgs[this.menuCount] = 20;
      this.menuCount += 1;
      this.options[this.menuCount] = "Talk-to @yel@Man";
      this.opcodes[this.menuCount] = 209;
      this.firstArgs[this.menuCount] = 3;
      this.secondArgs[this.menuCount] = 30;
      this.menuCount += 1;
      this.options[this.menuCount] = "Attack @yel@Man";
      this.opcodes[this.menuCount] = 2_000 + 309;
      this.firstArgs[this.menuCount] = 4;
      this.secondArgs[this.menuCount] = 40;
      this.menuCount += 1;
      this.options[this.menuCount] = "Pick-up @yel@Devnet Drake";
      this.opcodes[this.menuCount] = 242;
      this.firstArgs[this.menuCount] = 5;
      this.secondArgs[this.menuCount] = 50;
      this.menuCount += 1;
      this.options[this.menuCount] = "Stroke @yel@Devnet Drake";
      this.opcodes[this.menuCount] = 209;
      this.firstArgs[this.menuCount] = 6;
      this.secondArgs[this.menuCount] = 60;
      this.menuCount += 1;
      this.options[this.menuCount] = "Open @cya@Door";
      this.opcodes[this.menuCount] = 1001;
      this.firstArgs[this.menuCount] = 7;
      this.secondArgs[this.menuCount] = 70;
      this.menuCount += 1;
      // Structural signatures from the native scene builder.
      void "Examine @cya@";
      void "Take @lre@";
    }
  }();
}

describe("Menu Swapper Lite scene rules", () => {
  it("prioritizes configured scene actions while preserving parallel menu fields", () => {
    const client = makeSceneClient();
    const settings: MenuSwapperSettings = {
      ...DEFAULT_MENU_SWAPPER_SETTINGS,
      talkTo: true,
      pickpocket: true,
    };
    const result = installMenuSwapper(client, () => settings);
    expect(result).toMatchObject({ patched: true, sceneMenu: true });
    client.buildSceneMenu();
    expect(client.options.at(-1)).toBe("Pickpocket @yel@Man");
    expect(client.opcodes.at(-1)).toBe(242);
    expect(client.firstArgs.at(-1)).toBe(2);
    expect(client.secondArgs.at(-1)).toBe(20);
    expect(client.opcodes[client.options.indexOf("Attack @yel@Man")]).toBe(309);
  });

  it("makes pet options click-through without stealing priority from doors", () => {
    const client = makeSceneClient();
    const settings: MenuSwapperSettings = {
      ...DEFAULT_MENU_SWAPPER_SETTINGS,
      pickpocket: false,
      npcAttack: false,
      petClickThrough: true,
    };
    installMenuSwapper(client, () => settings);
    client.buildSceneMenu();
    expect(client.options.at(-1)).toBe("Open @cya@Door");
    expect(client.options.slice(1, 3)).toEqual(["Pick-up @yel@Devnet Drake", "Stroke @yel@Devnet Drake"]);
  });

  it("reads settings dynamically and leaves rows untouched while disabled", () => {
    const client = makeSceneClient();
    let settings: MenuSwapperSettings = { ...DEFAULT_MENU_SWAPPER_SETTINGS, enabled: false };
    installMenuSwapper(client, () => settings);
    client.buildSceneMenu();
    expect(client.options.at(-1)).toBe("Open @cya@Door");
    expect(client.opcodes[client.options.indexOf("Attack @yel@Man")]).toBe(2_309);

    client.menuCount = 1;
    settings = { ...DEFAULT_MENU_SWAPPER_SETTINGS, playerAttack: false, npcAttack: false, bank: true, petClickThrough: false };
    client.options.length = 1;
    client.opcodes.length = 1;
    client.firstArgs.length = 1;
    client.secondArgs.length = 1;
    client.buildSceneMenu();
    expect(client.opcodes[client.options.indexOf("Attack @yel@Man")]).toBe(2_309);
  });
});

function makeShopClient(): {
  menuCount: number;
  options: string[];
  opcodes: number[];
  itemIds: number[];
  buildShopMenu(): void;
} {
  return new class {
    menuCount = 1;
    options = ["Cancel"];
    opcodes = [1106];
    itemIds = [0];

    buildShopMenu(): void {
      if (this.menuCount >= 400) return;
      this.options[this.menuCount] = "Value @or2@Blood rune";
      this.opcodes[this.menuCount] = 100;
      this.itemIds[this.menuCount] = 565;
      this.menuCount += 1;
      this.options[this.menuCount] = "Buy 1 @or2@Blood rune";
      this.opcodes[this.menuCount] = 101;
      this.itemIds[this.menuCount] = 565;
      this.menuCount += 1;
      this.options[this.menuCount] = "Buy 5 @or2@Blood rune";
      this.opcodes[this.menuCount] = 102;
      this.itemIds[this.menuCount] = 565;
      this.menuCount += 1;
      this.options[this.menuCount] = "Buy 10 @or2@Blood rune";
      this.opcodes[this.menuCount] = 103;
      this.itemIds[this.menuCount] = 565;
      this.menuCount += 1;
      this.options[this.menuCount] = "Examine @or2@Blood rune";
      this.opcodes[this.menuCount] = 104;
      this.itemIds[this.menuCount] = 565;
      this.menuCount += 1;
    }
  }();
}

describe("Menu Swapper shop rules", () => {
  it("prioritizes Buy 10 in shop menus", () => {
    const client = makeShopClient();
    const settings: MenuSwapperSettings = { ...DEFAULT_MENU_SWAPPER_SETTINGS, shopBuy10: true };
    const result = installMenuSwapper(client, () => settings);
    expect(result).toMatchObject({ patched: true, sceneMenu: false });
    client.buildShopMenu();
    expect(client.options.at(-1)).toBe("Buy 10 @or2@Blood rune");
    expect(client.opcodes.at(-1)).toBe(103);
    expect(client.itemIds.at(-1)).toBe(565);
  });

  it("leaves shop menus untouched when Buy 10 is disabled", () => {
    const client = makeShopClient();
    const settings: MenuSwapperSettings = { ...DEFAULT_MENU_SWAPPER_SETTINGS, shopBuy10: false };
    installMenuSwapper(client, () => settings);
    client.buildShopMenu();
    expect(client.options.at(-1)).toBe("Examine @or2@Blood rune");
    expect(client.options[1]).toBe("Value @or2@Blood rune");
  });

  it("keeps Buy 10 prioritized through the raw menu fallback", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const client = {
      Jz: 6,
      Tz: ["Cancel", "Value @or2@Blood rune", "Buy 1 @or2@Blood rune", "Buy 5 @or2@Blood rune", "Buy 10 @or2@Blood rune", "Examine @or2@Blood rune"],
      Rz: [1106, 100, 101, 102, 103, 104],
      Sz: [0, 565, 565, 565, 565, 565],
    };
    installMenuSwapper(client, () => ({ ...DEFAULT_MENU_SWAPPER_SETTINGS, shopBuy10: true }));
    callbacks[0]?.(0);
    expect(client.Tz.at(-1)).toBe("Buy 10 @or2@Blood rune");
    expect(client.Rz.at(-1)).toBe(103);
    expect(client.Sz.at(-1)).toBe(565);
  });
});
