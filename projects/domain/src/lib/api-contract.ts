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
}
