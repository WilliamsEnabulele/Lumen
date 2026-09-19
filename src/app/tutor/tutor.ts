import { Component, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GroundedAnswer, ScriptNode, isAssessment, toLessonScript } from 'domain';
import { BargeInDetector, SpeechOutput, TutorSession } from 'tutor-voice';
import { LumenApi } from '../api/lumen-api';
import { ConceptCanvas } from './concept-canvas';
import { OrbMode, VoiceOrb } from './voice-orb';

/** How long to wait for something intelligible before calling it a cough and carrying on. */
const FALSE_POSITIVE_WINDOW_MS = 1200;

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

@Component({
  selector: 'lumen-tutor',
  imports: [FormsModule, VoiceOrb, ConceptCanvas],
  templateUrl: './tutor.html',
  styleUrl: './tutor.scss',
})
export class Tutor implements OnDestroy {
  private readonly api = inject(LumenApi);
  private readonly speech = inject(SpeechOutput);
  private readonly detector = inject(BargeInDetector);
  private readonly session = inject(TutorSession);

  readonly courseId = input.required<string>();

  readonly courseTitle = signal('');
  readonly lessonTitle = signal('');
  readonly lessonId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly started = signal(false);

  readonly spokenTo = signal(0);
  readonly answer = signal<GroundedAnswer | null>(null);
  readonly aside = signal<string | null>(null);
  readonly question = signal('');
  readonly micDenied = signal(false);
  readonly rate = signal(1);

  readonly node = this.session.currentNode;
  readonly state = this.session.state;
  readonly progress = this.session.progress;
  readonly micLevel = this.detector.level;

  /** What the orb is doing. The student reads this before they read any words. */
  readonly orbMode = computed<OrbMode>(() => {
    switch (this.state()) {
      case 'teaching':
        return this.speech.speaking ? 'speaking' : 'idle';
      case 'listening':
        return 'listening';
      case 'answering':
        return 'speaking';
      case 'checkingUnderstanding':
        return 'listening';
      case 'adapting':
        return 'thinking';
      default:
        return 'idle';
    }
  });

  readonly spokenText = computed(() => this.node()?.text.slice(0, this.spokenTo()) ?? '');
  readonly pendingText = computed(() => this.node()?.text.slice(this.spokenTo()) ?? '');
  readonly canInterrupt = computed(() => this.state() === 'teaching' || this.state() === 'checkingUnderstanding');

  private falsePositiveTimer: ReturnType<typeof setTimeout> | null = null;
  private recognition: Recognition | null = null;

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.api.course(this.courseId()).subscribe({
      next: (course) => {
        this.courseTitle.set(course.title);
        const first = [...course.lessons].sort((a, b) => a.ordinal - b.ordinal)[0];
        if (!first) {
          this.error.set('That document did not produce a lesson to teach.');
          this.loading.set(false);
          return;
        }
        this.loadLesson(first.id);
      },
      error: (failure: Error) => {
        this.error.set(failure.message);
        this.loading.set(false);
      },
    });
  }

  private loadLesson(lessonId: string): void {
    this.api.script(lessonId).subscribe({
      next: (response) => {
        this.lessonId.set(response.lessonId);
        this.lessonTitle.set(response.title);
        this.session.loadLesson(toLessonScript(response.lessonId, response.nodes));
        this.loading.set(false);
      },
      error: (failure: Error) => {
        this.error.set(failure.message);
        this.loading.set(false);
      },
    });
  }

  async begin(): Promise<void> {
    this.started.set(true);

    try {
      await this.detector.arm();
      this.detector.onBargeIn = () => this.onBargeIn();
    } catch {
      // No microphone is a degraded lesson, not a broken one. Typing reaches the same path.
      this.micDenied.set(true);
    }

    this.teach(this.session.beginTeaching(), 0);
  }

  /** The student cut in. Stop first, work out what they wanted afterwards. */
  onBargeIn(): void {
    if (!this.canInterrupt()) return;

    const heardUpTo = this.speech.stop();
    this.detector.setTutorSpeaking(false);
    this.session.bargeIn(heardUpTo);
    this.answer.set(null);
    this.aside.set(null);
    this.listen();

    this.falsePositiveTimer = setTimeout(() => {
      if (this.state() !== 'listening') return;
      this.stopListening();
      this.resumeFrom(this.session.falsePositive());
    }, FALSE_POSITIVE_WINDOW_MS);
  }

  ask(): void {
    const asked = this.question().trim();
    if (!asked) return;
    this.question.set('');
    if (this.canInterrupt()) this.onBargeIn();
    this.handle(asked);
  }

  pause(): void {
    this.speech.stop();
    this.detector.setTutorSpeaking(false);
    this.stopListening();
    this.session.pause();
  }

  resume(): void {
    this.resumeFrom(this.session.resume());
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.stopListening();
    this.speech.stop();
    this.detector.disarm();
  }

  /** An interruption is a question, a pacing request, or a request to hear it again. */
  private handle(said: string): void {
    this.clearTimer();
    this.stopListening();
    if (this.state() !== 'listening') return;

    this.session.startAnswering();

    if (/\b(again|repeat|say that)\b/i.test(said)) {
      this.aside.set('Of course — from the top of that one.');
      this.resumeFrom({ ...this.session.resume(), speakFrom: 0 });
      return;
    }

    if (/\b(slow|slower|too fast)\b/i.test(said)) {
      this.rate.update((current) => Math.max(0.6, current - 0.2));
      this.aside.set(`Slowing down.`);
      this.resumeFrom(this.session.resume());
      return;
    }

    const lessonId = this.lessonId();
    if (!lessonId) {
      this.resumeFrom(this.session.resume());
      return;
    }

    // The lesson the student is in, and the node they are on. Asking about "that" only means
    // anything if the question carries where "that" was.
    this.api.ask(lessonId, said, this.node()?.id ?? null).subscribe({
      next: (grounded) => {
        this.answer.set(grounded);
        this.speech.speak(grounded.text, {
          rate: this.rate(),
          onFinished: () => this.resumeFrom(this.session.resume()),
        });
      },
      error: () => this.resumeFrom(this.session.resume()),
    });
  }

  private resumeFrom(instruction: { node: ScriptNode; speakFrom: number }): void {
    this.clearTimer();
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
        this.session.noteProgress(offset);
      },
      onFinished: () => {
        this.detector.setTutorSpeaking(false);
        if (isAssessment(node)) {
          this.session.askCheck();
          this.listen();
          return;
        }
        this.advance();
      },
    });
  }

  private advance(): void {
    const next = this.session.nodeComplete();
    if (!next) {
      this.stopListening();
      return;
    }
    this.aside.set(null);
    this.answer.set(null);
    this.teach(next, 0);
  }

  private listen(): void {
    const Recognizer =
      (globalThis as Record<string, unknown>)['SpeechRecognition'] ??
      (globalThis as Record<string, unknown>)['webkitSpeechRecognition'];

    if (typeof Recognizer !== 'function') return;

    try {
      const recognition = new (Recognizer as new () => Recognition)();
      recognition.lang = 'en-NG';
      recognition.interimResults = false;
      recognition.onresult = (event) => this.handle(event.results[0][0].transcript);
      recognition.onerror = () => this.stopListening();
      recognition.onend = () => (this.recognition = null);
      recognition.start();
      this.recognition = recognition;
    } catch {
      this.recognition = null;
    }
  }

  private stopListening(): void {
    try {
      this.recognition?.stop();
    } catch {
      // Already stopped; nothing to unwind.
    }
    this.recognition = null;
  }

  private clearTimer(): void {
    if (this.falsePositiveTimer !== null) {
      clearTimeout(this.falsePositiveTimer);
      this.falsePositiveTimer = null;
    }
  }
}
