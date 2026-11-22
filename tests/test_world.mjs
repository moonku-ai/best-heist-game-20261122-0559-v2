// Unit tests for The Velvet Vault (best-heist-game v2). Pure logic only — no DOM.
// Run: node --test tests/test_world.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, COLS, ROWS, WIDTH, HEIGHT, NIGHT_SECONDS } from '../game/src/config.js';
import { mulberry32 } from '../game/src/random.js';
import { buildLevel, losClear, findPath, tileAt } from '../game/src/level.js';
import { createGuard, guardStep } from '../game/src/guard.js';
import { createCamera, cameraStep, cameraSees } from '../game/src/camera.js';
import { createWorld, stepWorld } from '../game/src/world.js';

const STEP = 1 / 60;
function runSteps(world, input, seconds) {
  const events = [];
  for (let t = 0; t < seconds; t += STEP) events.push(...stepWorld(world, input, STEP));
  return events;
}
const idle = { mx: 0, my: 0, sneak: false, interact: false, smoke: false, jammer: false };

// --- config / rng ---
test('config: field is 1280x720 on a 32x18 tile grid', () => {
  assert.equal(COLS * TILE, WIDTH);
  assert.equal(ROWS * TILE, HEIGHT);
  assert.equal(NIGHT_SECONDS, 300);
});
test('random: mulberry32 is deterministic per seed and varies', () => {
  const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8);
  assert.equal(a(), b());
  assert.notEqual(a(), c());
});

// --- level ---
test('level: border is solid, rooms are open, doors connect the four rooms', () => {
  const level = buildLevel();
  assert.equal(level.rooms.length, 4);
  assert.deepEqual(level.rooms.map((r) => r.name), ['Gallery', 'Vault Hall', 'Lobby', 'The Vault']);
  for (let x = 0; x < COLS; x += 1) {
    assert.equal(tileAt(level, x, 0), 1);
    assert.equal(tileAt(level, x, ROWS - 1), 1);
  }
  // Every room can reach every other room (doors open).
  for (const a of level.rooms) for (const b of level.rooms) {
    if (a === b) continue;
    const path = findPath(level, a.cx, a.cy, b.cx, b.cy);
    assert.ok(path.length > 0, `${a.name} -> ${b.name} must be reachable`);
  }
});
test('level: nine loot pieces in tiers (3 paintings, 3 gold, 2 gems, 1 jewel)', () => {
  const level = buildLevel();
  const byKind = {};
  for (const item of level.loot) byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  assert.deepEqual(byKind, { painting: 3, gold: 3, gem: 2, jewel: 1 });
  const jewel = level.loot.find((i) => i.kind === 'jewel');
  assert.equal(jewel.value, 1000);
  assert.equal(level.loot.reduce((s, i) => s + i.value, 0), 3 * 100 + 3 * 250 + 2 * 400 + 1000);
});
test('level: player starts in the Lobby, exit is in the Lobby', () => {
  const level = buildLevel();
  assert.equal(level.roomAt(level.playerStart.x, level.playerStart.y), 'Lobby');
  assert.equal(level.roomAt(level.exit.x, level.exit.y), 'Lobby');
});
test('level: line of sight is blocked by a wall and clear across an open room', () => {
  const level = buildLevel();
  // Across the Gallery (open floor) sight is clear.
  assert.equal(losClear(level, 2.5 * TILE, 2.5 * TILE, 7.5 * TILE, 2.5 * TILE), true);
  // Through the solid wall between Gallery and Vault Hall (row y=2 has no door) sight is blocked.
  assert.equal(losClear(level, 5 * TILE, 2 * TILE, 27 * TILE, 2 * TILE), false);
});
test('level: pathfinding avoids solid tiles and fails for a solid target', () => {
  const level = buildLevel();
  const path = findPath(level, 3, 13, 27, 13);
  assert.ok(path.length > 4);
  for (const p of path) assert.equal(tileAt(level, p.tx, p.ty), 0);
  assert.equal(findPath(level, 3, 13, 0, 0).length, 0);
});

// --- guard perception + FSM ---
test('guard: does not see the player behind a wall', () => {
  const level = buildLevel();
  const guard = createGuard({ x: 5 * TILE, y: 2 * TILE, dir: 0, waypoints: [{ x: 5 * TILE, y: 2 * TILE }] });
  const world = { level, player: { x: 27 * TILE, y: 2 * TILE, sneaking: false }, smoke: [], jammerTtl: 0 };
  guardStep(guard, world, 1);
  assert.equal(guard.awareness, 0);
  assert.equal(guard.state, 'patrol');
});
test('guard: awareness rises when the player stands in its cone, then it chases', () => {
  const level = buildLevel();
  const guard = createGuard({ x: 5 * TILE, y: 4 * TILE, dir: 0, waypoints: [{ x: 5 * TILE, y: 4 * TILE }] });
  const world = { level, player: { x: 8 * TILE, y: 4 * TILE, sneaking: false }, smoke: [], jammerTtl: 0 };
  guardStep(guard, world, 0.5);
  assert.ok(guard.awareness > 0, 'awareness must rise in-cone');
  guardStep(guard, world, 2);
  assert.equal(guard.state, 'chase');
});
test('guard: sneaking halves the detection range', () => {
  const level = buildLevel();
  const far = createGuard({ x: 5 * TILE, y: 4 * TILE, dir: 0, waypoints: [{ x: 5 * TILE, y: 4 * TILE }] });
  const world = { level, player: { x: 9 * TILE, y: 4 * TILE, sneaking: true }, smoke: [], jammerTtl: 0 };
  guardStep(far, world, 1);
  assert.equal(far.awareness, 0, 'sneaking player at 4 tiles must stay unseen');
});
test('guard: smoke blocks sight', () => {
  const level = buildLevel();
  const guard = createGuard({ x: 5 * TILE, y: 4 * TILE, dir: 0, waypoints: [{ x: 5 * TILE, y: 4 * TILE }] });
  const world = {
    level,
    player: { x: 8 * TILE, y: 4 * TILE, sneaking: false },
    smoke: [{ x: 6.5 * TILE, y: 4 * TILE, r: 90, ttl: 4 }],
    jammerTtl: 0,
  };
  guardStep(guard, world, 1);
  assert.equal(guard.awareness, 0);
});

// --- cameras ---
test('camera: sweeps and spots the player in its cone', () => {
  const level = buildLevel();
  const cam = createCamera({ x: 3 * TILE, y: 2 * TILE, baseAngle: 0, sweep: 0.6, speed: 0.5 });
  const world = { level, player: { x: 6 * TILE, y: 2 * TILE, sneaking: false }, smoke: [], jammerTtl: 0 };
  let saw = false;
  for (let t = 0; t < 8; t += STEP) { cameraStep(cam, STEP); if (cameraSees(cam, world)) saw = true; }
  assert.equal(saw, true, 'sweeping camera must spot the player at some point');
});
test('camera: jammer disables detection', () => {
  const level = buildLevel();
  const cam = createCamera({ x: 3 * TILE, y: 2 * TILE, baseAngle: 0, sweep: 0, speed: 0 });
  const world = { level, player: { x: 6 * TILE, y: 2 * TILE, sneaking: false }, smoke: [], jammerTtl: 5 };
  cameraStep(cam, STEP);
  assert.equal(cameraSees(cam, world), false);
});

// --- world: movement, loot, vault door, win/lose, tools, alarm ---
test('world: player cannot walk through walls', () => {
  const world = createWorld(1);
  const before = { ...world.player };
  runSteps(world, { ...idle, mx: -1 }, 2);
  assert.ok(world.player.x >= TILE + 11, 'wall must stop the player at the border');
  assert.ok(world.player.x < before.x, 'player moved left until the wall');
});
test('world: touching loot collects it and raises the score', () => {
  const world = createWorld(1);
  world.guards = []; world.cameras = [];
  const painting = world.loot.find((i) => i.kind === 'painting');
  world.player.x = painting.x; world.player.y = painting.y;
  const events = runSteps(world, idle, 0.2);
  assert.ok(events.includes('loot'));
  assert.equal(painting.taken, true);
  assert.equal(world.score, 100);
});
test('world: the vault door blocks entry until lockpicked with E', () => {
  const world = createWorld(1);
  world.guards = []; world.cameras = [];
  assert.equal(world.vaultDoor.locked, true);
  // Walk the player against the vault door from the Lobby side.
  world.player.x = world.vaultDoor.x - 60; world.player.y = world.vaultDoor.y;
  runSteps(world, { ...idle, mx: 1 }, 1);
  assert.ok(world.player.x < world.vaultDoor.x - 10, 'locked door must block the player');
  const events = runSteps(world, { ...idle, interact: true }, 2.2);
  assert.equal(world.vaultDoor.locked, false);
  assert.ok(events.includes('door'));
});
test('world: winning needs the jewel plus the exit', () => {
  const world = createWorld(1);
  world.guards = []; world.cameras = [];
  world.player.x = world.exit.x; world.player.y = world.exit.y;
  runSteps(world, idle, 0.2);
  assert.equal(world.status, 'play', 'exit without the jewel is not a win');
  const jewel = world.loot.find((i) => i.kind === 'jewel');
  jewel.taken = true; world.hasJewel = true;
  const events = runSteps(world, idle, 0.2);
  assert.equal(world.status, 'won');
  assert.ok(events.includes('win'));
  assert.ok(world.score >= 1000, 'score must include the jewel');
});
test('world: dawn ends the night', () => {
  const world = createWorld(1);
  world.guards = []; world.cameras = [];
  world.timeLeft = 0.5;
  const events = runSteps(world, idle, 1);
  assert.equal(world.status, 'dawn');
  assert.ok(events.includes('dawn'));
});
test('world: alarm at 100 is a lockdown loss', () => {
  const world = createWorld(1);
  world.alarm = 99;
  // Force a chase so the alarm keeps rising.
  const guard = world.guards[0];
  guard.state = 'chase'; guard.awareness = 1;
  const events = runSteps(world, idle, 1);
  assert.equal(world.status, 'caught');
  assert.ok(events.includes('alarm'));
});
test('world: alarm decays when nothing sees the player', () => {
  const world = createWorld(1);
  world.guards = []; world.cameras = [];
  world.alarm = 50;
  runSteps(world, idle, 2);
  assert.ok(world.alarm < 50);
});
test('world: smoke bomb spends a charge and creates a cloud', () => {
  const world = createWorld(1);
  assert.equal(world.tools.smoke, 2);
  const events = runSteps(world, { ...idle, smoke: true }, 0.1);
  assert.equal(world.tools.smoke, 1);
  assert.equal(world.smoke.length, 1);
  assert.ok(events.includes('smoke'));
});
test('world: jammer spends a charge and silences cameras', () => {
  const world = createWorld(1);
  assert.equal(world.tools.jammer, 2);
  const events = runSteps(world, { ...idle, jammer: true }, 0.1);
  assert.equal(world.tools.jammer, 1);
  assert.ok(world.jammerTtl > 0);
  assert.ok(events.includes('jammer'));
});
test('world: a chasing guard that touches the player catches them', () => {
  const world = createWorld(1);
  const guard = world.guards[0];
  guard.state = 'chase'; guard.awareness = 1;
  guard.x = world.player.x + 10; guard.y = world.player.y;
  const events = runSteps(world, idle, 0.5);
  assert.equal(world.status, 'caught');
  assert.ok(events.includes('caught'));
});
