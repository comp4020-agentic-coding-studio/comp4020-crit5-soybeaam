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
  mountain: loadImage("./bg/mountain.png"),
  cloudBig: loadImage("./bg/cloud_big.png"),
  cloudSmall: loadImage("./bg/cloud_small.png"),
  ground: loadImage("./bg/ground.png"),
  tree: loadImage("./bg/tree.png"),
  bush: loadImage("./bg/bush.png"),
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

function worldToScreen(worldX: number): number {
  return (worldX - state.playerX) * ZOOM + canvas.width * PLAYER_SCREEN_X / devicePixelRatio;
}

function drawTiledLayer(
  img: HTMLImageElement,
  groundY: number,
  parallax: number,
  drawScale: number,
  yFrac: number,
): void {
  if (!ready(img)) return;
  const h = img.height * drawScale;
  const w = img.width * drawScale;
  const period = w;
  const offset = ((state.playerX * parallax * ZOOM) % period + period) % period;
  const y = groundY - h * (1 - yFrac);
  const tiles = Math.ceil(canvas.width / period) + 2;
  for (let i = -1; i < tiles; i++) {
    const x = i * period - offset;
    ctx.drawImage(img, x, y, w, h);
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
  const skyGradient = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGradient.addColorStop(0, "#4a90d9");
  skyGradient.addColorStop(1, "#8fc6e8");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, canvas.width, groundY);

  const scale = devicePixelRatio * 1.4;
  drawTiledLayer(bg.cloudBig, groundY, 0.03, scale * 0.8, 0.85);
  drawTiledLayer(bg.cloudSmall, groundY, 0.05, scale * 0.6, 0.95);
  drawTiledLayer(bg.mountain, groundY, 0.2, scale * 1.6, 0);
  drawScattered(bg.tree, groundY, scale * 0.75, 340, 60);
  drawScattered(bg.bush, groundY, scale * 0.7, 340, 220);
}

function draw(): void {
  const scale = devicePixelRatio;
  const groundY = canvas.height * GROUND_SCREEN_Y;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(groundY);

  ctx.fillStyle = "#5a3d2b";
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
  if (ready(bg.ground)) {
    const groundScale = scale * 1.4;
    const tileW = bg.ground.width * groundScale;
    const tileH = bg.ground.height * groundScale;
    const offset = ((state.playerX * ZOOM) % tileW + tileW) % tileW;
    for (let x = -offset - tileW; x < canvas.width + tileW; x += tileW) {
      ctx.drawImage(bg.ground, x, groundY, tileW, tileH);
    }
  }

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

function tick(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  step(state, dt);
  updateAnim(dt);
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
