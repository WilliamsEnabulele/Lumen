import { ConceptProgress, MasteryEvidenceView, standing, worthRevisiting } from './progress';

function evidence(verdict: MasteryEvidenceView['verdict'] = 'Correct'): MasteryEvidenceView {
  return {
    at: '2026-09-19T10:00:00Z',
    verdict,
    question: 'How many times does the body run?',
    answer: 'five',
    misconception: verdict === 'Incorrect' ? 'counting the stopping value' : null,
    belief: 0.7,
  };
}

function progress(over: Partial<ConceptProgress> = {}): ConceptProgress {
  return {
    concept: 'Counted loops',
    belief: 0.25,
    mastered: false,
    reteaches: 0,
    movedOnUnmastered: false,
    evidence: [],
    ...over,
  };
}

describe('standing', () => {
  it('says plainly when a concept has been demonstrated', () => {
    const shown = standing(progress({ mastered: true, belief: 0.91, evidence: [evidence(), evidence()] }));

    expect(shown.tone).toBe('shown');
    expect(shown.detail).toContain('2 answers');
  });

  it('counts a single answer in the singular', () => {
    expect(standing(progress({ mastered: true, evidence: [evidence()] })).detail).toContain('1 answer');
  });

  it('separates close from not close, because they need different things next', () => {
    expect(standing(progress({ belief: 0.7, evidence: [evidence('Partial')] })).tone).toBe('partial');
    expect(standing(progress({ belief: 0.2, evidence: [evidence('Incorrect')] })).tone).toBe('shaky');
  });

  it('a concept nobody was asked about is unknown, not failed', () => {
    // The distinction the whole design rests on: silence is not evidence, so a concept with
    // no answers behind it must never read as one the student got wrong.
    const untouched = standing(progress());

    expect(untouched.tone).toBe('unknown');
    expect(untouched.label).toBe('Not yet shown');
  });

  it('a concept the lesson gave up on is never buried', () => {
    const flagged = standing(progress({
      movedOnUnmastered: true,
      reteaches: 2,
      evidence: [evidence('Incorrect'), evidence('Incorrect')],
    }));

    expect(flagged.tone).toBe('flagged');
    expect(flagged.detail).toContain('2 times');
  });

  it('being given up on outranks every other reading of the same record', () => {
    // A record can be mastered-looking and still have been abandoned earlier. The abandonment
    // is the thing a student needs to see.
    expect(standing(progress({ movedOnUnmastered: true, mastered: true, evidence: [evidence()] })).tone)
      .toBe('flagged');
  });
});

describe('worthRevisiting', () => {
  it('keeps what was never shown and what was abandoned', () => {
    const records = [
      progress({ concept: 'Shown', mastered: true, evidence: [evidence()] }),
      progress({ concept: 'Shaky', evidence: [evidence('Incorrect')] }),
      progress({ concept: 'Abandoned', movedOnUnmastered: true }),
      progress({ concept: 'Untouched' }),
    ];

    expect(worthRevisiting(records).map((record) => record.concept)).toEqual(['Shaky', 'Abandoned']);
  });
});
