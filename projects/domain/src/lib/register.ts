/**
 * How far the tutor may move from standard English toward the student's own register.
 *
 * Per-student, defaulting to the conservative end, because register preference is not
 * uniform: the same interjection that reads as warmth to one student reads as a machine
 * being unserious about their education to another.
 */
export type RegisterLevel = 'standardEnglish' | 'lightInterjection' | 'comfortableCodeSwitch';

export const REGISTER_LADDER: readonly RegisterLevel[] = [
  'standardEnglish',
  'lightInterjection',
  'comfortableCodeSwitch',
];

/** Consecutive code-switches by the student before the tutor moves up a level. */
export const EVIDENCE_TO_RISE = 2;

/**
 * The student's register pulls the tutor's, never the other way round. Rising takes repeated
 * evidence; falling takes one signal — a student who asks to be spoken to plainly is owed
 * that immediately, while one stray word is not an invitation.
 */
export function observedRegister(
  current: RegisterLevel,
  consecutiveStudentCodeSwitches: number,
): RegisterLevel {
  if (consecutiveStudentCodeSwitches < EVIDENCE_TO_RISE) return current;
  const at = REGISTER_LADDER.indexOf(current);
  return REGISTER_LADDER[Math.min(at + 1, REGISTER_LADDER.length - 1)];
}

export function requestedPlain(): RegisterLevel {
  return 'standardEnglish';
}
