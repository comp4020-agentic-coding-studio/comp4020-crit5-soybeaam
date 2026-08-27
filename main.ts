import { createGame, jump, step, type GameState } from "./game.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#runner")!;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

const bg = {
  sky: loadImage("./bg/sky.png"),
  tree: loadImage("./bg/tree.png"),
  bush: loadImage("./bg/bush.png"),
  bushSmall: loadImage("./bg/bush_small.png"),
  rock: loadImage("./bg/rock.png"),
  flower: loadImage("./bg/flower.png"),
};

function ready(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

type AnimName = "run" | "jump" | "fall" | "die";
const FRAME_COUNTS: Record<AnimName, number> = { run: 8, jump: 8, fall: 8, die: 4 };
const FRAME_DURATION = 0.06; // seconds per frame

const sprites: Record<AnimName, HTMLImageElement[]> = { run: [], jump: [], fall: [], die: [] };
for (const name of Object.keys(FRAME_COUNTS) as AnimName[]) {
  for (let i = 0; i < FRAME_COUNTS[name]; i++) {
    const img = new Image();
    img.src = `./sprites/${name}_${i}.png`;
    sprites[name].push(img);
  }
}

let animName: AnimName = "run";
let animTime = 0;

function updateAnim(dt: number): void {
  const previous = animName;
  if (state.status === "lost") {
    animName = "die";
  } else if (state.isJumping) {
    animName = state.velocityY > 0 ? "jump" : "fall";
  } else {
    animName = "run";
  }
  animTime = animName === previous ? animTime + dt : 0;
}

function currentFrame(): HTMLImageElement {
  const frames = sprites[animName];
  const loop = animName !== "die";
  let index = Math.floor(animTime / FRAME_DURATION);
  index = loop ? index % frames.length : Math.min(index, frames.length - 1);
  return frames[index];
}

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

const GRASS = "#7cb824";
const DIRT = "#5a3d2b";

function worldToScreen(worldX: number): number {
  return (worldX - state.playerX) * ZOOM + canvas.width * PLAYER_SCREEN_X / devicePixelRatio;
}

// Rounds every drawn pixel rect to whole pixels so adjacent tiles butt up
// exactly with no fractional-pixel seam between them.
function drawSkyCover(img: HTMLImageElement, coverHeight: number, parallax: number): void {
  if (!ready(img)) return;
  const h = Math.round(coverHeight);
  const w = Math.round((img.width / img.height) * h);
  const period = w;
  const offset = Math.round(((state.playerX * parallax * ZOOM) % period + period) % period);
  const tiles = Math.ceil(canvas.width / period) + 2;
  for (let i = -1; i < tiles; i++) {
    const x = i * period - offset;
    ctx.drawImage(img, x, 0, w, h);
  }
}

function drawScattered(
  img: HTMLImageElement,
  groundY: number,
  drawScale: number,
  spacing: number,
  phase: number,
): void {
  if (!ready(img)) return;
  const h = img.height * drawScale;
  const w = img.width * drawScale;
  const firstIndex = Math.floor((state.playerX - 300) / spacing) - 1;
  const lastIndex = Math.ceil((state.playerX + 300) / spacing) + 1;
  for (let i = firstIndex; i < lastIndex; i++) {
    const worldX = i * spacing + phase;
    const x = worldToScreen(worldX) * devicePixelRatio - w / 2;
    if (x < -w || x > canvas.width + w) continue;
    ctx.drawImage(img, x, groundY - h, w, h);
  }
}

function drawBackground(groundY: number): void {
  if (!ready(bg.sky)) {
    ctx.fillStyle = "#8fc6e8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawSkyCover(bg.sky, canvas.height, 0.15);

  const scale = devicePixelRatio * 1.4;
  drawScattered(bg.rock, groundY, scale * 0.7, 420, 40);
  drawScattered(bg.tree, groundY, scale * 0.75, 340, 60);
  drawScattered(bg.bush, groundY, scale * 0.7, 340, 220);
  drawScattered(bg.bushSmall, groundY, scale * 0.65, 260, 140);
  drawScattered(bg.flower, groundY, scale * 0.9, 180, 20);
}

function draw(): void {
  const scale = devicePixelRatio;
  const groundY = canvas.height * GROUND_SCREEN_Y;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(groundY);

  // Ground is a flat solid colour (grass cap + dirt fill), not sprite art.
  const grassBand = 8 * scale;
  ctx.fillStyle = DIRT;
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, groundY, canvas.width, grassBand);

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
    ctx.clearRect(startPx, groundY, endPx - startPx, canvas.height - groundY);
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
  const size = 28 * scale;
  const frame = currentFrame();
  if (frame.complete && frame.naturalWidth > 0) {
    ctx.drawImage(frame, playerScreenX - size / 2, playerScreenY - size, size, size);
  }
}

type UiState = "menu" | "playing" | "over";
let uiState: UiState = "menu";

const BEST_KEY = "gap-hop:best-score";
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const scoreEl = document.querySelector<HTMLSpanElement>("#score")!;
const bestEl = document.querySelector<HTMLSpanElement>("#best")!;
const menuEl = document.querySelector<HTMLDivElement>("#menu")!;
const gameoverEl = document.querySelector<HTMLDivElement>("#gameover")!;
const gameoverTitleEl = document.querySelector<HTMLHeadingElement>("#gameover-title")!;
const finalScoreEl = document.querySelector<HTMLSpanElement>("#final-score")!;
const finalBestEl = document.querySelector<HTMLSpanElement>("#final-best")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#restart-btn")!;

function readBest(): number {
  return Number(localStorage.getItem(BEST_KEY) ?? 0);
}

function currentScore(): number {
  return Math.floor(state.playerX);
}

function startGame(): void {
  state = createGame();
  uiState = "playing";
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  hud.classList.remove("hidden");
  bestEl.textContent = String(readBest());
}

function endGame(): void {
  uiState = "over";
  const score = currentScore();
  const best = Math.max(score, readBest());
  localStorage.setItem(BEST_KEY, String(best));
  gameoverTitleEl.textContent = state.status === "won" ? "You made it!" : "You fell!";
  finalScoreEl.textContent = String(score);
  finalBestEl.textContent = String(best);
  gameoverEl.classList.remove("hidden");
}

function tick(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (uiState === "playing") {
    step(state, dt);
    updateAnim(dt);
    scoreEl.textContent = String(currentScore());
    if (state.status !== "playing") {
      endGame();
    }
  }
  draw();
  requestAnimationFrame(tick);
}

function handleJumpInput(): void {
  if (uiState === "playing") {
    jump(state);
  }
}

canvas.addEventListener("pointerdown", handleJumpInput);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowUp") {
    e.preventDefault();
    if (uiState === "menu") {
      startGame();
    } else if (uiState === "over") {
      startGame();
    } else {
      handleJumpInput();
    }
  }
});

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);
bestEl.textContent = String(readBest());

requestAnimationFrame((now) => {
  lastTime = now;
  requestAnimationFrame(tick);
});
