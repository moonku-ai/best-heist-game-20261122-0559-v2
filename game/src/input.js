// Keyboard + mouse input: WASD/arrows to move, Shift to sneak, E to pick locks,
// Q smoke, F jammer, P/Esc pause, R restart, M mute. Click-to-move sets a
// target the main loop steers toward. No DOM work happens in the world.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    clickTarget: null,
    pausePressed: false,
    restartPressed: false,
    mutePressed: false,
  };
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'sneak', ShiftRight: 'sneak',
    KeyE: 'interact',
    KeyQ: 'smoke',
    KeyF: 'jammer',
  };
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'KeyP' || event.code === 'Escape') input.pausePressed = true;
    if (event.code === 'KeyR') input.restartPressed = true;
    if (event.code === 'KeyM') input.mutePressed = true;
    const action = KEYMAP[event.code];
    if (action) {
      keys.add(action);
      if (['up', 'down', 'left', 'right'].includes(action)) input.clickTarget = null;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    const action = KEYMAP[event.code];
    if (action) keys.delete(action);
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    input.clickTarget = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  });
  input.read = (player) => {
    let mx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    let my = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    if (mx === 0 && my === 0 && input.clickTarget) {
      const dx = input.clickTarget.x - player.x;
      const dy = input.clickTarget.y - player.y;
      if (Math.hypot(dx, dy) < 14) {
        input.clickTarget = null;
      } else {
        const len = Math.hypot(dx, dy);
        mx = dx / len;
        my = dy / len;
      }
    }
    const state = {
      mx, my,
      sneak: keys.has('sneak'),
      interact: keys.has('interact'),
      smoke: keys.has('smoke'),
      jammer: keys.has('jammer'),
    };
    return state;
  };
  return input;
}
