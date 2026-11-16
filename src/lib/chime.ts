'use client';

let ctx: AudioContext | null = null;

/** Create/unlock the AudioContext during a user gesture so the end-of-break chime can play later. */
export function primeChime() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unavailable */
  }
}

/** Gentle two-note chime played when the break finishes. */
export function playChime() {
  try {
    primeChime();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.25);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.25 + 1.2);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 1.3);
    });
  } catch {
    /* ignore */
  }
}
