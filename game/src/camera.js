// Wall cameras: they sweep a fixed arc, and raise the alarm while the thief
// stands in their cone with a clear line of sight. A jammer silences them.
import { losClear, smokeBlocks } from './level.js';

const HALF_CONE = (35 * Math.PI) / 180;
const RANGE = 220;

export function createCamera(def) {
  return {
    x: def.x,
    y: def.y,
    baseAngle: def.baseAngle,
    sweep: def.sweep,
    speed: def.speed,
    phase: 0,
    angle: def.baseAngle,
    range: RANGE,
    alert: false,
    off: false,
  };
}

export function cameraStep(cam, dt) {
  cam.phase += dt * cam.speed;
  cam.angle = cam.baseAngle + Math.sin(cam.phase) * cam.sweep;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** Is the player in this camera's cone right now? */
export function cameraSees(cam, ctx) {
  if (ctx.jammerTtl > 0) return false;
  const dx = ctx.player.x - cam.x;
  const dy = ctx.player.y - cam.y;
  const dist = Math.hypot(dx, dy);
  if (dist > cam.range) return false;
  if (angleDiff(Math.atan2(dy, dx), cam.angle) > HALF_CONE) return false;
  if (!losClear(ctx.level, cam.x, cam.y, ctx.player.x, ctx.player.y)) return false;
  if (smokeBlocks(cam.x, cam.y, ctx.player.x, ctx.player.y, ctx.smoke)) return false;
  return true;
}
