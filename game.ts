// Pure game logic for Gap Hop — no DOM/canvas here, so it stays testable and
// survives a renderer change. World units are arbitrary "meters"; the
// renderer maps them to pixels.

export type Direction = 1 | -1;

export interface Obstacle {
  x: number; // leading edge, world units from start
  width: number; // gap/obstacle width
  kind: "gap" | "wall";
}

export interface GameState {
  playerX: number; // world position, advances at runSpeed
  playerY: number; // 0 = ground, positive = height above ground
  velocityY: number;
  isJumping: boolean;
  jumpsRemaining: number;
  maxJumps: number;
  runSpeed: number;
  baseRunSpeed: number;
  jumpVelocity: number;
  gravity: number;
  groundY: number;
  obstacles: Obstacle[];
  nextSpawnX: number;
  spawnGap: number;
  status: "playing" | "lost";
}

export interface GameConfig {
  runSpeed?: number;
  jumpVelocity?: number;
  gravity?: number;
  initialObstacle?: Obstacle;
  spawnGap?: number;
  maxJumps?: number;
}

export function createGame(config: GameConfig = {}): GameState {
  const initialObstacle = config.initialObstacle ?? { x: 150, width: 16, kind: "gap" };
  const maxJumps = config.maxJumps ?? 2;
  const baseRunSpeed = config.runSpeed ?? 90;
  return {
    playerX: 0,
    playerY: 0,
    velocityY: 0,
    isJumping: false,
    jumpsRemaining: maxJumps,
    maxJumps,
    runSpeed: baseRunSpeed,
    baseRunSpeed,
    jumpVelocity: config.jumpVelocity ?? 210,
    gravity: config.gravity ?? 520,
    groundY: 0,
    obstacles: [initialObstacle],
    nextSpawnX: initialObstacle.x + difficulty(initialObstacle.x).interval,
    spawnGap: config.spawnGap ?? 90,
    status: "playing",
  };
}

/** Grounded or airborne, as long as a jump remains (double jump) it fires. */
export function jump(state: GameState): void {
  if (state.status !== "playing") return;
  if (state.jumpsRemaining <= 0) return;
  state.velocityY = state.jumpVelocity;
  state.isJumping = true;
  state.jumpsRemaining -= 1;
}

/** The one focused rule under test: has the player fallen into a gap? */
export function checkFallen(state: GameState): boolean {
  if (state.playerY > 0.5) return false; // airborne, can't have fallen yet
  return state.obstacles.some(
    (obstacle) =>
      obstacle.kind === "gap" &&
      state.playerX >= obstacle.x &&
      state.playerX <= obstacle.x + obstacle.width,
  );
}

// Widths/intervals ramp up with distance on average, but each gap jitters
// randomly around that average so the rhythm doesn't feel like a metronome.
// The jitter is wide enough that some gaps land far above the average width
// --- occasional gaps that demand the full double jump, not just a hop.
function difficulty(distance: number): { width: number; interval: number } {
  const t = Math.min(distance / 800, 1);
  const baseWidth = 22 + t * 20;
  const baseInterval = 220 - t * 110;
  const widthJitter = (Math.random() - 0.5) * 36;
  const intervalJitter = (Math.random() - 0.5) * 60;
  return {
    width: Math.max(10, baseWidth + widthJitter),
    interval: Math.max(70, baseInterval + intervalJitter),
  };
}

// Score (world distance) is the only difficulty knob the player feels apart
// from gap width: every 250 units traveled, speed steps up by 12 world
// units/sec, capping at 2.5x the base speed so a long run stays hard rather
// than becoming unplayable.
const SPEEDUP_INTERVAL = 250;
const SPEEDUP_STEP = 12;
const SPEEDUP_CAP_FACTOR = 2.5;

function speedFor(distance: number, baseRunSpeed: number): number {
  const tier = Math.floor(distance / SPEEDUP_INTERVAL);
  return Math.min(baseRunSpeed + tier * SPEEDUP_STEP, baseRunSpeed * SPEEDUP_CAP_FACTOR);
}

export function step(state: GameState, dt: number): void {
  if (state.status === "lost") {
    // keep falling through the gap so the loss reads as a fall, not a freeze
    state.velocityY -= state.gravity * dt;
    state.playerY += state.velocityY * dt;
    return;
  }
  if (state.status !== "playing") return;

  state.runSpeed = speedFor(state.playerX, state.baseRunSpeed);
  state.playerX += state.runSpeed * dt;

  if (state.isJumping) {
    state.velocityY -= state.gravity * dt;
    state.playerY += state.velocityY * dt;
    if (state.playerY <= 0) {
      state.playerY = 0;
      state.velocityY = 0;
      state.isJumping = false;
      state.jumpsRemaining = state.maxJumps;
    }
  }

  while (state.playerX + 300 > state.nextSpawnX) {
    const { width, interval } = difficulty(state.nextSpawnX);
    state.obstacles.push({ x: state.nextSpawnX, width, kind: "gap" });
    state.nextSpawnX += interval;
  }
  // Margin generous enough that an obstacle is always well behind the
  // visible screen area (not just behind the player) before it's dropped,
  // so nothing visibly vanishes mid-scroll.
  state.obstacles = state.obstacles.filter((o) => o.x + o.width > state.playerX - 300);

  if (checkFallen(state)) {
    state.status = "lost";
  }
}
