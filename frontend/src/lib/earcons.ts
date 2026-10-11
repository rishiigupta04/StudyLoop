/**
 * Two soft notes so a voice turn is heard, not only seen: rising when the mic opens (~ pressed), falling when it
 * closes (~ released). Synthesized with Web Audio (no files), ~150 ms and quiet, so the recording barely hears it.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume(); // ~ is a user gesture, so this is allowed
    return ctx;
  } catch {
    return null; // no Web Audio: silent
  }
}

const NOTES: Record<'start' | 'stop', number[]> = {
  start: [660, 880], // E5 → A5
  stop: [880, 587], // A5 → D5
};

export function earcon(kind: 'start' | 'stop'): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.01;
  NOTES[kind].forEach((freq, i) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const at = t0 + i * 0.07;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.06, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.connect(gain).connect(a.destination);
    osc.start(at);
    osc.stop(at + 0.1);
  });
}
