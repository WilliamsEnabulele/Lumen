/**
 * Where to re-enter an utterance that was interrupted part-way through.
 *
 * This is a deliberate second implementation of a rule the backend also holds. It is
 * duplicated rather than fetched because the decision has to happen inside the barge-in
 * budget, and a round trip to ask the server where to resume spends that budget before
 * anything has been decided. The two implementations are kept honest by having the same
 * tests on both sides.
 *
 * Resuming at the exact character the tutor stopped on is precise and sounds wrong: you land
 * mid-clause, on a fragment, and it reads as a stutter rather than a teacher picking the
 * thread back up. So the pointer stores the exact offset, and this decides where to speak.
 */
export const DEFAULT_MAX_REWIND = 180;

export function snapBack(text: string, offset: number, maxRewind = DEFAULT_MAX_REWIND): number {
  if (!text || offset <= 0) return 0;

  const cursor = Math.min(offset, text.length);
  const floor = Math.max(0, cursor - maxRewind);

  // The start of the sentence we are inside, if it is within reach.
  const strong = findBreak(text, cursor, floor, isStrongBreak);
  if (strong >= 0) return Math.min(skipLeadingSpace(text, strong + 1), cursor);

  // Failing that, the start of the clause.
  const weak = findBreak(text, cursor, floor, isWeakBreak);
  if (weak >= 0) return Math.min(skipLeadingSpace(text, weak + 1), cursor);

  // Nothing to rewind to, so at the very least do not resume half-way through a word.
  return startOfWord(text, cursor);
}

function isStrongBreak(ch: string): boolean {
  return ch === '.' || ch === '!' || ch === '?';
}

function isWeakBreak(ch: string): boolean {
  return ch === ',' || ch === ';' || ch === ':' || ch === '—';
}

function findBreak(
  text: string,
  cursor: number,
  floor: number,
  predicate: (ch: string) => boolean,
): number {
  for (let i = cursor - 1; i >= floor; i--) {
    if (predicate(text[i])) return i;
  }
  return -1;
}

function skipLeadingSpace(text: string, index: number): number {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

function startOfWord(text: string, cursor: number): number {
  let i = cursor;
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return i;
}
