/** One answer, and what it was worth. The trail behind a belief. */
export interface MasteryEvidenceView {
  readonly at: string;
  readonly verdict: 'Correct' | 'Partial' | 'Incorrect' | 'NoAnswer';
  readonly question: string;
  readonly answer: string;
  /** What the student appeared to believe instead, when that was legible. */
  readonly misconception: string | null;
  /** Where the estimate landed after this answer, so the trail explains itself. */
  readonly belief: number;
}

/** What the server believes about one concept, and why. */
export interface ConceptProgress {
  readonly concept: string;
  /** 0 to 1. A belief, not a score — see `standing`. */
  readonly belief: number;
  readonly mastered: boolean;
  readonly reteaches: number;
  /** The lesson gave up and carried on. Shown, never hidden. */
  readonly movedOnUnmastered: boolean;
  readonly evidence: readonly MasteryEvidenceView[];
}

export type StandingTone = 'shown' | 'partial' | 'shaky' | 'flagged' | 'unknown';

export interface ConceptStanding {
  readonly label: string;
  readonly tone: StandingTone;
  /** One line a student can act on, rather than a number they have to interpret. */
  readonly detail: string;
}

/**
 * Turns a belief into something a student can read.
 *
 * Deliberately not a percentage with a label stuck on it. The number decides whether someone
 * is taught a concept again, and showing it as "87%" invites it to be read as a grade — which
 * it is not, and arguing with it as though it were is the wrong argument. It is an estimate
 * from a handful of spoken answers, and it should sound like one.
 *
 * A concept the lesson gave up on wins over everything else, because it is the one a student
 * most needs to see and the one a progress screen is most tempted to bury.
 */
export function standing(progress: ConceptProgress): ConceptStanding {
  if (progress.movedOnUnmastered) {
    return {
      label: 'Moved on without it',
      tone: 'flagged',
      detail:
        progress.reteaches > 0
          ? `Explained again ${progress.reteaches} ${progress.reteaches === 1 ? 'time' : 'times'} and it did not land. Worth coming back to.`
          : 'The lesson carried on without this one. Worth coming back to.',
    };
  }

  if (progress.evidence.length === 0) {
    return {
      label: 'Not yet shown',
      tone: 'unknown',
      detail: 'Nothing has been asked about this one yet.',
    };
  }

  const answers = `${progress.evidence.length} ${progress.evidence.length === 1 ? 'answer' : 'answers'}`;

  if (progress.mastered) {
    return { label: 'Shown', tone: 'shown', detail: `Demonstrated over ${answers}.` };
  }

  return progress.belief >= 0.6
    ? { label: 'Getting there', tone: 'partial', detail: `Close, on ${answers} so far.` }
    : { label: 'Still shaky', tone: 'shaky', detail: `Not there yet, on ${answers} so far.` };
}

/** Concepts the lesson gave up on, first. They are the ones worth acting on. */
export function worthRevisiting(progress: readonly ConceptProgress[]): readonly ConceptProgress[] {
  return progress.filter((record) => record.movedOnUnmastered || (!record.mastered && record.evidence.length > 0));
}
