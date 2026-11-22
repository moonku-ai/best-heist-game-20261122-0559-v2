// The world: one tick of the heist. Owns the player, the alarm, the loot,
// the tools, the vault door and the win/lose rules. Pure logic — no DOM,
// no canvas — so node --test can drive it headlessly.
import {
  TILE, COLS, ROWS, PLAYER_RADIUS, PLAYER_SPEED, SNEAK_SPEED, GUARD_CATCH_RADIUS,
  NIGHT_SECONDS, ALARM_MAX, ALARM_GUARD_RATE, ALARM_CAMERA_RATE, ALARM_DECAY_RATE,
  SMOKE_CHARGES, SMOKE_RADIUS, SMOKE_SECONDS, JAMMER_CHARGES, JAMMER_SECONDS,
  LOCKPICK_SECONDS, GHOST_BONUS, TIME_BONUS_PER_SECOND,
} from './config.js';
import { buildLevel, tileAt } from './level.js';
import { createGuard, guardStep } from './guard.js';
import { createCamera, cameraStep, cameraSees } from './camera.js';

export function createWorld(seed = 1) {
  const base = buildLevel();
  // The runtime level owns its own solid grid: unlocking the vault door
  // clears one tile without touching the template.
  const level = { ...base, solid: base.solid.slice() };
  level.roomAt = (x, y) => base.roomAt(x, y);
  const world = {
    seed,
    level,
    time: 0,
    timeLeft: NIGHT_SECONDS,
    player: {
      x: level.playerStart.x,
      y: level.playerStart.y,
      r: PLAYER_RADIUS,
      sneaking: false,
      facing: 0,
    },
    guards: level.guards.map((def) => createGuard(def)),
    cameras: level.cameras.map((def) => createCamera(def)),
    loot: level.loot.map((item) => ({ ...item })),
    smoke: [],
    jammerTtl: 0,
    alarm: 0,
    score: 0,
    lootValue: 0,
    hasJewel: false,
    status: 'play', // play | won | caught | dawn
    spotted: false,
    vaultDoor: { ...level.vaultDoor },
    tools: { smoke: SMOKE_CHARGES, jammer: JAMMER_CHARGES },
    exit: { ...level.exit },
    message: '',
    messageTtl: 0,
    _smokeHeld: false,
    _jammerHeld: false,
  };
  return world;
}

/** Circle-vs-solid-tiles collision, axis separated so the player slides along walls. */
function movePlayer(world, dx, dy) {
  const p = world.player;
  const level = world.level;
  const tryMove = (nx, ny) => {
    const minTx = Math.floor((nx - p.r) / TILE);
    const maxTx = Math.floor((nx + p.r) / TILE);
    const minTy = Math.floor((ny - p.r) / TILE);
    const maxTy = Math.floor((ny + p.r) / TILE);
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        if (tileAt(level, tx, ty) === 1) return false;
      }
    }
    p.x = nx;
    p.y = ny;
    return true;
  };
  if (dx !== 0) tryMove(p.x + dx, p.y);
  if (dy !== 0) tryMove(p.x, p.y + dy);
}

function setMessage(world, text, seconds = 3) {
  world.message = text;
  world.messageTtl = seconds;
}

/**
 * Advance the world one tick. `input` = { mx, my, sneak, interact, smoke, jammer }.
 * Returns the events that fired this tick (loot, chase, caught, win, dawn, ...).
 */
export function stepWorld(world, input, dt) {
  const events = [];
  if (world.status !== 'play') return events;
  world.time += dt;
  world.timeLeft -= dt;
  if (world.timeLeft <= 0) {
    world.timeLeft = 0;
    world.status = 'dawn';
    events.push('dawn');
    return events;
  }
  if (world.messageTtl > 0) world.messageTtl -= dt;
  if (world.jammerTtl > 0) world.jammerTtl -= dt;
  for (const cloud of world.smoke) cloud.ttl -= dt;
  world.smoke = world.smoke.filter((c) => c.ttl > 0);

  // Tools fire on the rising edge only (a held key is one throw).
  if (input.smoke && !world._smokeHeld && world.tools.smoke > 0) {
    world.tools.smoke -= 1;
    world.smoke.push({ x: world.player.x, y: world.player.y, r: SMOKE_RADIUS, ttl: SMOKE_SECONDS });
    events.push('smoke');
  }
  world._smokeHeld = !!input.smoke;
  if (input.jammer && !world._jammerHeld && world.tools.jammer > 0) {
    world.tools.jammer -= 1;
    world.jammerTtl = JAMMER_SECONDS;
    events.push('jammer');
  }
  world._jammerHeld = !!input.jammer;

  // Movement.
  const p = world.player;
  p.sneaking = !!input.sneak;
  let mx = input.mx || 0;
  let my = input.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const speed = p.sneaking ? SNEAK_SPEED : PLAYER_SPEED;
  if (mx !== 0 || my !== 0) p.facing = Math.atan2(my, mx);
  movePlayer(world, mx * speed * dt, my * speed * dt);

  // Vault door: hold E beside it to pick the lock.
  const door = world.vaultDoor;
  if (door.locked) {
    const near = Math.hypot(p.x - door.x, p.y - door.y) < 55;
    if (near && input.interact) {
      door.progress += dt;
      if (door.progress >= LOCKPICK_SECONDS) {
        door.locked = false;
        world.level.solid[door.ty * COLS + door.tx] = 0;
        events.push('door');
        setMessage(world, 'Vault door picked — the Crown Jewel is inside!', 4);
      }
    } else {
      door.progress = Math.max(0, door.progress - dt);
    }
  }

  // Loot: touch to pocket it.
  for (const item of world.loot) {
    if (item.taken) continue;
    if (Math.hypot(p.x - item.x, p.y - item.y) < 26) {
      item.taken = true;
      world.lootValue += item.value;
      world.score += item.value;
      events.push('loot');
      if (item.kind === 'jewel') {
        world.hasJewel = true;
        setMessage(world, 'Crown Jewel secured — get to the getaway van!', 4);
      }
    }
  }

  // Win: the jewel plus the exit.
  if (world.hasJewel && Math.hypot(p.x - world.exit.x, p.y - world.exit.y) < 34) {
    world.status = 'won';
    world.score += Math.round(world.timeLeft) * TIME_BONUS_PER_SECOND;
    if (!world.spotted) world.score += GHOST_BONUS;
    events.push('win');
    return events;
  }

  // Guards and cameras.
  const ctx = { level: world.level, player: p, smoke: world.smoke, jammerTtl: world.jammerTtl };
  let chased = false;
  for (const guard of world.guards) {
    const wasChase = guard.state === 'chase';
    guardStep(guard, ctx, dt);
    if (guard.state === 'chase') {
      chased = true;
      if (!wasChase && !world.spotted) {
        world.spotted = true;
        events.push('spotted');
        setMessage(world, 'SPOTTED! Break line of sight!', 2.5);
      }
      if (Math.hypot(guard.x - p.x, guard.y - p.y) < GUARD_CATCH_RADIUS) {
        world.status = 'caught';
        events.push('caught');
        return events;
      }
    }
  }
  let onCamera = false;
  for (const cam of world.cameras) {
    cameraStep(cam, dt);
    cam.alert = cameraSees(cam, ctx);
    cam.off = world.jammerTtl > 0;
    if (cam.alert) onCamera = true;
  }
  if (chased) {
    world.alarm = Math.min(ALARM_MAX, world.alarm + ALARM_GUARD_RATE * dt);
    events.push('chase');
  } else if (onCamera) {
    world.alarm = Math.min(ALARM_MAX, world.alarm + ALARM_CAMERA_RATE * dt);
    events.push('camera');
  } else {
    world.alarm = Math.max(0, world.alarm - ALARM_DECAY_RATE * dt);
  }
  if (world.alarm >= ALARM_MAX) {
    world.status = 'caught';
    events.push('alarm');
    return events;
  }
  return events;
}

export { ROWS };
