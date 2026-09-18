import { DEFAULT_NOISE_GATE, NoiseGate } from './noise-gate';

describe('NoiseGate', () => {
  const loud = 0.4;
  const quiet = 0.002;

  it('does not fire on a single frame, which is a click or a chair', () => {
    const gate = new NoiseGate();
    expect(gate.observe(loud, true)).toBeFalse();
  });

  it('fires once the student is still there on the next frame', () => {
    const gate = new NoiseGate();
    gate.observe(loud, true);
    expect(gate.observe(loud, true)).toBeTrue();
  });

  it('fires exactly once per burst, not on every frame after', () => {
    const gate = new NoiseGate();
    const fired = [1, 2, 3, 4, 5].map(() => gate.observe(loud, true));
    expect(fired.filter(Boolean).length).toBe(1);
  });

  it('does not fire when the tutor is not speaking — there is nothing to interrupt', () => {
    const gate = new NoiseGate();
    gate.observe(loud, false);
    expect(gate.observe(loud, false)).toBeFalse();
  });

  it('needs the configured number of frames', () => {
    const gate = new NoiseGate({ ...DEFAULT_NOISE_GATE, framesToTrigger: 3 });
    expect(gate.observe(loud, true)).toBeFalse();
    expect(gate.observe(loud, true)).toBeFalse();
    expect(gate.observe(loud, true)).toBeTrue();
  });

  it('a break in the noise starts the count again', () => {
    const gate = new NoiseGate();
    gate.observe(loud, true);
    gate.observe(quiet, true);
    expect(gate.observe(loud, true)).toBeFalse();
  });

  it('measures the room while the tutor is silent', () => {
    const gate = new NoiseGate();
    const before = gate.roomNoise;
    for (let i = 0; i < 200; i++) gate.observe(0.05, false);
    expect(gate.roomNoise).toBeGreaterThan(before);
    expect(gate.threshold).toBeGreaterThan(DEFAULT_NOISE_GATE.minimumThreshold);
  });

  it('does not let the tutor’s own voice raise the floor and deafen the gate', () => {
    const gate = new NoiseGate();
    const before = gate.roomNoise;
    for (let i = 0; i < 200; i++) gate.observe(0.5, true);
    expect(gate.roomNoise).toBe(before);
  });

  it('never drops below the absolute minimum threshold in a silent room', () => {
    const gate = new NoiseGate();
    for (let i = 0; i < 500; i++) gate.observe(0, false);
    expect(gate.threshold).toBe(DEFAULT_NOISE_GATE.minimumThreshold);
  });
});
