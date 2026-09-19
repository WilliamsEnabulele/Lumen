import { CanvasCommand } from './canvas';

export type IngestionStage =
  | 'Received'
  | 'Extracting'
  | 'Structuring'
  | 'WritingScript'
  | 'Ready'
  | 'Failed';

export interface IngestionStatus {
  readonly documentId: string;
  readonly courseId: string;
  readonly stage: IngestionStage;
  readonly percent: number;
  /** Written for the student: what is happening, or why it stopped. */
  readonly message: string;
  readonly ready: boolean;
  readonly failed: boolean;
  readonly words?: number;
}

export interface PlannedConceptView {
  readonly title: string;
}

export interface PlannedLessonView {
  readonly title: string;
  readonly objective: string;
  readonly concepts: readonly string[];
}

export interface SessionStarted {
  readonly sessionId: string;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly summary: string;
  /** Which author produced this plan — a model, or the deterministic fallback. */
  readonly authoredBy: string;
  readonly lessonTitle: string | null;
  readonly conceptTitle: string | null;
  readonly lessons: readonly PlannedLessonView[];
}

/** What a check answer was worth, and what the lesson did about it. */
export interface MarkedAnswer {
  readonly verdict: 'Correct' | 'Partial' | 'Incorrect' | 'NoAnswer';
  /** Why the lesson did what it did next. Shown, because a mark nobody can query is a mark nobody trusts. */
  readonly reason: string;
}

/**
 * One turn of the conversation. Nothing is prepared in advance beyond the plan, so this is
 * everything the tutor decided to say and draw in response to this exact moment.
 */
export interface TurnTaken {
  readonly said: string;
  readonly drew: readonly CanvasCommand[];
  readonly conceptComplete: boolean;
  readonly complete: boolean;
  readonly lessonTitle: string;
  readonly conceptTitle: string;
  readonly sourceRef: string;
  /** Which brain answered. Names the degraded mode when no model is configured. */
  readonly tutor: string;

  /**
   * A question is hanging and the next thing the student says is an answer to it.
   *
   * The difference between waiting for someone and talking over their pause. Without this the
   * client asks a question and immediately carries on, which no teacher has ever done.
   */
  readonly awaitingAnswer: boolean;

  /** Set on the turn that follows an answer. Null on every other turn, which is most of them. */
  readonly marked: MarkedAnswer | null;

  /** Concepts walked past because this student already demonstrated them. */
  readonly skipped: readonly string[];

  /** A concept the lesson gave up on and moved past. Null unless that just happened. */
  readonly abandoned: string | null;
}
