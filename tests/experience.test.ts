import { describe, expect, it } from "vitest";
import { levelForXp, MAX_LEVEL, XP_FOR_LEVEL, xpProgress } from "../src/experience";

describe("RuneScape experience table", () => {
  it("matches canonical thresholds", () => {
    expect(XP_FOR_LEVEL[1]).toBe(0);
    expect(XP_FOR_LEVEL[2]).toBe(83);
    expect(XP_FOR_LEVEL[50]).toBe(101_333);
    expect(XP_FOR_LEVEL[99]).toBe(13_034_431);
  });

  it("derives levels and maxed progress", () => {
    expect(levelForXp(82)).toBe(1);
    expect(levelForXp(83)).toBe(2);
    expect(levelForXp(13_034_431)).toBe(MAX_LEVEL);
    expect(xpProgress(13_034_431, 99)).toEqual({
      currentLevelXp: 13_034_431,
      nextLevelXp: null,
      remaining: 0,
      ratio: 1,
    });
  });
});

