// Rendering: draws the museum, the cones, the thief, the HUD, the minimap
// and the end screens on one canvas. Colours come from config's PALETTE so
// safe cover, danger and loot read at a glance.
import { TILE, COLS, ROWS, WIDTH, HEIGHT, PALETTE } from './config.js';
import { tileAt } from './level.js';

const TAU = Math.PI * 2;

function conePath(ctx, x, y, dir, halfAngle, range) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, range, dir - halfAngle, dir + halfAngle);
  ctx.closePath();
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtMoney(n) {
  return `$${n.toLocaleString('en-US')}`;
}

export function drawFloor(ctx, world) {
  const level = world.level;
  for (const room of level.rooms) {
    ctx.fillStyle = PALETTE[room.floor];
    ctx.fillRect(room.x0 * TILE, room.y0 * TILE, (room.x1 - room.x0 + 1) * TILE, (room.y1 - room.y0 + 1) * TILE);
  }
  // Subtle checker so rooms read as floor, not flat colour.
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let ty = 1; ty < ROWS - 1; ty += 1) {
    for (let tx = 1; tx < COLS - 1; tx += 1) {
      if ((tx + ty) % 2 === 0 && tileAt(level, tx, ty) === 0) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  // Room names on the floor.
  ctx.textAlign = 'center';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(232,236,244,0.30)';
  for (const room of level.rooms) {
    ctx.fillText(room.name.toUpperCase(), ((room.x0 + room.x1 + 1) / 2) * TILE, ((room.y0 + room.y1 + 1) / 2) * TILE);
  }
}

export function drawWalls(ctx, world) {
  const level = world.level;
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      if (tileAt(level, tx, ty) !== 1) continue;
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      ctx.fillStyle = PALETTE.wallTop;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, 4);
    }
  }
  for (const f of level.furniture) {
    ctx.fillStyle = PALETTE.furniture;
    ctx.fillRect(f.tx * TILE + 3, f.ty * TILE + 3, f.w * TILE - 6, f.h * TILE - 6);
    ctx.fillStyle = PALETTE.furnitureTop;
    ctx.fillRect(f.tx * TILE + 3, f.ty * TILE + 3, f.w * TILE - 6, 5);
  }
  // The vault door: gold bars while locked, an open gap once picked.
  const door = world.vaultDoor;
  ctx.fillStyle = door.locked ? '#8a6d1f' : '#20242e';
  ctx.fillRect(door.x - 20, door.y - 20, 40, 40);
  if (door.locked) {
    ctx.fillStyle = '#ffd166';
    for (let i = -1; i <= 1; i += 1) ctx.fillRect(door.x + i * 12 - 2, door.y - 20, 4, 40);
    if (door.progress > 0) {
      ctx.fillStyle = '#2fd47a';
      ctx.fillRect(door.x - 20, door.y - 28, 40 * (door.progress / 2), 5);
    }
  }
  // The service vent: a grate in the wall.
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(16 * TILE + 4, 16 * TILE + 4, TILE - 8, TILE - 8);
  ctx.fillStyle = '#1a202c';
  for (let i = 0; i < 3; i += 1) ctx.fillRect(16 * TILE + 8, 16 * TILE + 10 + i * 10, TILE - 16, 3);
  // Exit: the getaway van zone in the Lobby's south wall.
  ctx.fillStyle = PALETTE.exit;
  ctx.fillRect(world.exit.x - 26, world.exit.y - 10, 52, 20);
  ctx.fillStyle = '#0b3d20';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GETAWAY', world.exit.x, world.exit.y + 4);
}

export function drawLoot(ctx, world) {
  for (const item of world.loot) {
    if (item.taken) continue;
    const { x, y } = item;
    if (item.kind === 'painting') {
      ctx.fillStyle = '#d9b36c';
      ctx.fillRect(x - 14, y - 18, 28, 36);
      ctx.fillStyle = PALETTE.lootPainting;
      ctx.fillRect(x - 11, y - 15, 22, 30);
      ctx.fillStyle = '#0d1020';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$100', x, y + 30);
    } else if (item.kind === 'gold') {
      ctx.fillStyle = '#8a6d1f';
      ctx.fillRect(x - 13, y - 6, 26, 12);
      ctx.fillStyle = PALETTE.lootGold;
      ctx.fillRect(x - 11, y - 9, 22, 9);
      ctx.fillStyle = '#0d1020';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$250', x, y + 22);
    } else if (item.kind === 'gem') {
      ctx.fillStyle = PALETTE.lootGem;
      ctx.beginPath();
      ctx.moveTo(x, y - 12); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 10, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 3, y - 4, 2.5, 0, TAU); ctx.fill();
    } else {
      // The Crown Jewel: big, glowing, unmissable.
      const pulse = 0.5 + 0.5 * Math.sin(world.time * 3);
      ctx.fillStyle = `rgba(255, 223, 107, ${0.25 + 0.3 * pulse})`;
      ctx.beginPath(); ctx.arc(x, y, 34 + 6 * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = PALETTE.lootJewel;
      ctx.beginPath();
      ctx.moveTo(x, y - 18); ctx.lineTo(x + 15, y - 4); ctx.lineTo(x + 11, y + 12);
      ctx.lineTo(x, y + 18); ctx.lineTo(x - 11, y + 12); ctx.lineTo(x - 15, y - 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a5b00';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CROWN JEWEL', x, y - 30);
    }
  }
}

export function drawCones(ctx, world) {
  for (const cam of world.cameras) {
    if (cam.off) continue;
    ctx.fillStyle = cam.alert ? 'rgba(255, 60, 60, 0.30)' : PALETTE.cameraCone;
    conePath(ctx, cam.x, cam.y, cam.angle, (35 * Math.PI) / 180, cam.range);
    ctx.fill();
  }
  for (const guard of world.guards) {
    ctx.fillStyle = guard.state === 'chase' ? PALETTE.guardConeAlert : PALETTE.guardCone;
    conePath(ctx, guard.x, guard.y, guard.dir, (60 * Math.PI) / 180, guard.range);
    ctx.fill();
  }
}

export function drawSmoke(ctx, world) {
  for (const cloud of world.smoke) {
    ctx.fillStyle = PALETTE.smoke;
    ctx.beginPath(); ctx.arc(cloud.x, cloud.y, cloud.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(cloud.x - 20, cloud.y - 10, cloud.r * 0.5, 0, TAU); ctx.fill();
  }
}

export function drawActors(ctx, world) {
  for (const cam of world.cameras) {
    ctx.fillStyle = cam.off ? '#556' : PALETTE.camera;
    ctx.beginPath(); ctx.arc(cam.x, cam.y, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0d1020';
    ctx.beginPath(); ctx.arc(cam.x, cam.y, 4, 0, TAU); ctx.fill();
    if (cam.off) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OFF', cam.x, cam.y - 14);
    } else if (cam.alert) {
      ctx.fillStyle = '#ff3b30';
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ON CAMERA!', cam.x, cam.y - 14);
    }
  }
  for (const guard of world.guards) {
    ctx.fillStyle = PALETTE.guard;
    ctx.beginPath(); ctx.arc(guard.x, guard.y, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a1010';
    ctx.beginPath(); ctx.arc(guard.x, guard.y, 6, 0, TAU); ctx.fill();
    // Facing tick.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(guard.x, guard.y);
    ctx.lineTo(guard.x + Math.cos(guard.dir) * 18, guard.y + Math.sin(guard.dir) * 18);
    ctx.stroke();
    // Awareness arc above the guard.
    if (guard.awareness > 0.05) {
      ctx.strokeStyle = guard.awareness >= 1 ? '#ff3b30' : '#ffb020';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 19, -Math.PI / 2, -Math.PI / 2 + TAU * guard.awareness);
      ctx.stroke();
    }
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    if (guard.state === 'chase') {
      ctx.fillStyle = '#ff3b30';
      ctx.fillText('!', guard.x, guard.y - 24);
    } else if (guard.state === 'suspicious' || guard.state === 'search') {
      ctx.fillStyle = '#ffb020';
      ctx.fillText('?', guard.x, guard.y - 24);
    }
  }
  // The thief.
  const p = world.player;
  ctx.fillStyle = p.sneaking ? PALETTE.playerSneak : PALETTE.player;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a2a00';
  ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x + Math.cos(p.facing) * 16, p.y + Math.sin(p.facing) * 16);
  ctx.stroke();
  if (p.sneaking) {
    ctx.fillStyle = '#e8ecf4';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SNEAK', p.x, p.y - 18);
  }
}

export function drawHud(ctx, world) {
  ctx.fillStyle = PALETTE.hudBg;
  ctx.fillRect(0, 0, WIDTH, 46);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '700 15px system-ui, sans-serif';
  const objective = world.hasJewel ? 'ESCAPE! Reach the getaway van' : 'STEAL the Crown Jewel in The Vault';
  ctx.fillText(objective, 12, 20);
  ctx.fillStyle = PALETTE.hudMuted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`Loot ${fmtMoney(world.lootValue)}  ·  Score ${world.score}`, 12, 37);

  // Alarm meter, centre.
  const ax = WIDTH / 2 - 130;
  ctx.fillStyle = PALETTE.hudMuted;
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ALARM', ax, 20);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(ax + 58, 10, 200, 14);
  const alarmColor = world.alarm < 40 ? PALETTE.alarmLow : world.alarm < 75 ? PALETTE.alarmMid : PALETTE.alarmHigh;
  ctx.fillStyle = alarmColor;
  ctx.fillRect(ax + 58, 10, 200 * (world.alarm / 100), 14);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`${Math.round(world.alarm)}%`, ax + 264, 21);

  // Timer + tools, right.
  ctx.textAlign = 'right';
  ctx.fillStyle = world.timeLeft < 60 ? PALETTE.alarmHigh : PALETTE.hudText;
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillText(fmtTime(world.timeLeft), WIDTH - 12, 20);
  ctx.fillStyle = PALETTE.hudMuted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`SMOKE ×${world.tools.smoke} [Q]   JAMMER ×${world.tools.jammer} [F]   SNEAK [Shift]   PICK [E]`, WIDTH - 12, 37);

  drawMinimap(ctx, world);
  drawLegend(ctx);
  if (world.message && world.messageTtl > 0) {
    ctx.textAlign = 'center';
    ctx.font = '700 17px system-ui, sans-serif';
    const w = ctx.measureText(world.message).width + 28;
    ctx.fillStyle = 'rgba(8,10,20,0.85)';
    ctx.fillRect(WIDTH / 2 - w / 2, 56, w, 30);
    ctx.fillStyle = world.message.includes('SPOTTED') ? '#ff5a5a' : '#ffd166';
    ctx.fillText(world.message, WIDTH / 2, 77);
  }
}

function drawMinimap(ctx, world) {
  const mw = 208;
  const mh = 117;
  const mx = WIDTH - mw - 10;
  const my = HEIGHT - mh - 10;
  const sx = mw / WIDTH;
  const sy = mh / HEIGHT;
  ctx.fillStyle = 'rgba(8,10,20,0.85)';
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(mx, my, mw, mh);
  for (const room of world.level.rooms) {
    ctx.fillStyle = PALETTE[room.floor];
    ctx.fillRect(mx + room.x0 * TILE * sx, my + room.y0 * TILE * sy, (room.x1 - room.x0 + 1) * TILE * sx, (room.y1 - room.y0 + 1) * TILE * sy);
  }
  ctx.fillStyle = PALETTE.exit;
  ctx.fillRect(mx + world.exit.x * sx - 3, my + world.exit.y * sy - 3, 6, 6);
  for (const item of world.loot) {
    if (item.taken) continue;
    ctx.fillStyle = item.kind === 'jewel' ? '#fff' : PALETTE.lootGold;
    ctx.beginPath(); ctx.arc(mx + item.x * sx, my + item.y * sy, item.kind === 'jewel' ? 4 : 2.5, 0, TAU); ctx.fill();
  }
  for (const cam of world.cameras) {
    ctx.fillStyle = cam.off ? '#556' : PALETTE.camera;
    ctx.beginPath(); ctx.arc(mx + cam.x * sx, my + cam.y * sy, 3, 0, TAU); ctx.fill();
  }
  for (const guard of world.guards) {
    ctx.fillStyle = guard.state === 'chase' ? '#ff0000' : PALETTE.guard;
    ctx.beginPath(); ctx.arc(mx + guard.x * sx, my + guard.y * sy, 3.5, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(mx + world.player.x * sx, my + world.player.y * sy, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = PALETTE.hudMuted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MAP', mx, my - 6);
}

function drawLegend(ctx) {
  const items = [
    ['#ffd166', 'LOOT'],
    ['#ff5a5a', 'GUARD'],
    ['#ff9f43', 'CAMERA'],
    ['#2fd47a', 'EXIT'],
  ];
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  let x = 12;
  const y = HEIGHT - 14;
  for (const [color, label] of items) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 9, 10, 10);
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.fillText(label, x + 14, y);
    x += 14 + ctx.measureText(label).width + 18;
  }
}

export function drawEndScreen(ctx, world, paused) {
  if (world.status === 'play' && !paused) return;
  ctx.fillStyle = 'rgba(5, 7, 14, 0.72)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = 'center';
  if (paused) {
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText('PAUSED', WIDTH / 2, HEIGHT / 2 - 10);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.fillText('P / Esc to resume · R to restart', WIDTH / 2, HEIGHT / 2 + 24);
    return;
  }
  if (world.status === 'won') {
    ctx.fillStyle = '#ffd166';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText('CLEAN GETAWAY!', WIDTH / 2, HEIGHT / 2 - 40);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`Loot ${fmtMoney(world.lootValue)}  ·  Score ${world.score}${world.spotted ? '' : '  ·  GHOST — never spotted!'}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Press R to run it again', WIDTH / 2, HEIGHT / 2 + 34);
  } else if (world.status === 'caught') {
    ctx.fillStyle = '#ff3b30';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(world.alarm >= 100 ? 'LOCKDOWN — BUSTED!' : 'BUSTED!', WIDTH / 2, HEIGHT / 2 - 40);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`The museum keeps its jewels. Loot kept: ${fmtMoney(world.lootValue)}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Press R to try again', WIDTH / 2, HEIGHT / 2 + 34);
  } else if (world.status === 'dawn') {
    ctx.fillStyle = '#ffb020';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText('DAWN — TOO SLOW!', WIDTH / 2, HEIGHT / 2 - 40);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(`The museum opens at sunrise. Loot kept: ${fmtMoney(world.lootValue)}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = PALETTE.hudMuted;
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Press R to try again', WIDTH / 2, HEIGHT / 2 + 34);
  }
}

export function drawWorld(ctx, world, paused = false) {
  drawFloor(ctx, world);
  drawLoot(ctx, world);
  drawCones(ctx, world);
  drawSmoke(ctx, world);
  drawWalls(ctx, world);
  drawActors(ctx, world);
  drawHud(ctx, world);
  drawEndScreen(ctx, world, paused);
}
