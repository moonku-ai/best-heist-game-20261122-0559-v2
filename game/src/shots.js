// Staged screenshot scenes (?shot=play|alarm|vault|end). Each one plays the
// real rules forward from a fresh world, steered by an autopilot that reads
// the tile grid (BFS), avoids guard and camera cones, picks the nearest
// reachable loot, picks the vault lock, grabs the jewel and runs for the
// exit — so every frame is a moment a short game really reaches, and the
// same seed always gives the same frame.
import { TILE, LOCKPICK_SECONDS } from './config.js';
import { findPath, losClear, tileAt } from './level.js';
import { createWorld, stepWorld } from './world.js';

const STEP = 1 / 60;
const PLAY_SECONDS = 30;
const SCENE_LIMIT_SECONDS = 200;

function tileOf(x, y) {
  return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** Tiles currently inside any guard's or camera's vision cone. */
function coneTiles(world) {
  const blocked = new Set();
  const mark = (x, y, dir, half, range) => {
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    const r = Math.ceil(range / TILE);
    for (let ty = cy - r; ty <= cy + r; ty += 1) {
      for (let tx = cx - r; tx <= cx + r; tx += 1) {
        if (tileAt(world.level, tx, ty) === 1) continue;
        const px = (tx + 0.5) * TILE;
        const py = (ty + 0.5) * TILE;
        const dist = Math.hypot(px - x, py - y);
        if (dist > range) continue;
        if (angleDiff(Math.atan2(py - y, px - x), dir) > half) continue;
        if (!losClear(world.level, x, y, px, py)) continue;
        blocked.add(ty * 32 + tx);
      }
    }
  };
  for (const g of world.guards) mark(g.x, g.y, g.dir, (60 * Math.PI) / 180, g.range);
  for (const c of world.cameras) {
    if (world.jammerTtl > 0) continue;
    mark(c.x, c.y, c.angle, (35 * Math.PI) / 180, c.range);
  }
  return blocked;
}

/** BFS that treats cone tiles as solid; falls back to the plain path when none exists. */
function safePath(world, sx, sy, tx, ty, danger) {
  const plain = findPath(world.level, sx, sy, tx, ty);
  if (plain.length === 0 || danger.size === 0) return plain;
  const solid = world.level.solid.slice();
  for (const key of danger) solid[key] = 1;
  const view = { ...world.level, solid };
  const safe = findPath(view, sx, sy, tx, ty);
  return safe.length > 0 ? safe : plain;
}

function nearestReachableLoot(world, danger) {
  const p = tileOf(world.player.x, world.player.y);
  let best = null;
  let bestLen = Infinity;
  for (const item of world.loot) {
    if (item.taken) continue;
    const path = safePath(world, p.tx, p.ty, Math.floor(item.x / TILE), Math.floor(item.y / TILE), danger);
    if (path.length > 0 && path.length < bestLen) { best = item; bestLen = path.length; }
  }
  return best;
}

function newPilot(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    path: [], repathT: 0, goal: null, danger: new Set(), rng,
    provoke: false,
  };
}

/**
 * The autopilot's brain: returns the input for this tick. When chased it
 * throws smoke and flees to the farthest safe tile; otherwise it walks its
 * cone-avoiding BFS path to the goal, sneaking past nearby guards and
 * holding E at the vault door. In provoke mode it walks straight at the
 * nearest guard (used to stage a chase for the alarm shot).
 */
export function autopilot(world, pilot) {
  const p = world.player;
  const input = { mx: 0, my: 0, sneak: false, interact: false, smoke: false, jammer: false };
  if (world.status !== 'play') return input;

  const chaser = world.guards.find((g) => g.state === 'chase');
  if (chaser) {
    if (world.tools.smoke > 0 && world.smoke.length === 0) input.smoke = true;
    pilot.repathT -= STEP;
    if (pilot.repathT <= 0 || pilot.path.length === 0) {
      const here = tileOf(p.x, p.y);
      const danger = coneTiles(world);
      let best = null;
      let bestScore = -1;
      for (let i = 0; i < 30; i += 1) {
        const tx = 1 + Math.floor(pilot.rng() * 30);
        const ty = 1 + Math.floor(pilot.rng() * 16);
        if (danger.has(ty * 32 + tx)) continue;
        const path = safePath(world, here.tx, here.ty, tx, ty, danger);
        if (path.length === 0) continue;
        const d = Math.hypot(tx * TILE - chaser.x, ty * TILE - chaser.y);
        const score = d + path.length * 5;
        if (score > bestScore) { bestScore = score; best = path; }
      }
      pilot.path = best ?? [];
      pilot.repathT = 0.7;
    }
  } else {
    pilot.repathT -= STEP;
    const door = world.vaultDoor;
    const nearDoor = Math.hypot(p.x - door.x, p.y - door.y) < 55;
    if (door.locked && nearDoor) {
      input.interact = true;
      return input;
    }
    if (pilot.repathT <= 0 || pilot.path.length === 0) {
      const here = tileOf(p.x, p.y);
      const danger = pilot.provoke ? new Set() : coneTiles(world);
      pilot.danger = danger;
      let goal = null;
      if (world.hasJewel) {
        goal = tileOf(world.exit.x, world.exit.y);
      } else if (pilot.provoke) {
        // Walk into the nearest guard's cone head-on, then stand still in it
        // until the guard commits to a chase — close enough to be seen,
        // far enough to outrun the catch.
        let nearest = null;
        let nearestD = Infinity;
        for (const g of world.guards) {
          const d = Math.hypot(g.x - p.x, g.y - p.y);
          if (d < nearestD) { nearestD = d; nearest = g; }
        }
        if (nearest && nearestD < 150) {
          pilot.path = [];
          return input; // stand in the cone and wait for the chase
        }
        const ahead = nearest
          ? { x: nearest.x + Math.cos(nearest.dir) * 160, y: nearest.y + Math.sin(nearest.dir) * 160 }
          : { x: world.exit.x, y: world.exit.y };
        goal = tileOf(Math.max(TILE, Math.min(31 * TILE, ahead.x)), Math.max(TILE, Math.min(17 * TILE, ahead.y)));
      } else {
        const loot = nearestReachableLoot(world, danger);
        if (loot) {
          goal = tileOf(loot.x, loot.y);
        } else if (door.locked) {
          goal = { tx: door.tx - 1, ty: door.ty }; // stand west of the vault door
        } else {
          goal = tileOf(world.exit.x, world.exit.y);
        }
      }
      pilot.goal = goal;
      pilot.path = safePath(world, here.tx, here.ty, goal.tx, goal.ty, danger);
      pilot.repathT = 0.5;
    }
  }

  if (pilot.path.length > 0) {
    const next = pilot.path[0];
    const px = (next.tx + 0.5) * TILE;
    const py = (next.ty + 0.5) * TILE;
    const dx = px - p.x;
    const dy = py - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) {
      pilot.path.shift();
    } else {
      input.mx = dx / dist;
      input.my = dy / dist;
    }
  }
  // Sneak when a guard is close (never while fleeing a chase or provoking one).
  if (!chaser && !pilot.provoke) {
    for (const guard of world.guards) {
      if (Math.hypot(guard.x - p.x, guard.y - p.y) < 200) { input.sneak = true; break; }
    }
  }
  // Jam a camera that has us on screen.
  if (world.cameras.some((c) => c.alert) && world.tools.jammer > 0 && world.jammerTtl <= 0) {
    input.jammer = true;
  }
  return input;
}

function runFor(world, pilot, seconds, stopWhen) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepWorld(world, autopilot(world, pilot), STEP);
    if (stopWhen && stopWhen(world)) return true;
    if (world.status !== 'play') return false;
  }
  return stopWhen ? stopWhen(world) : true;
}

/**
 * Stage one named scene and return { world, screen }.
 * start: the opening seconds (thief at the door, guards on patrol).
 * play: mid-heist — loot pocketed, alarm warm, guards on the move.
 * alarm: a chase in progress, alarm high, guard on the thief.
 * vault: inside The Vault, jewel taken, Voss closing in.
 * end: the getaway — won, score on screen.
 */
export function stageShot(name, seed = 1) {
  const world = createWorld(seed);
  const pilot = newPilot(seed);
  if (name === 'start') {
    runFor(world, pilot, 2, null);
    return { world, screen: 'play' };
  }
  if (name === 'alarm') {
    pilot.provoke = true;
    runFor(world, pilot, 60, (w) => w.guards.some((g) => g.state === 'chase') && w.alarm >= 45);
    pilot.provoke = false;
    runFor(world, pilot, 0.8, null);
    return { world, screen: 'play' };
  }
  if (name === 'vault') {
    runFor(world, pilot, SCENE_LIMIT_SECONDS, (w) => w.hasJewel);
    runFor(world, pilot, 1, null);
    return { world, screen: 'play' };
  }
  if (name === 'end') {
    runFor(world, pilot, SCENE_LIMIT_SECONDS, (w) => w.status === 'won');
    return { world, screen: world.status === 'won' ? 'won' : 'play' };
  }
  // play (default): mid-heist.
  runFor(world, pilot, PLAY_SECONDS, null);
  return { world, screen: 'play' };
}

export { LOCKPICK_SECONDS };
