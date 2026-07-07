import { describe, expect, it, vi } from "vitest";
import { PrayerNotifierPlugin } from "../src/plugins/prayer-notifier";
import { SKILL_NAMES, type CapabilityMap, type ObserverUpdate, type SkillState } from "../src/types";

function update(prayer: number, clientChanged = false): ObserverUpdate {
  const skills: SkillState[] = SKILL_NAMES.map((name, id) => ({
    id,
    name,
    xp: 0,
    currentLevel: id === 5 ? prayer : 1,
    baseLevel: 1,
  }));
  return {
    snapshot: {
      at: 1_000,
      visible: true,
      ingame: true,
      username: null,
      skills,
      player: null,
      opponent: null,
      attackStyle: null,
    },
    previous: null,
    capabilities: {} as CapabilityMap,
    activeDeltaMs: 250,
    clientChanged,
  };
}

describe("PrayerNotifierPlugin", () => {
  it("beeps once per crossing below ten Prayer", () => {
    const beep = vi.fn();
    const criticalBeep = vi.fn();
    const plugin = new PrayerNotifierPlugin(beep, criticalBeep);
    plugin.onAvailability(true);

    plugin.onUpdate(update(12));
    plugin.onUpdate(update(9));
    plugin.onUpdate(update(8));
    expect(beep).toHaveBeenCalledTimes(1);
    expect(criticalBeep).not.toHaveBeenCalled();

    plugin.onUpdate(update(4));
    plugin.onUpdate(update(3));
    expect(criticalBeep).toHaveBeenCalledTimes(1);

    plugin.onUpdate(update(10));
    plugin.onUpdate(update(9));
    expect(beep).toHaveBeenCalledTimes(2);
  });

  it("uses only the critical alert when Prayer jumps directly below five", () => {
    const beep = vi.fn();
    const criticalBeep = vi.fn();
    const plugin = new PrayerNotifierPlugin(beep, criticalBeep);
    plugin.onAvailability(true);
    plugin.onUpdate(update(12));
    plugin.onUpdate(update(4));
    expect(beep).not.toHaveBeenCalled();
    expect(criticalBeep).toHaveBeenCalledTimes(1);
  });

  it("establishes a silent baseline after client replacement", () => {
    const beep = vi.fn();
    const plugin = new PrayerNotifierPlugin(beep);
    plugin.onAvailability(true);
    plugin.onUpdate(update(15));
    plugin.onUpdate(update(7, true));
    expect(beep).not.toHaveBeenCalled();
  });
});
