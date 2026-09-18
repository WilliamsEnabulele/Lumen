/**
 * How far into an utterance the tutor has actually spoken.
 *
 * This is what the resume offset is made of, and it is the piece most dependent on the voice
 * provider. Engines that emit word-boundary events give it exactly; several — Safari's among
 * them — never emit one at all, so there is a time-based estimate behind it.
 *
 * The estimate is a fallback, never a correction: once a real boundary has arrived, the
 * estimate is switched off for the rest of the utterance rather than allowed to argue with
 * the truth. "Does it tell you where you are inside the utterance" is a provider selection
 * criterion because of this file.
 */
export class UtteranceProgress {
  private offset: number;
  private sawRealBoundary = false;

  constructor(
    private readonly text: string,
    private readonly base = 0,
    private readonly charactersPerSecond = 14,
  ) {
    this.offset = Math.min(base, text.length);
  }

  get current(): number {
    return this.offset;
  }

  get usingEstimate(): boolean {
    return !this.sawRealBoundary;
  }

  /** A word-boundary event from the speech engine. The truth, when it is available. */
  onBoundary(charIndex: number): number {
    this.sawRealBoundary = true;
    return this.advanceTo(this.base + charIndex);
  }

  /** Only consulted while no boundary event has ever arrived for this utterance. */
  onElapsed(elapsedMs: number, rate = 1): number {
    if (this.sawRealBoundary) return this.offset;
    const spoken = Math.floor((elapsedMs / 1000) * this.charactersPerSecond * rate);
    return this.advanceTo(this.base + spoken);
  }

  /** The utterance finished, so everything was said. */
  complete(): number {
    this.offset = this.text.length;
    return this.offset;
  }

  /** Progress never goes backwards — a late event must not rewind what was already heard. */
  private advanceTo(candidate: number): number {
    const clamped = Math.max(0, Math.min(candidate, this.text.length));
    if (clamped > this.offset) this.offset = clamped;
    return this.offset;
  }
}
