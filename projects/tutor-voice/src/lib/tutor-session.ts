import { Injectable, computed, signal } from '@angular/core';
import { Canvas, CanvasCommand, MarkedAnswer, TurnTaken, applyToCanvas, snapBack } from 'domain';

export type TutorState = 'idle' | 'thinking' | 'teaching' | 'listening' | 'complete';

/**
 * The client half of a teaching conversation.
 *
 * The server holds the position in the plan and the transcript; this holds what is happening
 * in the room right now — which turn is being spoken, how far through it we are, what is on
 * the canvas, and where the student cut in.
 *
 * Progress through the current turn is the number everything else keys off. The canvas
 * animates against it, so the words and the picture cannot drift apart, and a turn that gets
 * interrupted resumes with its illustration at the frame it left.
 */
@Injectable({ providedIn: 'root' })
export class TutorSession {
  private readonly _state = signal<TutorState>('idle');
  private readonly _said = signal('');
  private readonly _spokenTo = signal(0);
  private readonly _canvas = signal<Canvas>(null);
  private readonly _heardUpTo = signal(0);
  private readonly _awaitingAnswer = signal(false);

  readonly state = this._state.asReadonly();
  /** The turn currently being spoken. */
  readonly said = this._said.asReadonly();
  readonly spokenTo = this._spokenTo.asReadonly();
  readonly canvas = this._canvas.asReadonly();

  /**
   * A question is hanging. Everything about how this turn ends changes on it: the tutor stops
   * rather than rolling into the next explanation, and what the student says next is an answer
   * rather than an interruption.
   */
  readonly awaitingAnswer = this._awaitingAnswer.asReadonly();

  /** How the last answer was marked. Null on the turns where nothing was asked. */
  readonly marked = signal<MarkedAnswer | null>(null);

  /** Concepts the lesson moved past without teaching them here, and why. Never silent. */
  readonly movedOn = signal<readonly string[]>([]);

  readonly lessonTitle = signal('');
  readonly conceptTitle = signal('');
  readonly sourceRef = signal('');
  readonly tutorName = signal('');

  /** Instrumentation. Whether the student interrupts a second time is still the result. */
  readonly interruptions = signal(0);

  readonly spokenText = computed(() => this._said().slice(0, this._spokenTo()));
  readonly pendingText = computed(() => this._said().slice(this._spokenTo()));

  /** 0 to 1 through the current turn. What the canvas animates against. */
  readonly progress = computed(() => {
    const text = this._said();
    return text.length === 0 ? 0 : Math.min(1, this._spokenTo() / text.length);
  });

  moveTo(state: TutorState): void {
    this._state.set(state);
  }

  /** A turn came back from the tutor. Draw what it drew, then start speaking it. */
  beginTurn(turn: TurnTaken): void {
    this.lessonTitle.set(turn.lessonTitle);
    this.conceptTitle.set(turn.conceptTitle);
    this.sourceRef.set(turn.sourceRef);
    this.tutorName.set(turn.tutor);

    for (const command of turn.drew) this.draw(command);

    this.marked.set(turn.marked ?? null);
    this.movedOn.set([
      ...(turn.skipped ?? []).map((title) => `Skipped ${title} — you have already shown me that one`),
      ...(turn.abandoned ? [`Moved on from ${turn.abandoned} for now`] : []),
    ]);

    this._said.set(turn.said);
    this._spokenTo.set(0);
    this._heardUpTo.set(0);
    this._awaitingAnswer.set(turn.awaitingAnswer === true);
    this._state.set(turn.complete ? 'complete' : 'teaching');
  }

  draw(command: CanvasCommand): void {
    this._canvas.update((canvas) => applyToCanvas(canvas, command));
  }

  noteProgress(offset: number): void {
    this._spokenTo.set(Math.max(0, Math.min(offset, this._said().length)));
  }

  /**
   * The student cut in. Record exactly where — that is the truth about what they heard, and it
   * is what the transcript needs so the tutor is not credited with words nobody listened to.
   */
  bargeIn(offset: number): void {
    this._heardUpTo.set(offset);
    this._spokenTo.set(offset);
    this._state.set('listening');
    this.interruptions.update((n) => n + 1);
  }

  /** Everything the student actually heard of the current turn. */
  heardSoFar(): string {
    return this._said().slice(0, this._heardUpTo() || this._spokenTo());
  }

  /**
   * Where to start speaking again after a false alarm. Snapped back to a clause, because
   * re-entering on the exact character sounds like a stutter rather than a teacher picking the
   * thread back up.
   */
  resumeOffset(): number {
    return snapBack(this._said(), this._heardUpTo() || this._spokenTo());
  }

  reset(): void {
    this._state.set('idle');
    this._said.set('');
    this._spokenTo.set(0);
    this._heardUpTo.set(0);
    this._canvas.set(null);
    this._awaitingAnswer.set(false);
    this.marked.set(null);
    this.movedOn.set([]);
    this.interruptions.set(0);
  }
}
