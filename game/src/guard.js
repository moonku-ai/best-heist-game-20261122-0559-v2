// Guard AI: a small FSM (patrol / suspicious / chase / search / return) layered
// over one perception step, exactly as the game-ai skill prescribes:
// perceive once -> decide -> path on the tile grid -> steer along it.
// Guards chase the last known position, never the live player, once sight breaks.
import { TILE, GUARD_PATROL_SPEED, GUARD_CHASE_SPEED } from './config.js';
import { findPath, losClear, smokeBlocks } from './level.js';

const HALF_CONE = (120 * Math.PI) / 360; // 60 degrees each side
const AWARE_SUSPICIOUS = 0.55;
const AWARE_CHASE = 1;
const LOSE_SIGHT_SECONDS = 4;
const SEARCH_SECONDS = 3;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

export function createGuard(def) {
  const first = def.waypoints[0];
  const second = def.waypoints[1] ?? first;
  return {
    name: def.name,
    x: def.x,
    y: def.y,
    dir: Math.atan2(second.y - first.y, second.x - first.x),
    speed: def.speed ?? GUARD_PATROL_SPEED,
    range: def.range ?? 260,
    waypoints: def.waypoints,
    wp: def.waypoints.length > 1 ? 1 : 0,
    state: 'patrol',
    awareness: 0,
    lastSeen: null,
    loseT: 0,
    scanT: 0,
    stateT: 0,
    path: [],
    repathT: 0,
    alerted: false,
  };
}

/** Can this guard see the player right now? Cheap checks first, raycast last. */
export function guardSees(guard, ctx) {
  const dx = ctx.player.x - guard.x;
  const dy = ctx.player.y - guard.y;
  const dist = Math.hypot(dx, dy);
  const range = ctx.player.sneaking ? guard.range / 2 : guard.range;
  if (dist > range) return false;
  if (angleDiff(Math.atan2(dy, dx), guard.dir) > HALF_CONE) return false;
  if (!losClear(ctx.level, guard.x, guard.y, ctx.player.x, ctx.player.y)) return false;
  if (smokeBlocks(guard.x, guard.y, ctx.player.x, ctx.player.y, ctx.smoke)) return false;
  return true;
}

function moveToward(guard, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return true;
  const step = Math.min(dist, speed * dt);
  guard.x += (dx / dist) * step;
  guard.y += (dy / dist) * step;
  guard.dir = Math.atan2(dy, dx);
  return dist <= Math.max(8, speed * dt);
}

/** Follow a BFS tile path; repath when the list runs out. */
function followPath(guard, ctx, speed, dt) {
  if (guard.path.length === 0) return true;
  const next = guard.path[0];
  const px = (next.tx + 0.5) * TILE;
  const py = (next.ty + 0.5) * TILE;
  if (moveToward(guard, px, py, speed, dt)) guard.path.shift();
  return guard.path.length === 0;
}

function pathTo(guard, ctx, tx, ty) {
  const sx = Math.floor(guard.x / TILE);
  const sy = Math.floor(guard.y / TILE);
  guard.path = findPath(ctx.level, sx, sy, tx, ty);
  guard.repathT = 0;
}

function changeState(guard, next) {
  guard.state = next;
  guard.stateT = 0;
  guard.loseT = 0;
  guard.scanT = 0;
}

/**
 * One guard tick. `ctx` = { level, player: {x, y, sneaking}, smoke, jammerTtl }.
 * Returns nothing; the world reads guard.state / guard.awareness.
 */
export function guardStep(guard, ctx, dt) {
  guard.stateT += dt;
  const seen = guardSees(guard, ctx);
  if (seen) {
    const dist = Math.hypot(ctx.player.x - guard.x, ctx.player.y - guard.y);
    const rate = (0.7 + 0.9 * (1 - dist / guard.range)) * (ctx.player.sneaking ? 0.5 : 1);
    guard.awareness = Math.min(1, guard.awareness + rate * dt);
    guard.lastSeen = { x: ctx.player.x, y: ctx.player.y };
    guard.loseT = 0;
  } else {
    guard.awareness = Math.max(0, guard.awareness - 0.5 * dt);
    if (guard.state === 'chase') guard.loseT += dt;
  }

  switch (guard.state) {
    case 'patrol': {
      if (guard.awareness >= AWARE_CHASE) { changeState(guard, 'chase'); break; }
      if (guard.awareness >= AWARE_SUSPICIOUS && guard.lastSeen) { changeState(guard, 'suspicious'); break; }
      const target = guard.waypoints[guard.wp];
      if (moveToward(guard, target.x, target.y, guard.speed, dt)) {
        guard.wp = (guard.wp + 1) % guard.waypoints.length;
      }
      break;
    }
    case 'suspicious': {
      if (guard.awareness >= AWARE_CHASE) { changeState(guard, 'chase'); break; }
      if (guard.stateT > 2.5) { changeState(guard, 'return'); pathTo(guard, ctx, Math.floor(guard.waypoints[guard.wp].x / TILE), Math.floor(guard.waypoints[guard.wp].y / TILE)); break; }
      if (guard.lastSeen) {
        if (guard.path.length === 0 && guard.stateT < 0.1) {
          pathTo(guard, ctx, Math.floor(guard.lastSeen.x / TILE), Math.floor(guard.lastSeen.y / TILE));
        }
        const arrived = followPath(guard, ctx, guard.speed * 1.3, dt);
        if (arrived) guard.dir += dt * 1.5; // look around once arrived
      }
      break;
    }
    case 'chase': {
      if (guard.loseT > LOSE_SIGHT_SECONDS) { changeState(guard, 'search'); break; }
      // Chase the last known position, never the live player: breaking line
      // of sight is how the thief escapes.
      guard.repathT += dt;
      const seen = guard.lastSeen ?? { x: ctx.player.x, y: ctx.player.y };
      const ptx = Math.floor(seen.x / TILE);
      const pty = Math.floor(seen.y / TILE);
      if (guard.repathT > 0.5 || guard.path.length === 0) pathTo(guard, ctx, ptx, pty);
      followPath(guard, ctx, GUARD_CHASE_SPEED, dt);
      break;
    }
    case 'search': {
      guard.scanT += dt;
      guard.dir += dt * 2.2;
      if (guard.awareness >= AWARE_CHASE) { changeState(guard, 'chase'); break; }
      if (guard.scanT > SEARCH_SECONDS) { changeState(guard, 'return'); pathTo(guard, ctx, Math.floor(guard.waypoints[guard.wp].x / TILE), Math.floor(guard.waypoints[guard.wp].y / TILE)); }
      break;
    }
    case 'return': {
      if (guard.awareness >= AWARE_CHASE) { changeState(guard, 'chase'); break; }
      if (followPath(guard, ctx, guard.speed, dt)) changeState(guard, 'patrol');
      break;
    }
    default:
      break;
  }
  guard.alerted = guard.state === 'chase' || guard.state === 'suspicious';
}
