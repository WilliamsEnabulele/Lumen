import { Component, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConceptProgress, SessionStarted, StudyNoteView, TurnTaken, throughPlan } from 'domain';
import { BargeInDetector, SpeechOutput, TutorSession } from 'tutor-voice';
import { LumenApi } from '../api/lumen-api';
import { LessonSidebar, PlanStep } from '../layouts/lesson-sidebar';
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

/**
 * One thing the tutor said, kept so it can be read back and saved from.
 *
 * Accumulated here rather than in TutorSession, which models the one utterance in flight, and
 * client-side rather than fetched, because this is the record of this sitting — the room, not
 * the course. What outlives the sitting is what the student chose to keep, and that goes to
 * the server.
 */
export interface SpokenLine {
  readonly id: number;
  readonly said: string;
  readonly conceptTitle: string;
  readonly sourceRef: string;
  readonly at: Date;
}

/** Which of the three panes the study panel is showing. */
export type StudyTab = 'transcript' | 'key-points' | 'notes';

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
  imports: [FormsModule, VoiceOrb, TutorCanvas, LessonSidebar],
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

  /** What has been said this sitting, oldest first, the way a transcript is read. */
  readonly transcript = signal<readonly SpokenLine[]>([]);

  readonly tab = signal<StudyTab>('transcript');
  readonly notes = signal<readonly StudyNoteView[]>([]);
  readonly noteDraft = signal('');
  readonly noteError = signal<string | null>(null);

  /** The note being rewritten, if any. Key points are never in here — they are not ours to edit. */
  readonly editing = signal<string | null>(null);
  readonly editDraft = signal('');

  readonly keyPoints = computed(() => this.notes().filter((note) => note.kind === 'KeyPoint'));
  readonly ownNotes = computed(() => this.notes().filter((note) => note.kind === 'Note'));

  /**
   * Every concept in the plan, in teaching order, flattened across lessons.
   *
   * The sidebar is a map of where the lesson is, and a student does not think in lessons and
   * concepts as two levels — they think in "what have we done, what is next".
   */
  readonly steps = computed<readonly PlanStep[]>(() =>
    (this.course()?.lessons ?? []).flatMap((lesson) =>
      lesson.concepts.map((concept) => ({ lesson: lesson.title, concept })),
    ),
  );

  readonly currentStep = computed(() => {
    const here = this.session.conceptTitle();
    return here ? this.steps().findIndex((step) => step.concept === here) : -1;
  });

  /**
   * How far through the plan this lesson has got, as a percentage.
   *
   * Position, never belief. What the server believes a student knows is deliberately never
   * rendered as a number — a belief shown as "87%" gets read as a grade, and arguing with it
   * as though it were one is the wrong argument. How many concepts the lesson has walked past
   * is a fact about the lesson, and a bar is the right shape for it.
   */
  readonly position = computed(() =>
    throughPlan(this.steps().length, this.currentStep(), this.state() === 'complete'),
  );

  /** Concepts the student has actually demonstrated, which is a different claim from "covered". */
  readonly shown = computed(
    () => new Set((this.standing() ?? []).filter((it) => it.mastered).map((it) => it.concept)),
  );

  /** Lines already in the key points, so the button can say so rather than fail on the press. */
  readonly kept = computed(
    () => new Set(this.keyPoints().map((note) => note.body.trim().toLowerCase())),
  );

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
        this.loadNotes();
        // The sidebar ticks concepts this student has already demonstrated, and it does that
        // from the first frame rather than from the first marked answer — a returning student
        // who has shown half the course should see that before they are taught anything.
        this.refreshStanding();
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

  /**
   * Adds what the tutor just said to this sitting's transcript.
   *
   * Silence is not a line. A turn with nothing spoken is the tutor moving the lesson on, and a
   * transcript full of empty rows is a transcript nobody reads.
   */
  private record(turn: TurnTaken): void {
    if (!turn.said.trim()) return;

    this.transcript.update((lines) => [
      ...lines,
      {
        id: lines.length,
        said: turn.said,
        conceptTitle: turn.conceptTitle,
        sourceRef: turn.sourceRef,
        at: new Date(),
      },
    ]);
  }

  private remember(note: StudyNoteView): void {
    // Replaced rather than appended. Keeping the same line twice hands back the one already
    // kept, so appending would put two copies of one note on the screen.
    this.notes.update((all) => [note, ...all.filter((it) => it.id !== note.id)]);
  }

  /**
   * Puts a rewritten note back where it was.
   *
   * Not `remember`, which moves what it is given to the front. The server orders these by when
   * they were kept and rewriting one does not change that, so a note that jumped to the top
   * every time a typo was fixed would be disagreeing with the order it comes back in.
   */
  private replace(note: StudyNoteView): void {
    this.notes.update((all) => all.map((it) => (it.id === note.id ? note : it)));
  }

  private loadNotes(): void {
    this.api.notes(this.courseId()).subscribe({
      next: (notes) => this.notes.set(notes),
      // Notes that will not load must not take the lesson down with them.
      error: () => this.notes.set([]),
    });
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

  /**
   * Asks the tutor to come at it another way.
   *
   * Sent as a turn rather than as a mode, because it is one: a student saying they did not
   * follow is the same kind of event as any other thing they say, and the tutor already knows
   * what to do with it. A separate "simplify" switch would be a second way into the reteach
   * path, and the reteach path nothing could reach is a bug this project has already shipped
   * once.
   */
  explainDifferently(): void {
    if (!this.started() || this.state() === 'complete') return;
    this.said('I did not follow that. Can you explain it a different way?');
  }

  /** Keeps a line of the tutor's. The words are the tutor's, so the citation goes with them. */
  keep(line: SpokenLine): void {
    this.noteError.set(null);

    this.api
      .keepNote(this.courseId(), {
        kind: 'KeyPoint',
        body: line.said,
        conceptTitle: line.conceptTitle || null,
        sessionId: this.sessionId,
        sourceRef: line.sourceRef || null,
      })
      .subscribe({
        next: (kept) => this.remember(kept),
        error: (failure: Error) => this.noteError.set(failure.message),
      });
  }

  addNote(): void {
    const body = this.noteDraft().trim();
    if (!body) return;

    this.noteError.set(null);

    this.api
      .keepNote(this.courseId(), {
        kind: 'Note',
        body,
        conceptTitle: this.session.conceptTitle() || null,
        sessionId: this.sessionId,
      })
      .subscribe({
        next: (kept) => {
          this.noteDraft.set('');
          this.remember(kept);
        },
        error: (failure: Error) => this.noteError.set(failure.message),
      });
  }

  /** Opens a note for rewriting, with what it currently says already in the box. */
  beginEdit(note: StudyNoteView): void {
    this.editing.set(note.id);
    this.editDraft.set(note.body);
    this.noteError.set(null);
  }

  cancelEdit(): void {
    this.editing.set(null);
    this.editDraft.set('');
  }

  saveEdit(note: StudyNoteView): void {
    const body = this.editDraft().trim();
    if (!body) return;

    this.api.editNote(note.id, body).subscribe({
      next: (saved) => {
        this.editing.set(null);
        this.editDraft.set('');
        this.replace(saved);
      },
      error: (failure: Error) => this.noteError.set(failure.message),
    });
  }

  removeNote(note: StudyNoteView): void {
    // Taken off the screen once the server has agreed, not before. A note that disappears and
    // then reappears on the next load is worse than one that took a moment to go.
    this.api.deleteNote(note.id).subscribe({
      next: () => this.notes.update((all) => all.filter((it) => it.id !== note.id)),
      error: (failure: Error) => this.noteError.set(failure.message),
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
        this.record(turn);

        // A marked answer moves the belief, so anything on screen is now wrong. The end of the
        // course is the one moment this is worth showing unasked.
        // The sidebar shows which concepts have actually been demonstrated, so the belief is
        // no longer a report nobody has opened — it is on screen from the first turn, and a
        // marked answer is exactly when it stops being true.
        if (turn.complete || turn.marked) this.refreshStanding();

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
