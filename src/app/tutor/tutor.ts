import { Component, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConceptProgress, SessionStarted } from 'domain';
import { BargeInDetector, SpeechOutput, TutorSession } from 'tutor-voice';
import { LumenApi } from '../api/lumen-api';
import { ConceptProgressPanel } from '../progress/concept-progress';
import { TutorCanvas } from './tutor-canvas';
import { OrbMode, VoiceOrb } from './voice-orb';

/** How long to wait for something intelligible before calling it a cough and carrying on. */
const FALSE_POSITIVE_WINDOW_MS = 1200;

/**
 * How long to hold the silence after asking a question.
 *
 * Long by the standards of a chat interface and about right for a room. Thinking out loud
 * takes time, and a tutor that fills a ten-second pause has taught the student that pausing
 * is not allowed. When it does run out, silence goes to the server as silence — which is
 * marked as no answer, costs nothing, and gets them taught rather than failed.
 */
const ANSWER_PATIENCE_MS = 12_000;

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
  imports: [FormsModule, VoiceOrb, TutorCanvas, ConceptProgressPanel],
  templateUrl: './tutor.html',
  styleUrl: './tutor.scss',
})
export class Tutor implements OnDestroy {
  private readonly api = inject(LumenApi);
  private readonly speech = inject(SpeechOutput);
  private readonly detector = inject(BargeInDetector);
  readonly session = inject(TutorSession);

  readonly courseId = input.required<string>();

  readonly course = signal<SessionStarted | null>(null);
  readonly error = signal<string | null>(null);
  readonly started = signal(false);
  readonly micDenied = signal(false);
  readonly question = signal('');

  readonly state = this.session.state;
  readonly canvas = this.session.canvas;
  readonly progress = this.session.progress;
  readonly micLevel = this.detector.level;

  /** What the orb is doing. The student reads this before they read any words. */
  readonly orbMode = computed<OrbMode>(() => {
    switch (this.state()) {
      case 'teaching':
        return this.speech.speaking ? 'speaking' : 'idle';
      case 'listening':
        return 'listening';
      case 'thinking':
        return 'thinking';
      default:
        return 'idle';
    }
  });

  readonly canInterrupt = computed(() => this.state() === 'teaching');

  /** True when no model is configured, so the degraded mode is visible rather than silent. */
  readonly degraded = computed(() => this.session.tutorName().startsWith('scripted'));

  /** What just happened to the lesson's position, when it was not simply the next concept. */
  readonly marked = this.session.marked;
  readonly movedOn = this.session.movedOn;

  /**
   * What the server believes the student knows. Fetched on demand rather than kept in step
   * every turn: it is a report, not part of the conversation, and polling it while someone is
   * being taught spends requests on a panel nobody has opened.
   */
  readonly standing = signal<readonly ConceptProgress[] | null>(null);
  readonly standingOpen = signal(false);
  readonly loadingStanding = signal(false);

  private sessionId: string | null = null;
  private falsePositiveTimer: ReturnType<typeof setTimeout> | null = null;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  private recognition: Recognition | null = null;

  constructor() {
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.api.startSession(this.courseId()).subscribe({
      next: (started) => {
        this.course.set(started);
        this.sessionId = started.sessionId;
      },
      error: (failure: Error) => this.error.set(failure.message),
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

    this.nextTurn(null);
  }

  /** The student cut in. Stop first, work out what they wanted afterwards. */
  onBargeIn(): void {
    if (!this.canInterrupt()) return;

    const heardUpTo = this.speech.stop();
    this.detector.setTutorSpeaking(false);
    this.session.bargeIn(heardUpTo);
    this.listen();

    this.falsePositiveTimer = setTimeout(() => {
      if (this.state() !== 'listening') return;
      this.stopListening();
      // Nothing intelligible: pick the same turn back up rather than asking for a new one.
      this.session.moveTo('teaching');
      this.speakCurrentTurn(this.session.resumeOffset());
    }, FALSE_POSITIVE_WINDOW_MS);
  }

  /**
   * Opens the progress panel, refreshing it each time.
   *
   * Refreshed on open because it goes stale the moment an answer is marked, and a panel
   * showing what the student knew four questions ago is worse than one that takes a beat.
   */
  toggleStanding(): void {
    const opening = !this.standingOpen();
    this.standingOpen.set(opening);
    if (opening) this.refreshStanding();
  }

  private refreshStanding(): void {
    if (!this.sessionId) return;

    this.loadingStanding.set(this.standing() === null);

    this.api.progress(this.sessionId).subscribe({
      next: (progress) => {
        this.standing.set(progress);
        this.loadingStanding.set(false);
      },
      error: () => {
        // A report that will not load must not take the lesson down with it.
        this.loadingStanding.set(false);
      },
    });
  }

  ask(): void {
    const asked = this.question().trim();
    if (!asked) return;
    this.question.set('');

    if (this.canInterrupt()) this.onBargeIn();
    this.said(asked);
  }

  ngOnDestroy(): void {
    this.clearTimer();
    this.stopListening();
    this.speech.stop();
    this.detector.disarm();
  }

  private said(text: string): void {
    this.clearTimer();
    this.stopListening();
    this.nextTurn(text);
  }

  /** Ask the tutor for its next turn, then speak whatever comes back. */
  private nextTurn(said: string | null): void {
    if (!this.sessionId || this.state() === 'complete') return;

    this.clearTimer();
    this.session.moveTo('thinking');
    this.detector.setTutorSpeaking(false);

    this.api.turn(this.sessionId, said).subscribe({
      next: (turn) => {
        this.session.beginTurn(turn);

        // A marked answer moves the belief, so anything on screen is now wrong. The end of the
        // course is the one moment this is worth showing unasked.
        if (turn.complete) {
          this.standingOpen.set(true);
          this.refreshStanding();
        } else if (turn.marked && this.standingOpen()) {
          this.refreshStanding();
        }

        if (turn.complete && !turn.said) return;
        this.speakCurrentTurn(0);
      },
      error: (failure: Error) => {
        this.error.set(failure.message);
        this.session.moveTo('idle');
      },
    });
  }

  private speakCurrentTurn(fromCharacter: number): void {
    const text = this.session.said();
    if (!text) {
      this.nextTurn(null);
      return;
    }

    this.session.noteProgress(fromCharacter);
    this.detector.setTutorSpeaking(true);

    this.speech.speak(text, {
      fromCharacter,
      onProgress: (offset) => this.session.noteProgress(offset),
      onFinished: () => {
        this.detector.setTutorSpeaking(false);
        if (this.state() === 'complete') return;

        // A question was asked. Stop and wait — this is the pause the lesson is for.
        if (this.session.awaitingAnswer()) {
          this.awaitAnswer();
          return;
        }

        // Otherwise silence from the student is itself an answer: carry on.
        this.nextTurn(null);
      },
    });
  }

  /**
   * Holds the silence after a check, then gives up gracefully.
   *
   * Giving up matters as much as waiting. A student who says nothing must not leave the tutor
   * sitting there forever, and must not be marked down for it either — silence goes to the
   * server as silence, and the server knows what that is worth.
   */
  private awaitAnswer(): void {
    this.session.moveTo('listening');
    this.listen();

    this.answerTimer = setTimeout(() => {
      if (this.state() !== 'listening') return;
      this.stopListening();
      this.nextTurn(null);
    }, ANSWER_PATIENCE_MS);
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
      recognition.onresult = (event) => this.said(event.results[0][0].transcript);
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
    if (this.answerTimer !== null) {
      clearTimeout(this.answerTimer);
      this.answerTimer = null;
    }
  }
}
