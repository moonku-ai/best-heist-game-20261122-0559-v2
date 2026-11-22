// Browser verification for The Velvet Vault: serves game/, takes the four
// staged screenshots, then really plays the live game with the keyboard
// (moves, picks up loot, pauses) and fails on any console/page error.
// Run: node verify.mjs   (from this repository's root)
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/home/hatch/workspace/makefun/node_modules/');
const { chromium } = require('playwright-core');

const PORT = 8081;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = JSON.parse(readFileSync('./shots.json', 'utf8'));
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { stdio: 'pipe' });
await new Promise((resolve) => setTimeout(resolve, 800));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

try {
  // 1. Staged screenshots.
  for (const shot of SHOTS) {
    await page.goto(`${BASE}/${shot.query}`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => {
      const g = window.__game;
      return g ? { status: g.status, score: g.score, alarm: Math.round(g.alarm) } : null;
    });
    console.log(`shot ${shot.name}:`, JSON.stringify(state));
    await page.screenshot({ path: `./screenshots/${shot.name}`, type: 'jpeg', quality: 82 });
    const size = statSync(`./screenshots/${shot.name}`).size;
    check(state !== null, `${shot.name} renders`);
    check(size <= 262144, `${shot.name} <= 256 KiB (${Math.round(size / 1024)} KiB)`);
  }
  const alarm = await page.evaluate(() => window.__game?.alarm ?? 0);
  void alarm;

  // 2. Live play: the game auto-starts into gameplay.
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const start = await page.evaluate(() => {
    const w = window.__game.world;
    return { status: w.status, x: w.player.x, y: w.player.y, score: w.score };
  });
  check(start.status === 'play', `live game auto-starts in play (status=${start.status})`);

  // 3. Keyboard play: follow a BFS path to the nearest loot until the score moves.
  let pickedUp = false;
  for (let i = 0; i < 400 && !pickedUp; i += 1) {
    const s = await page.evaluate(() => {
      const w = window.__game.world;
      const level = w.level;
      // Inline BFS on the live solid grid (same rules as the game's own).
      const bfs = (sx, sy, tx, ty) => {
        if (level.solid[ty * 32 + tx] === 1) return [];
        const prev = new Int32Array(32 * 18).fill(-1);
        const q = [sy * 32 + sx];
        prev[sy * 32 + sx] = sy * 32 + sx;
        for (let h = 0; h < q.length; h += 1) {
          const cur = q[h];
          const cx = cur % 32;
          const cy = Math.floor(cur / 32);
          if (cx === tx && cy === ty) break;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= 32 || ny >= 18 || level.solid[ny * 32 + nx] === 1) continue;
            if (prev[ny * 32 + nx] !== -1) continue;
            prev[ny * 32 + nx] = cur;
            q.push(ny * 32 + nx);
          }
        }
        if (prev[ty * 32 + tx] === -1) return [];
        const path = [];
        let cur = ty * 32 + tx;
        while (cur !== sy * 32 + sx) { path.push(cur); cur = prev[cur]; }
        return path.reverse();
      };
      const loot = w.loot.filter((l) => !l.taken);
      const px = Math.floor(w.player.x / 40);
      const py = Math.floor(w.player.y / 40);
      let bestPath = null;
      for (const l of loot) {
        const path = bfs(px, py, Math.floor(l.x / 40), Math.floor(l.y / 40));
        if (path.length > 0 && (!bestPath || path.length < bestPath.length)) bestPath = path;
      }
      if (!bestPath || bestPath.length === 0) return { score: w.score, done: true };
      const next = bestPath[0];
      return {
        score: w.score,
        tx: (next % 32 + 0.5) * 40,
        ty: (Math.floor(next / 32) + 0.5) * 40,
        px: w.player.x,
        py: w.player.y,
      };
    });
    if (s.score > 0) { pickedUp = true; break; }
    if (s.done || s.tx === undefined) break;
    const dx = s.tx - s.px;
    const dy = s.ty - s.py;
    // Hold both axes when diagonal, like a human: axis-separated collision
    // then slides the thief through one-tile doors instead of jamming on them.
    const keys = [];
    if (dx > 6) keys.push('ArrowRight');
    else if (dx < -6) keys.push('ArrowLeft');
    if (dy > 6) keys.push('ArrowDown');
    else if (dy < -6) keys.push('ArrowUp');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(80);
    for (const k of keys) await page.keyboard.up(k);
  }
  check(pickedUp, 'keyboard play picks up loot (score > 0)');

  // 4. Pause freezes the world.
  const before = await page.evaluate(() => window.__game.world.time);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(700);
  const during = await page.evaluate(() => window.__game.world.time);
  await page.keyboard.press('KeyP');
  check(Math.abs(during - before) < 0.01, `pause freezes time (${before.toFixed(2)} -> ${during.toFixed(2)})`);

  // 5. No browser errors anywhere.
  check(errors.length === 0, `0 browser errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S)`);
  process.exit(1);
}
console.log('\nAll browser checks passed.');
