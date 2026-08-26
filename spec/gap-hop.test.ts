import { describe, expect, it } from "vitest";
import { checkFallen, createGame } from "../game.ts";

// The one rule the brief asks us to back with a focused test: standing over
// a gap while grounded is a fall. Being airborne (jumping) or outside any
// gap must not be.
describe("Gap Hop fall rule", () => {
  it("falls when grounded inside a gap", () => {
    const state = createGame({ initialObstacle: { x: 10, width: 20, kind: "gap" } });
    state.playerX = 15;
    state.playerY = 0;
    expect(checkFallen(state)).toBe(true);
  });

  it("does not fall when airborne over the same gap", () => {
    const state = createGame({ initialObstacle: { x: 10, width: 20, kind: "gap" } });
    state.playerX = 15;
    state.playerY = 40;
    expect(checkFallen(state)).toBe(false);
  });

  it("does not fall when grounded before the gap starts", () => {
    const state = createGame({ initialObstacle: { x: 10, width: 20, kind: "gap" } });
    state.playerX = 5;
    state.playerY = 0;
    expect(checkFallen(state)).toBe(false);
  });

  it("does not fall when grounded past the gap's far edge", () => {
    const state = createGame({ initialObstacle: { x: 10, width: 20, kind: "gap" } });
    state.playerX = 31;
    state.playerY = 0;
    expect(checkFallen(state)).toBe(false);
  });

  it("falls exactly at the gap's near edge", () => {
    const state = createGame({ initialObstacle: { x: 10, width: 20, kind: "gap" } });
    state.playerX = 10;
    state.playerY = 0;
    expect(checkFallen(state)).toBe(true);
  });
});
