let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function seq(notes: number[], step = 0.07, type: OscillatorType = "square", vol = 0.045) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + 0.01;
  notes.forEach((f, i) => {
    if (!f) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = f;
    const t = t0 + i * step;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.95);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + step);
  });
}

export const sfx = {
  click: () => seq([880], 0.035, "square", 0.025),
  tick: () => seq([660, 990], 0.06),
  untick: () => seq([520, 390], 0.06),
  step: () => seq([523, 784], 0.06),
  save: () => seq([523, 659, 784, 1047], 0.075),
  seal: () => seq([392, 0, 523, 659, 784, 0, 1047, 1047], 0.09, "square", 0.05),
  allDone: () => seq([784, 988, 1175, 1568], 0.08),
  error: () => seq([180, 140], 0.11, "sawtooth", 0.03),
  pop: () => seq([1200], 0.03, "triangle", 0.05),
};
