import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  viewChild,
} from '@angular/core';

export type OrbMode = 'idle' | 'speaking' | 'listening' | 'thinking';

/**
 * The tutor's presence: what tells a student, without a word of UI copy, whether it is talking,
 * waiting for them, or working something out.
 *
 * One honest distinction is built in. While the student speaks, the rings follow the real
 * microphone level, so the orb is a meter. While the tutor speaks, the browser gives us no
 * amplitude to follow, so the motion is a generated cadence — an indicator, not a waveform.
 * Dressing that up as a real signal would be inventing data on screen, and once the tutor's
 * audio is pre-synthesised there is a genuine envelope to drive it with instead.
 */
@Component({
  selector: 'lumen-voice-orb',
  template: `<canvas #surface role="img" [attr.aria-label]="label()"></canvas>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        aspect-ratio: 1;
        max-width: 200px;
      }
      canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
})
export class VoiceOrb implements AfterViewInit, OnDestroy {
  readonly mode = input<OrbMode>('idle');
  /** 0..1. Real microphone level while listening; ignored while speaking. */
  readonly level = input(0);

  readonly label = computed(() => {
    switch (this.mode()) {
      case 'speaking':
        return 'The tutor is speaking';
      case 'listening':
        return 'Listening to you';
      case 'thinking':
        return 'Working that out';
      default:
        return 'The tutor is waiting';
    }
  });

  private readonly surface = viewChild.required<ElementRef<HTMLCanvasElement>>('surface');
  private frame = 0;
  private started = 0;
  private reduced = false;

  ngAfterViewInit(): void {
    this.reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.started = performance.now();
    this.draw();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
  }

  private draw = (): void => {
    const canvas = this.surface().nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    const ratio = Math.min(devicePixelRatio || 1, 2);
    const size = canvas.clientWidth || 200;
    if (canvas.width !== size * ratio) {
      canvas.width = size * ratio;
      canvas.height = size * ratio;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);

    const centre = size / 2;
    const seconds = (performance.now() - this.started) / 1000;
    const mode = this.mode();
    const accent = this.colour(mode);
    const amplitude = this.amplitude(mode, seconds);

    // Rings, outermost first, each one lagging the one inside it.
    for (let ring = 3; ring >= 1; ring--) {
      const lag = ring * 0.18;
      const breathe = this.reduced ? 0.5 : this.amplitude(mode, seconds - lag);
      const radius = centre * (0.28 + ring * 0.16 + breathe * 0.09);

      context.beginPath();
      context.arc(centre, centre, Math.min(radius, centre - 1), 0, Math.PI * 2);
      context.strokeStyle = accent;
      context.globalAlpha = (0.05 + breathe * 0.18) * (4 - ring) * 0.4;
      context.lineWidth = 1.5;
      context.stroke();
    }

    context.globalAlpha = 1;
    context.beginPath();
    context.arc(centre, centre, centre * (0.2 + amplitude * 0.05), 0, Math.PI * 2);
    context.fillStyle = accent;
    context.fill();

    this.frame = requestAnimationFrame(this.draw);
  };

  private amplitude(mode: OrbMode, seconds: number): number {
    if (this.reduced) return 0.5;

    switch (mode) {
      case 'listening':
        // The real thing: microphone loudness.
        return Math.min(1, this.level());
      case 'speaking': {
        // A generated cadence, not a waveform. See the note on this class.
        const carrier = 0.5 + 0.5 * Math.sin(seconds * 7.1);
        const envelope = 0.55 + 0.45 * Math.sin(seconds * 2.7 + 1.1);
        return Math.max(0, carrier * envelope);
      }
      case 'thinking':
        return 0.3 + 0.2 * Math.sin(seconds * 1.6);
      default:
        return 0.18 + 0.06 * Math.sin(seconds * 0.9);
    }
  }

  private colour(mode: OrbMode): string {
    const styles = getComputedStyle(this.surface().nativeElement);
    const token = mode === 'listening' ? '--student' : '--tutor';
    return styles.getPropertyValue(token).trim() || '#b06d22';
  }
}
