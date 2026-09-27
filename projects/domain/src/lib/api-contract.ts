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

/** A thing that can be bought. Price is formatted by the server; the client never computes it. */
export interface PlanView {
  readonly code: string;
  readonly name: string;
  /** Naira, two decimal places, as a string — never a float to be re-rounded here. */
  readonly price: string;
  readonly currency: string;
  readonly days: number;
}

export interface StartedPayment {
  readonly reference: string;
  /** Where to send the student. The provider's page, not ours. */
  readonly checkoutUrl: string;
}

export type PaymentState = 'Pending' | 'Paid' | 'Failed' | 'Underpaid';

export interface PaymentView {
  readonly reference: string;
  readonly status: PaymentState;
  readonly plan: string;
  readonly amount: string;
  readonly paid: string | null;
  readonly outcome: string | null;
}

/** What this student is allowed to do right now. */
export interface EntitlementView {
  readonly active: boolean;
  readonly plan: string | null;
  readonly expiresAt: string | null;
  /** False on a server taking no money, where everything is open. */
  readonly enforced: boolean;
  readonly freeUploadsLeft: number;
  readonly freeAllowanceResetsAt: string;
}

/** One of this student's courses, as the library lists them. */
export interface CourseSummaryView {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly authoredBy: string;
  readonly createdAt: string;
}

/**
 * The two things a student can keep, which are not the same thing.
 *
 * A `KeyPoint` is a line the tutor said. The words are the tutor's, so it carries a source
 * reference and cannot be edited. A `Note` is the student's own, and is theirs to rewrite.
 */
export type NoteKind = 'KeyPoint' | 'Note';

export interface StudyNoteView {
  readonly id: string;
  readonly kind: NoteKind;
  readonly body: string;
  /** What was being taught when it was kept, so a list of them reads as a lesson. */
  readonly conceptTitle: string | null;
  readonly sessionId: string | null;
  /** Where in the material the tutor got it. Null for a student's own note. */
  readonly sourceRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What the client sends to keep something. */
export interface KeepNote {
  readonly kind: NoteKind;
  readonly body: string;
  readonly conceptTitle?: string | null;
  readonly sessionId?: string | null;
  readonly sourceRef?: string | null;
}

/**
 * A lesson left part-way through.
 *
 * Position is counted the same way the lesson view counts it — concepts behind the open one —
 * so the home screen and the lesson cannot disagree about how far through somebody is.
 */
export interface OpenLessonView {
  readonly sessionId: string;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly conceptTitle: string | null;
  readonly conceptsBehind: number;
  readonly conceptsTotal: number;
  readonly lastTaughtAt: string;
}

/** One concept the server believes something about, summarised across every course. */
export interface ShownConceptView {
  readonly concept: string;
  readonly courseId: string;
  readonly belief: number;
  readonly mastered: boolean;
  readonly reteaches: number;
  readonly movedOnUnmastered: boolean;
  /** How many answers the belief was built from. The trail itself stays on the lesson view. */
  readonly answers: number;
}

/**
 * Turning up, counted.
 *
 * The one figure in this product rendered as a figure, and only because of what it measures:
 * attendance is a plain fact about a day, where a belief about what somebody knows is an
 * estimate they can argue with. `days` are ISO dates, for drawing the week rather than
 * describing it.
 */
export interface StreakView {
  readonly current: number;
  readonly longest: number;
  readonly thisWeek: number;
  readonly goal: number;
  readonly goalMet: boolean;
  readonly days: readonly string[];
}

/** Who is signed in, as the server describes them. */
export interface SignedInStudent {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/**
 * What signing in, signing up and refreshing all return.
 *
 * The access token is here, in the body, because the client has to put it in a header. The
 * refresh token is not: it travels in an HttpOnly cookie the page cannot read, which is the
 * whole point of it being the long-lived half.
 */
export interface Authenticated extends SignedInStudent {
  readonly accessToken: string;
  readonly expiresAt: string;
}
