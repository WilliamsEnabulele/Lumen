import { Injectable } from '@angular/core';
import { UtteranceProgress } from './utterance-progress';

export interface SpeakOptions {
  /** Where in the text to start. Non-zero when resuming after a detour. */
  readonly fromCharacter?: number;
  readonly rate?: number;
  /** Fired as the tutor speaks, with the absolute offset into the node's text. */
  readonly onProgress?: (offset: number) => void;
  /** Fired only when the utterance ran to completion — never after a cancellation. */
  readonly onFinished?: () => void;
}

/**
 * Speech out, with the one thing the resume pointer needs from it: where it got to.
 *
 * `stop()` is synchronous on purpose. The barge-in budget is 300ms from detection to silence,
 * and anything that awaits — a round trip, a promise, a confirmation — has spent it. The
 * client stops its own audio and tells the server afterwards.
 *
 * This wraps the browser's own speech synthesis, which is a stand-in. The product's teaching
 * audio is pre-synthesised at publish time and served as cached clips; this path is what runs
 * for an interruption answer, and what runs at all when a node has no rendered audio yet.
 */
@Injectable({ providedIn: 'root' })
export class SpeechOutput {
  /**
   * How much audio the client may have queued ahead of what the speaker has played.
   *
   * This is the constraint that actually decides NFR-1. A generous pre-buffer is the obvious
   * way to get smooth playback and it is exactly what breaks barge-in, because audio already
   * handed to the operating system keeps playing after we have decided to stop. Treat it as a
   * hard cap, not a tuning knob.
   */
  static readonly MaxBufferAheadMs = 250;

  private progress: UtteranceProgress | null = null;
  private estimator: ReturnType<typeof setInterval> | null = null;
  private cancelled = false;

  private get synthesis(): SpeechSynthesis | null {
    return typeof globalThis !== 'undefined' && 'speechSynthesis' in globalThis
      ? (globalThis as unknown as { speechSynthesis: SpeechSynthesis }).speechSynthesis
      : null;
  }

  get available(): boolean {
    return this.synthesis !== null;
  }

  private _speaking = false;
  get speaking(): boolean {
    return this._speaking;
  }

  speak(text: string, options: SpeakOptions = {}): void {
    const synthesis = this.synthesis;
    const from = options.fromCharacter ?? 0;
    const rate = options.rate ?? 1;

    this.stop();
    this.cancelled = false;
    this.progress = new UtteranceProgress(text, from);
    this._speaking = true;

    if (!synthesis) {
      // No speech engine: report completion so the lesson still advances in text-only mode.
      this._speaking = false;
      options.onFinished?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.slice(from));
    utterance.rate = rate;

    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      const offset = this.progress?.onBoundary(event.charIndex ?? 0) ?? from;
      options.onProgress?.(offset);
    };

    // Engines that never emit a boundary event — Safari's among them — still have to produce
    // a usable resume offset, so time carries it until a real event arrives.
    const startedAt = Date.now();
    this.estimator = setInterval(() => {
      if (!this._speaking || !this.progress) return;
      const offset = this.progress.onElapsed(Date.now() - startedAt, rate);
      options.onProgress?.(offset);
    }, 120);

    utterance.onend = () => {
      this.clearEstimator();
      if (this.cancelled) return;
      this._speaking = false;
      const offset = this.progress?.complete() ?? text.length;
      options.onProgress?.(offset);
      options.onFinished?.();
    };

    utterance.onerror = () => {
      this.clearEstimator();
      this._speaking = false;
    };

    synthesis.speak(utterance);
  }

  /** Stops immediately and returns the offset the student actually heard up to. */
  stop(): number {
    const offset = this.progress?.current ?? 0;
    this.cancelled = true;
    this._speaking = false;
    this.clearEstimator();
    this.synthesis?.cancel();
    return offset;
  }

  private clearEstimator(): void {
    if (this.estimator !== null) {
      clearInterval(this.estimator);
      this.estimator = null;
    }
  }
}
