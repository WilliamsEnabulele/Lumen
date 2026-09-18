import { Injectable, signal } from '@angular/core';
import { NoiseGate } from './noise-gate';

/**
 * The microphone half of barge-in.
 *
 * It decides alone. Nothing here asks the server whether to stop, because the round trip
 * costs more than the entire budget between the student opening their mouth and the tutor
 * going quiet. The server is told what happened; it is not consulted about whether it should.
 *
 * Echo cancellation is not optional. Without it the microphone hears the tutor through the
 * speakers, and the gate spends the lesson interrupting the tutor on its own voice.
 */
@Injectable({ providedIn: 'root' })
export class BargeInDetector {
  /** Sampling period. Short enough that two frames still fit inside the budget. */
  static readonly FramePeriodMs = 10;

  private readonly gate = new NoiseGate();
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tutorIsSpeaking = false;

  /** Normalised 0..1 against the current threshold, for a mic meter. */
  readonly level = signal(0);
  readonly armed = signal(false);

  /** Called on the frame the gate opens. Stop audio here and do not wait for anything. */
  onBargeIn: (() => void) | null = null;

  async arm(): Promise<void> {
    if (this.armed()) return;
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('This browser exposes no microphone, so barge-in is unavailable.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    this.context = new AudioContext();
    const source = this.context.createMediaStreamSource(this.stream);
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const samples = new Float32Array(analyser.fftSize);
    this.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);

      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);

      this.level.set(Math.min(1, rms / (this.gate.threshold * 2)));

      if (this.gate.observe(rms, this.tutorIsSpeaking)) {
        this.onBargeIn?.();
      }
    }, BargeInDetector.FramePeriodMs);

    this.armed.set(true);
  }

  /** The gate only opens while there is something to interrupt. */
  setTutorSpeaking(speaking: boolean): void {
    this.tutorIsSpeaking = speaking;
    if (!speaking) this.gate.reset();
  }

  disarm(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    this.armed.set(false);
    this.level.set(0);
  }
}
