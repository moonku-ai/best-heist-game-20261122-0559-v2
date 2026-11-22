// The museum floor: four named rooms on a tile grid, with walls, doors,
// furniture cover, loot, guard patrols, cameras and the vault door.
// Everything the AI and the renderer need lives here; nothing here touches the DOM.
import { TILE, COLS, ROWS, LOOT_VALUES } from './config.js';

const SOLID = 1;
const OPEN = 0;

export function tileAt(level, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return SOLID;
  return level.solid[ty * COLS + tx];
}

function setTile(solid, tx, ty, value) {
  if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS) solid[ty * COLS + tx] = value;
}

/** Room name for a pixel position (used by HUD, minimap and tests). */
export function roomAt(level, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  for (const room of level.rooms) {
    if (tx >= room.x0 && tx <= room.x1 && ty >= room.y0 && ty <= room.y1) return room.name;
  }
  return 'Corridor';
}

/**
 * Is the straight segment between two pixel points free of solid tiles?
 * Samples every 8px, so thin walls are never skipped.
 */
export function losClear(level, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (tileAt(level, Math.floor((x0 + dx * t) / TILE), Math.floor((y0 + dy * t) / TILE)) === SOLID) return false;
  }
  return true;
}

/** Does the segment pass through any smoke cloud (which blocks sight)? */
export function smokeBlocks(x0, y0, x1, y1, smoke) {
  for (const cloud of smoke) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((cloud.x - x0) * dx + (cloud.y - y0) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    if (Math.hypot(cx - cloud.x, cy - cloud.y) < cloud.r) return true;
  }
  return false;
}

/**
 * Breadth-first path on the tile grid (4-way, no corner cutting).
 * Returns tile centres as {tx, ty} from the tile after the start to the target,
 * or [] when the target is solid or unreachable.
 */
export function findPath(level, sx, sy, tx, ty) {
  if (tileAt(level, tx, ty) === SOLID) return [];
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const queue = [sy * COLS + sx];
  prev[sy * COLS + sx] = sy * COLS + sx;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    const cx = cur % COLS;
    const cy = Math.floor(cur / COLS);
    if (cx === tx && cy === ty) break;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (tileAt(level, nx, ny) === SOLID) continue;
      const ni = ny * COLS + nx;
      if (prev[ni] !== -1) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  const target = ty * COLS + tx;
  if (prev[target] === -1) return [];
  const path = [];
  let cur = target;
  while (cur !== sy * COLS + sx) {
    path.push({ tx: cur % COLS, ty: Math.floor(cur / COLS) });
    cur = prev[cur];
  }
  path.reverse();
  return path;
}

const centre = (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

export function buildLevel() {
  const solid = new Uint8Array(COLS * ROWS);
  // Border walls.
  for (let x = 0; x < COLS; x += 1) { setTile(solid, x, 0, SOLID); setTile(solid, x, ROWS - 1, SOLID); }
  for (let y = 0; y < ROWS; y += 1) { setTile(solid, 0, y, SOLID); setTile(solid, COLS - 1, y, SOLID); }
  // Vertical divider x=16: Gallery | Vault Hall above, Lobby | Vault below.
  for (let y = 1; y < ROWS - 1; y += 1) setTile(solid, 16, y, SOLID);
  setTile(solid, 16, 4, OPEN); // open door: Gallery <-> Vault Hall
  setTile(solid, 16, 16, OPEN); // service vent: Lobby <-> The Vault (exposed route)
  // Horizontal divider y=9.
  for (let x = 1; x < COLS - 1; x += 1) setTile(solid, x, 9, SOLID);
  setTile(solid, 7, 9, OPEN); // open door: Gallery <-> Lobby
  setTile(solid, 23, 9, OPEN); // open door: Vault Hall <-> Lobby
  // The vault door tile stays solid until lockpicked (world clears it on unlock).
  const vaultDoorTile = { tx: 16, ty: 13 };

  // Furniture: solid cover that blocks movement and sight lines.
  const furniture = [];
  const addFurniture = (tx, ty, w, h, label) => {
    for (let x = tx; x < tx + w; x += 1) for (let y = ty; y < ty + h; y += 1) setTile(solid, x, y, SOLID);
    furniture.push({ tx, ty, w, h, label });
  };
  addFurniture(4, 3, 1, 1, 'pedestal');
  addFurniture(8, 3, 1, 1, 'pedestal');
  addFurniture(4, 6, 1, 1, 'pedestal');
  addFurniture(8, 6, 1, 1, 'pedestal');
  addFurniture(20, 3, 1, 1, 'display case');
  addFurniture(20, 5, 1, 1, 'display case');
  addFurniture(26, 3, 1, 1, 'display case');
  addFurniture(26, 5, 1, 1, 'display case');
  addFurniture(5, 14, 1, 1, 'bench');
  addFurniture(9, 14, 1, 1, 'bench');
  addFurniture(11, 15, 2, 1, 'reception desk');
  addFurniture(20, 12, 1, 1, 'shelf');
  addFurniture(20, 14, 1, 1, 'shelf');
  addFurniture(26, 12, 1, 1, 'shelf');
  addFurniture(26, 14, 1, 1, 'shelf');

  const rooms = [
    { name: 'Gallery', x0: 1, x1: 15, y0: 1, y1: 8, cx: 8, cy: 4, floor: 'floorGallery' },
    { name: 'Vault Hall', x0: 17, x1: 30, y0: 1, y1: 8, cx: 24, cy: 4, floor: 'floorVaultHall' },
    { name: 'Lobby', x0: 1, x1: 15, y0: 10, y1: 17, cx: 8, cy: 13, floor: 'floorLobby' },
    { name: 'The Vault', x0: 17, x1: 30, y0: 10, y1: 17, cx: 24, cy: 13, floor: 'floorVault' },
  ];

  const loot = [];
  const addLoot = (kind, tx, ty, label) => {
    const p = centre(tx, ty);
    loot.push({ kind, value: LOOT_VALUES[kind], x: p.x, y: p.y, label, taken: false });
  };
  addLoot('painting', 2, 4, 'Starry Heist');
  addLoot('painting', 8, 2, 'The Silent Duchess');
  addLoot('painting', 13, 6, 'Portrait of a Thief');
  addLoot('gold', 19, 4, 'Gold bars');
  addLoot('gold', 24, 2, 'Gold bars');
  addLoot('gold', 28, 5, 'Gold bars');
  addLoot('gem', 19, 13, 'Sapphire');
  addLoot('gem', 24, 16, 'Ruby');
  addLoot('jewel', 27, 13, 'The Crown Jewel');

  const guards = [
    { name: 'Mara', x: 3 * TILE, y: 2 * TILE, dir: 0, speed: 68, range: 260,
      waypoints: [centre(3, 2), centre(13, 2), centre(13, 7), centre(3, 7)] },
    { name: 'Dario', x: 19 * TILE, y: 2 * TILE, dir: 0, speed: 75, range: 260,
      waypoints: [centre(19, 2), centre(28, 2), centre(28, 7), centre(19, 7)] },
    { name: 'Petra', x: 5 * TILE, y: 11 * TILE, dir: 0, speed: 65, range: 260,
      waypoints: [centre(5, 11), centre(13, 11), centre(13, 15), centre(5, 15)] },
    { name: 'Voss', x: 19 * TILE, y: 11 * TILE, dir: 0, speed: 85, range: 300,
      waypoints: [centre(19, 11), centre(28, 11), centre(28, 16), centre(19, 16)] },
  ];
  const cameras = [
    { x: 2.5 * TILE, y: 1.5 * TILE, baseAngle: Math.PI / 4, sweep: 0.7, speed: 0.55 },
    { x: 29.5 * TILE, y: 1.5 * TILE, baseAngle: (3 * Math.PI) / 4, sweep: 0.7, speed: 0.5 },
    { x: 29.5 * TILE, y: 16.5 * TILE, baseAngle: (-3 * Math.PI) / 4, sweep: 0.6, speed: 0.65 },
  ];

  const level = {
    solid,
    rooms,
    furniture,
    loot,
    guards,
    cameras,
    playerStart: centre(3, 15),
    exit: centre(5, 16),
    vaultDoor: { ...centre(vaultDoorTile.tx, vaultDoorTile.ty), ...vaultDoorTile, locked: true, progress: 0 },
  };
  level.roomAt = (x, y) => roomAt(level, x, y);
  return level;
}
