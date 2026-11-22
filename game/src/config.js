// Constants and palette for The Velvet Vault — one source of truth for sizes,
// speeds, timers and colours, so world, render and shots all agree.
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;

export const PLAYER_RADIUS = 12;
export const PLAYER_SPEED = 170;
export const SNEAK_SPEED = 110;
export const GUARD_PATROL_SPEED = 68;
export const GUARD_CHASE_SPEED = 192;
export const GUARD_CATCH_RADIUS = 24;

export const NIGHT_SECONDS = 300;
export const ALARM_MAX = 100;
export const ALARM_GUARD_RATE = 40;
export const ALARM_CAMERA_RATE = 25;
export const ALARM_DECAY_RATE = 10;

export const SMOKE_CHARGES = 2;
export const SMOKE_RADIUS = 95;
export const SMOKE_SECONDS = 4;
export const JAMMER_CHARGES = 2;
export const JAMMER_SECONDS = 6;
export const LOCKPICK_SECONDS = 2;

export const LOOT_VALUES = { painting: 100, gold: 250, gem: 400, jewel: 1000 };
export const GHOST_BONUS = 500;
export const TIME_BONUS_PER_SECOND = 5;

// Museum-at-night palette: deep navy floors, warm gold loot, red danger.
// Safe cover reads dark teal, danger reads red/orange at a glance.
export const PALETTE = {
  floorGallery: '#232a3d',
  floorVaultHall: '#2a2438',
  floorLobby: '#1f2b26',
  floorVault: '#33261f',
  wall: '#0d1020',
  wallTop: '#2c3550',
  furniture: '#3d4a6b',
  furnitureTop: '#55648f',
  door: '#6b5a2e',
  exit: '#2fd47a',
  player: '#ffd166',
  playerSneak: '#e0a458',
  guard: '#ff5a5a',
  guardCone: 'rgba(255, 90, 90, 0.20)',
  guardConeAlert: 'rgba(255, 40, 40, 0.38)',
  camera: '#ff9f43',
  cameraCone: 'rgba(255, 159, 67, 0.16)',
  lootPainting: '#7ec8ff',
  lootGold: '#ffd166',
  lootGem: '#c77dff',
  lootJewel: '#ffdf6b',
  smoke: 'rgba(200, 200, 210, 0.55)',
  alarmLow: '#2fd47a',
  alarmMid: '#ffb020',
  alarmHigh: '#ff3b30',
  hudBg: 'rgba(8, 10, 20, 0.82)',
  hudText: '#e8ecf4',
  hudMuted: '#9aa5bd',
};
