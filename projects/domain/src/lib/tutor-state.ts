import { ResumePointer } from './resume-pointer';

export type TutorState =
  | 'idle'
  | 'loadingLesson'
  | 'teaching'
  | 'listening'
  | 'answering'
  | 'checkingUnderstanding'
  | 'adapting'
  | 'paused'
  | 'lessonComplete';

/**
 * A mirror of the backend's state machine, so the client never asks for a move the server
 * will refuse and then has to unwind. The server remains the authority — this exists to keep
 * the UI honest at barge-in speed, not to replace the check.
 */
const ALLOWED: Readonly<Record<TutorState, readonly TutorState[]>> = {
  idle: ['loadingLesson'],
  loadingLesson: ['teaching', 'paused', 'idle'],
  teaching: ['listening', 'checkingUnderstanding', 'lessonComplete', 'paused'],
  listening: ['answering', 'teaching', 'checkingUnderstanding', 'paused'],
  answering: ['teaching', 'listening', 'paused'],
  checkingUnderstanding: ['adapting', 'teaching', 'listening', 'paused'],
  adapting: ['teaching', 'paused'],
  paused: ['teaching', 'loadingLesson', 'idle'],
  lessonComplete: ['loadingLesson', 'idle'],
};

/** States from which arriving at `teaching` is a resumption rather than a start. */
const RESUMES_TEACHING: readonly TutorState[] = [
  'listening',
  'answering',
  'checkingUnderstanding',
  'adapting',
  'paused',
];

export function canTransition(from: TutorState, to: TutorState): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * Returns null when the transition is permitted, or the reason it is refused. A non-null
 * result is a hard stop.
 */
export function validateTransition(
  from: TutorState,
  to: TutorState,
  pointer: ResumePointer | null,
): string | null {
  if (!canTransition(from, to)) {
    return `Cannot move a tutor session from ${from} to ${to}.`;
  }

  if (to === 'teaching' && RESUMES_TEACHING.includes(from) && pointer === null) {
    return `Cannot resume teaching from ${from} without a resume pointer. Resumption is restored from the pointer, never inferred from the conversation.`;
  }

  if (from === 'teaching' && (to === 'listening' || to === 'paused') && pointer === null) {
    return `Cannot leave teaching for ${to} without capturing a resume pointer first.`;
  }

  return null;
}
