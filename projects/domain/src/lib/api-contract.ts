import { ScriptNode } from './script-node';

/**
 * The shape of what the backend sends. Kept beside the domain types rather than in the app,
 * because the tutor library reads it too and a contract that lives in one consumer drifts.
 */
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

export interface LessonSummary {
  readonly id: string;
  readonly title: string;
  readonly ordinal: number;
  readonly nodeCount: number;
}

export interface CourseSummary {
  readonly id: string;
  readonly title: string;
  readonly lessons: readonly LessonSummary[];
}

export interface LessonScriptResponse {
  readonly lessonId: string;
  readonly courseId: string;
  readonly title: string;
  readonly nodes: readonly ScriptNode[];
}

export interface GroundedAnswer {
  readonly text: string;
  /** The script node the answer came from, or null when the lesson does not cover it. */
  readonly sourceNodeId: string | null;
  readonly sourceRef: string | null;
  readonly inScope: boolean;
}
