import { createGame, jump, step, type GameState } from "./game.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#runner")!;
const ctx = canvas.getContext("2d")!;

function resize(): void {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
window.addEventListener("resize", resize);
resize();

let state: GameState = createGame();
let lastTime = performance.now();

const GROUND_SCREEN_Y = 0.68; // fraction of canvas height where the ground line sits
const PLAYER_SCREEN_X = 0.28; // fraction of canvas width where the player sits, world scrolls under it
const ZOOM = 2.4; // css px per world unit; keeps only the next gap or two in view

function worldToScreen(worldX: number): number {
  return (worldX - state.playerX) * ZOOM + canvas.width * PLAYER_SCREEN_X / devicePixelRatio;
}

function draw(): void {
  const scale = devicePixelRatio;
  const groundY = canvas.height * GROUND_SCREEN_Y;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#2a2f3a";
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  for (const obstacle of state.obstacles) {
    const startPx = worldToScreen(obstacle.x) * scale;
    const endPx = worldToScreen(obstacle.x + obstacle.width) * scale;
    ctx.lineTo(startPx, groundY);
    ctx.moveTo(endPx, groundY);
  }
  ctx.lineTo(canvas.width, groundY);
  ctx.stroke();

  for (const obstacle of state.obstacles) {
    const startPx = worldToScreen(obstacle.x) * scale;
    const endPx = worldToScreen(obstacle.x + obstacle.width) * scale;
    ctx.fillStyle = "#0f1115";
    ctx.fillRect(startPx, groundY, endPx - startPx, canvas.height - groundY);
    ctx.strokeStyle = "#7c8291";
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(startPx, groundY + 4 * scale);
    ctx.lineTo(startPx, canvas.height);
    ctx.moveTo(endPx, groundY + 4 * scale);
    ctx.lineTo(endPx, canvas.height);
    ctx.stroke();
  }

  const finishPx = worldToScreen(state.finishX) * scale;
  if (finishPx > 0 && finishPx < canvas.width) {
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(finishPx, groundY - 60 * scale);
    ctx.lineTo(finishPx, groundY);
    ctx.stroke();
  }

  const playerScreenX = worldToScreen(state.playerX) * scale;
  const playerScreenY = groundY - state.playerY * scale * ZOOM;
  ctx.fillStyle = state.status === "lost" ? "#ef4444" : state.status === "won" ? "#34d399" : "#e5e7eb";
  const size = 16 * scale;
  ctx.fillRect(playerScreenX - size / 2, playerScreenY - size, size, size);
}

function tick(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  step(state, dt);
  draw();
  requestAnimationFrame(tick);
}

function handleInput(): void {
  if (state.status === "playing") {
    jump(state);
  } else {
    state = createGame();
  }
}

canvas.addEventListener("pointerdown", handleInput);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowUp") {
    e.preventDefault();
    handleInput();
  }
});

requestAnimationFrame((now) => {
  lastTime = now;
  requestAnimationFrame(tick);
});
