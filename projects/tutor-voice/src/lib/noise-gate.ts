/**
 * Decides, from microphone loudness alone, that the student has started speaking.
 *
 * This runs on the client and answers on its own, because the barge-in budget is 300ms from
 * detection to silence and a round trip to ask the server spends all of it before anything
 * has been decided. The gate is deliberately dumb and fast: everything clever about *what*
 * the student said happens after the audio has already stopped.
 */
export interface NoiseGateOptions {
  /** Absolute floor, so a silent room cannot adapt its way into triggering on nothing. */
  readonly minimumThreshold: number;
  /** How far above the measured room noise counts as speech. */
  readonly thresholdMultiple: number;
  /** Consecutive frames over threshold before firing. Two is enough to reject a click. */
  readonly framesToTrigger: number;
  /** How quickly the measured room noise follows the room. */
  readonly adaptionRate: number;
}

export const DEFAULT_NOISE_GATE: NoiseGateOptions = {
  minimumThreshold: 0.018,
  thresholdMultiple: 3.2,
  framesToTrigger: 2,
  adaptionRate: 0.03,
};

export class NoiseGate {
  private floor = 0.006;
  private consecutiveHotFrames = 0;

  constructor(private readonly options: NoiseGateOptions = DEFAULT_NOISE_GATE) {}

  get threshold(): number {
    return Math.max(this.floor * this.options.thresholdMultiple, this.options.minimumThreshold);
  }

  get roomNoise(): number {
    return this.floor;
  }

  /**
   * Returns true exactly once, on the frame the gate opens. Callers stop audio on that frame
   * and do not wait to be told again.
   *
   * The room noise is only measured while the tutor is silent. Measuring it while the tutor
   * is talking would raise the floor to the level of the tutor's own voice coming back through
   * the microphone, and the gate would go deaf precisely when it is needed.
   */
  observe(rms: number, tutorIsSpeaking: boolean): boolean {
    if (!tutorIsSpeaking) {
      this.adapt(rms);
      this.consecutiveHotFrames = 0;
      return false;
    }

    if (rms <= this.threshold) {
      this.consecutiveHotFrames = 0;
      return false;
    }

    this.consecutiveHotFrames++;
    return this.consecutiveHotFrames === this.options.framesToTrigger;
  }

  reset(): void {
    this.consecutiveHotFrames = 0;
  }

  private adapt(rms: number): void {
    const rate = this.options.adaptionRate;
    this.floor = this.floor * (1 - rate) + rms * rate;
  }
}
