import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScriptNode, isAssessment, snapBack } from 'domain';
import { BargeInDetector, SpeechOutput, TutorSession } from 'tutor-voice';
import { GroundedAnswer, LessonGateway } from './lesson-gateway';

/** How long to wait for something intelligible before calling it a cough and carrying on. */
const FALSE_POSITIVE_WINDOW_MS = 1200;

@Component({
  selector: 'lumen-lesson',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './lesson.html',
  styleUrl: './lesson.scss',
})
export class Lesson implements OnDestroy {
  private readonly gateway = inject(LessonGateway);
  private readonly speech = inject(SpeechOutput);
  private readonly detector = inject(BargeInDetector);
  readonly session = inject(TutorSession);

  readonly spokenTo = signal(0);
  readonly answer = signal<GroundedAnswer | null>(null);
  readonly detour = signal<string | null>(null);
  readonly question = signal('');
  readonly micError = signal<string | null>(null);
  readonly lastStopMs = signal<number | null>(null);
  readonly rate = signal(1);

  readonly node = this.session.currentNode;
  readonly state = this.session.state;

  readonly visual = computed(() => {
    const node = this.node();
    return node?.visualRef ? this.gateway.visual(node.visualRef) : null;
  });

  readonly check = computed(() => {
    const node = this.node();
    return node && isAssessment(node) ? this.gateway.checkOptions(node.id) : null;
  });

  readonly spokenText = computed(() => this.node()?.text.slice(0, this.spokenTo()) ?? '');
  readonly pendingText = computed(() => this.node()?.text.slice(this.spokenTo()) ?? '');

  readonly micLevel = this.detector.level;

  private falsePositiveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Load the lesson immediately so the canvas opens on the first node rather than on an
    // empty shell. Starting is what begins the speech, not what fetches the content.
    this.session.loadLesson(this.gateway.loadLesson());
  }

  async start(): Promise<void> {
    try {
      await this.detector.arm();
      this.detector.onBargeIn = () => this.onBargeIn();
    } catch (error) {
      // No microphone is a degraded session, not a broken one: the Interrupt button and the
      // space bar exercise exactly the same path.
      this.micError.set(error instanceof Error ? error.message : 'Microphone unavailable.');
    }

    this.teach(this.session.beginTeaching(), 0);
  }

  /** The student cut in. Stop first, ask questions afterwards. */
  onBargeIn(): void {
    if (this.state() !== 'teaching' && this.state() !== 'checkingUnderstanding') return;

    const startedStopping = performance.now();
    const heardUpTo = this.speech.stop();
    this.lastStopMs.set(performance.now() - startedStopping);

    this.detector.setTutorSpeaking(false);
    this.session.bargeIn(heardUpTo);
    this.answer.set(null);
    this.detour.set(null);

    this.falsePositiveTimer = setTimeout(() => {
      if (this.state() !== 'listening') return;
      this.resumeFrom(this.session.falsePositive());
    }, FALSE_POSITIVE_WINDOW_MS);
  }

  ask(): void {
    const asked = this.question().trim();
    if (!asked) return;
    this.question.set('');

    if (this.state() === 'teaching' || this.state() === 'checkingUnderstanding') this.onBargeIn();
    if (this.state() !== 'listening') return;

    this.clearFalsePositiveTimer();
    this.session.startAnswering();

    // An interruption is a question, a pacing request, or a topic change.
    if (/\b(again|repeat|say that)\b/i.test(asked)) {
      this.detour.set('Of course — from the top of that one.');
      this.resumeFrom({ ...this.session.resume(), speakFrom: 0 });
      return;
    }
    if (/\b(slow|slower|too fast)\b/i.test(asked)) {
      this.rate.update((r) => Math.max(0.6, r - 0.2));
      this.detour.set(`Slowing down — now ${this.rate().toFixed(1)}x.`);
      this.resumeFrom(this.session.resume());
      return;
    }

    const grounded = this.gateway.answer(asked);
    this.answer.set(grounded);

    this.speech.speak(grounded.text, {
      rate: this.rate(),
      onFinished: () => this.resumeFrom(this.session.resume()),
    });
  }

  answerCheck(chosen: number): void {
    const check = this.check();
    const node = this.node();
    if (!check || !node) return;

    this.speech.stop();
    this.detector.setTutorSpeaking(false);

    if (chosen === check.correct) {
      this.detour.set('Correct.');
      // resume() moves the state back to teaching; advance() is what speaks next. Doing both
      // through resumeFrom would say the check node again on top of it.
      this.session.resume();
      this.advance();
      return;
    }

    this.detour.set('Not quite — let me take that one again from a different angle.');
    this.teach(this.session.adapt(check.reteach), 0);
  }

  interruptManually(): void {
    this.onBargeIn();
  }

  pause(): void {
    this.speech.stop();
    this.detector.setTutorSpeaking(false);
    this.session.pause();
  }

  resume(): void {
    this.resumeFrom(this.session.resume());
  }

  ngOnDestroy(): void {
    this.clearFalsePositiveTimer();
    this.speech.stop();
    this.detector.disarm();
  }

  /** What the resume actually rewound past, for the pointer readout. */
  rewoundBy(): number {
    const pointer = this.session.pointer();
    const node = this.node();
    if (!pointer || !node) return 0;
    return pointer.utteranceOffset - snapBack(node.text, pointer.utteranceOffset);
  }

  private resumeFrom(instruction: { node: ScriptNode; speakFrom: number }): void {
    this.clearFalsePositiveTimer();
    this.teach(instruction.node, instruction.speakFrom);
  }

  private teach(node: ScriptNode, fromCharacter: number): void {
    this.spokenTo.set(fromCharacter);
    this.detector.setTutorSpeaking(true);

    this.speech.speak(node.text, {
      fromCharacter,
      rate: this.rate(),
      onProgress: (offset) => {
        this.spokenTo.set(offset);
        this.session.progress(offset);
      },
      onFinished: () => {
        this.detector.setTutorSpeaking(false);
        if (isAssessment(node)) {
          this.session.askCheck();
          return;
        }
        this.advance();
      },
    });
  }

  private advance(): void {
    const next = this.session.nodeComplete();
    if (!next) return;
    this.detour.set(null);
    this.answer.set(null);
    this.teach(next, 0);
  }

  private clearFalsePositiveTimer(): void {
    if (this.falsePositiveTimer !== null) {
      clearTimeout(this.falsePositiveTimer);
      this.falsePositiveTimer = null;
    }
  }
}
