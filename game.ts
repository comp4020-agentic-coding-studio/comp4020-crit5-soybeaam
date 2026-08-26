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
  runSpeed: number;
  jumpVelocity: number;
  gravity: number;
  groundY: number;
  obstacles: Obstacle[];
  nextSpawnX: number;
  spawnGap: number;
  finishX: number;
  status: "playing" | "won" | "lost";
}

export interface GameConfig {
  runSpeed?: number;
  jumpVelocity?: number;
  gravity?: number;
  finishX?: number;
  initialObstacle?: Obstacle;
  spawnGap?: number;
}

export function createGame(config: GameConfig = {}): GameState {
  const initialObstacle = config.initialObstacle ?? { x: 150, width: 16, kind: "gap" };
  return {
    playerX: 0,
    playerY: 0,
    velocityY: 0,
    isJumping: false,
    runSpeed: config.runSpeed ?? 90,
    jumpVelocity: config.jumpVelocity ?? 210,
    gravity: config.gravity ?? 520,
    groundY: 0,
    obstacles: [initialObstacle],
    nextSpawnX: initialObstacle.x + difficulty(initialObstacle.x).interval,
    spawnGap: config.spawnGap ?? 90,
    finishX: config.finishX ?? 1000,
    status: "playing",
  };
}

export function jump(state: GameState): void {
  if (state.status !== "playing") return;
  if (state.isJumping) return;
  state.velocityY = state.jumpVelocity;
  state.isJumping = true;
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

function difficulty(distance: number): { width: number; interval: number } {
  const t = Math.min(distance / 800, 1);
  return {
    width: 16 + t * 8,
    interval: 220 - t * 100,
  };
}

export function step(state: GameState, dt: number): void {
  if (state.status === "lost") {
    // keep falling through the gap so the loss reads as a fall, not a freeze
    state.velocityY -= state.gravity * dt;
    state.playerY += state.velocityY * dt;
    return;
  }
  if (state.status !== "playing") return;

  state.playerX += state.runSpeed * dt;

  if (state.isJumping) {
    state.velocityY -= state.gravity * dt;
    state.playerY += state.velocityY * dt;
    if (state.playerY <= 0) {
      state.playerY = 0;
      state.velocityY = 0;
      state.isJumping = false;
    }
  }

  while (state.playerX + 300 > state.nextSpawnX) {
    const { width, interval } = difficulty(state.nextSpawnX);
    state.obstacles.push({ x: state.nextSpawnX, width, kind: "gap" });
    state.nextSpawnX += interval;
  }
  state.obstacles = state.obstacles.filter((o) => o.x + o.width > state.playerX - 40);

  if (checkFallen(state)) {
    state.status = "lost";
    return;
  }

  if (state.playerX >= state.finishX) {
    state.status = "won";
  }
}
