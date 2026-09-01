import { createGame, jump, step, type GameState } from "./game.ts";

// Synthesized background loop --- no audio asset to license or fetch, and it
// needs a user gesture to start, which lines up with the tap-to-play button.
const music = (() => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let nextNoteTime = 0;
  let step = 0;
  let schedulerId: number | null = null;

  // A four-chord pop progression (I-V-vi-IV in C major) rather than one
  // repeated bar --- bass and lead both re-arpeggiate for each chord, so the
  // full loop is 32 steps instead of 8 and doesn't loop every 1.2s. A hi-hat
  // tick and a downbeat kick add rhythm without needing a second melodic idea.
  type Quality = "major" | "minor";
  const PROGRESSION: { root: number; quality: Quality }[] = [
    { root: 48, quality: "major" }, // C
    { root: 55, quality: "major" }, // G
    { root: 57, quality: "minor" }, // Am
    { root: 53, quality: "major" }, // F
  ];
  // Indices into [root, third, fifth, octave] --- the same walking contour
  // for every chord, so the variety comes from the chord changing under it.
  const BASS_SHAPE = [0, 0, 1, 2, 3, 2, 1, 2];
  const LEAD_SHAPE = [3, 2, 1, 0, 1, 2, 3, 2];
  const STEPS_PER_PHRASE = BASS_SHAPE.length;
  const NOTE_DURATION = 0.15;
  const LOOKAHEAD = 0.12; // seconds of schedule buffer

  function chordTones({ root, quality }: { root: number; quality: Quality }): number[] {
    const third = root + (quality === "minor" ? 3 : 4);
    return [root, third, root + 7, root + 12];
  }

  function midiToFreq(note: number): number {
    return 440 * 2 ** ((note - 69) / 12);
  }

  function scheduleTone(
    time: number,
    freq: number,
    type: OscillatorType,
    peak: number,
    duration: number,
  ): void {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + Math.min(0.015, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // A short burst of filtered noise reads as a hi-hat without any sample.
  function scheduleHat(time: number): void {
    if (!ctx || !master) return;
    const bufferSize = Math.ceil(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  function scheduleStep(time: number, index: number): void {
    const phrase = PROGRESSION[Math.floor(index / STEPS_PER_PHRASE) % PROGRESSION.length];
    const tones = chordTones(phrase);
    const beat = index % STEPS_PER_PHRASE;

    scheduleTone(time, midiToFreq(tones[BASS_SHAPE[beat]]), "square", 0.14, NOTE_DURATION);
    scheduleTone(
      time,
      midiToFreq(tones[LEAD_SHAPE[beat]] + 12),
      "triangle",
      0.09,
      NOTE_DURATION * 0.9,
    );
    scheduleHat(time);
    if (beat === 0) {
      scheduleTone(time, midiToFreq(phrase.root - 24), "sine", 0.25, NOTE_DURATION * 1.3);
    }
  }

  function scheduler(): void {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(nextNoteTime, step);
      nextNoteTime += NOTE_DURATION;
      step += 1;
    }
    schedulerId = window.setTimeout(scheduler, 25);
  }

  return {
    start(): void {
      if (ctx) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
      nextNoteTime = ctx.currentTime + 0.05;
      step = 0;
      scheduler();
    },
    setMuted(muted: boolean): void {
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
    },
  };
})();

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
  music.start();
  music.setMuted(false);
}

function endGame(): void {
  uiState = "over";
  const score = currentScore();
  const best = Math.max(score, readBest());
  localStorage.setItem(BEST_KEY, String(best));
  gameoverTitleEl.textContent = "You fell!";
  finalScoreEl.textContent = String(score);
  finalBestEl.textContent = String(best);
  gameoverEl.classList.remove("hidden");
  music.setMuted(true);
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
