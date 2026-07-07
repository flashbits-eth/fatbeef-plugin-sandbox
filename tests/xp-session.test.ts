import { describe, expect, it } from "vitest";
import { SKILL_NAMES, type SkillState } from "../src/types";
import { hashUsername, XpSessionEngine, validatePersistedSession } from "../src/xp-session";

function skills(overrides: Readonly<Record<number, number>> = {}): readonly SkillState[] {
  return SKILL_NAMES.map((name, id) => ({
    id,
    name,
    xp: overrides[id] ?? 0,
    currentLevel: 1,
    baseLevel: 1,
  }));
}

describe("XP session engine", () => {
  it("tracks gains and active-time rates", () => {
    const engine = new XpSessionEngine();
    engine.update(skills(), 0, 1_000);
    engine.update(skills({ 0: 100 }), 1_000, 2_000);
    for (let step = 1; step <= 720; step += 1) {
      engine.update(skills({ 0: 100 }), 5_000, 2_000 + step * 5_000);
    }
    const view = engine.getView();
    expect(view?.totalGained).toBe(100);
    expect(view?.skills[0]?.gained).toBe(100);
    expect(view?.skills[0]?.xpPerHour).toBe(100);
  });

  it("persists and resumes without counting offline time", () => {
    const first = new XpSessionEngine();
    first.update(skills(), 0, 1_000);
    first.update(skills({ 1: 50 }), 500, 1_500);
    const persisted = first.getPersisted();
    const resumed = new XpSessionEngine();
    resumed.load(persisted, skills({ 1: 50 }), 100_000);
    expect(resumed.getView()?.activeMs).toBe(500);
    expect(resumed.getView()?.skills[1]?.gained).toBe(50);
  });

  it("rebases the whole session after an XP rollback", () => {
    const engine = new XpSessionEngine();
    engine.update(skills({ 0: 100 }), 0, 1_000);
    engine.update(skills({ 0: 200 }), 100, 1_100);
    const result = engine.update(skills({ 0: 150 }), 100, 1_200);
    expect(result.rebased).toBe(true);
    expect(engine.getView()?.totalGained).toBe(0);
  });

  it("rejects incompatible persisted data", () => {
    expect(validatePersistedSession({ version: 1, baselineXp: [] })).toBeNull();
  });

  it("hashes normalized usernames without returning the source text", async () => {
    const left = await hashUsername(" Example ");
    const right = await hashUsername("example");
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
    expect(left).not.toContain("example");
  });
});
