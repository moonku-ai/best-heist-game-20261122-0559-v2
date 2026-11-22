// Procedural sound: every effect is a WebAudio oscillator, no audio files.
// The alarm loop's volume follows the alarm meter, so tension is audible.
let ctx = null;
let muted = false;
let alarmGain = null;
let alarmOsc = null;

export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  if (alarmGain) alarmGain.gain.value = muted ? 0 : 0.0;
  return muted;
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    alarmOsc = ctx.createOscillator();
    alarmOsc.type = 'sawtooth';
    alarmOsc.frequency.value = 620;
    alarmGain = ctx.createGain();
    alarmGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.2;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain);
    lfoGain.connect(alarmOsc.frequency);
    alarmOsc.connect(alarmGain);
    alarmGain.connect(ctx.destination);
    alarmOsc.start();
    lfo.start();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function initAudio() { ensureCtx(); }

function tone(freq, dur, type = 'sine', vol = 0.12, when = 0) {
  const ac = ensureCtx();
  if (!ac || muted) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + when;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  loot() { tone(880, 0.12, 'sine', 0.12); tone(1318, 0.18, 'sine', 0.1, 0.08); },
  jewel() { tone(523, 0.15, 'triangle', 0.14); tone(659, 0.15, 'triangle', 0.14, 0.1); tone(784, 0.3, 'triangle', 0.14, 0.2); },
  spotted() { tone(220, 0.25, 'sawtooth', 0.14); tone(175, 0.3, 'sawtooth', 0.14, 0.12); },
  caught() { tone(110, 0.5, 'sawtooth', 0.18); tone(82, 0.7, 'square', 0.12, 0.1); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.13, i * 0.12)); },
  door() { tone(1200, 0.06, 'square', 0.06); tone(1500, 0.06, 'square', 0.06, 0.09); },
  smoke() { tone(300, 0.3, 'sine', 0.08); },
  jammer() { tone(1800, 0.1, 'square', 0.05); tone(900, 0.15, 'square', 0.05, 0.08); },
};

/** Call every frame: the alarm siren swells as the meter rises. */
export function setAlarmLevel(level) {
  if (!alarmGain || muted) return;
  const target = level > 45 ? 0.02 + (level - 45) * 0.0006 : 0;
  alarmGain.gain.setTargetAtTime(target, ctx.currentTime, 0.2);
}
