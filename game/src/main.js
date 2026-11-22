// Boot + game loop. The game auto-starts straight into the heist — no
// blocking title screen — with a short mission toast. ?shot=<scene>&seed=<n>
// stages one screenshot scene instead and renders a single frame.
import { WIDTH, HEIGHT } from './config.js';
import { createWorld, stepWorld } from './world.js';
import { createInput } from './input.js';
import { drawWorld } from './render.js';
import { initAudio, sfx, setAlarmLevel, toggleMute } from './audio.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') ?? 1) || 1;

if (shot) {
  // Screenshot mode: one staged frame, no loop.
  fitCanvas();
  const { world } = stageShot(shot, seed);
  drawWorld(ctx, world, false);
  window.__game = { world, shot, status: world.status, score: world.score, alarm: world.alarm };
} else {
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  let world = createWorld(seed);
  const input = createInput(canvas);
  let paused = false;
  let accumulator = 0;
  let last = performance.now();
  let statusT = 0;

  function startRun() {
    world = createWorld(seed);
    paused = false;
    accumulator = 0;
    world.message = 'Steal the Crown Jewel — then reach the getaway van!';
    world.messageTtl = 5;
  }
  startRun();

  function announce() {
    const room = world.level.roomAt(world.player.x, world.player.y);
    statusEl.textContent = world.status === 'play'
      ? `The Velvet Vault — ${room}. Alarm ${Math.round(world.alarm)} percent. ${Math.ceil(world.timeLeft)} seconds left. Score ${world.score}.`
      : `The Velvet Vault — ${world.status}. Score ${world.score}.`;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (input.pausePressed) { paused = !paused; input.pausePressed = false; }
    if (input.restartPressed) { startRun(); input.restartPressed = false; }
    if (input.mutePressed) { toggleMute(); input.mutePressed = false; }
    if (!paused && world.status === 'play') {
      accumulator += dt;
      let n = 0;
      while (accumulator >= STEP && n < 5) {
        const events = stepWorld(world, input.read(world.player), STEP);
        for (const e of events) {
          if (e === 'loot') sfx.loot();
          else if (e === 'door') sfx.door();
          else if (e === 'smoke') sfx.smoke();
          else if (e === 'jammer') sfx.jammer();
          else if (e === 'spotted') sfx.spotted();
          else if (e === 'caught' || e === 'alarm') sfx.caught();
          else if (e === 'win') sfx.win();
        }
        accumulator -= STEP;
        n += 1;
      }
      if (n === 5) accumulator = 0;
      setAlarmLevel(world.alarm);
    }
    statusT += dt;
    if (statusT > 1) { announce(); statusT = 0; }
    drawWorld(ctx, world, paused);
    requestAnimationFrame(frame);
  }
  canvas.addEventListener('pointerdown', initAudio, { once: true });
  window.addEventListener('keydown', initAudio, { once: true });
  window.__game = {
    get world() { return world; },
    get paused() { return paused; },
    restart: startRun,
  };
  announce();
  requestAnimationFrame(frame);
}
