import { throughPlan } from './progress';

describe('throughPlan', () => {
  it('is empty before the first concept is opened', () => {
    expect(throughPlan(5, -1, false)).toBe(0);
    expect(throughPlan(5, 0, false)).toBe(0);
  });

  it('counts what is behind, not what is open', () => {
    // On the third of five, two are done. Counting the open one would show a lesson as
    // finished the moment its last concept was reached.
    expect(throughPlan(5, 2, false)).toBe(40);
    expect(throughPlan(5, 4, false)).toBe(80);
  });

  it('only a finished course reads a hundred', () => {
    expect(throughPlan(5, 4, true)).toBe(100);
    expect(throughPlan(5, 4, false)).not.toBe(100);
  });

  it('a plan with no concepts is not a division by zero', () => {
    expect(throughPlan(0, -1, false)).toBe(0);
    expect(throughPlan(0, 3, false)).toBe(0);
  });

  it('an index beyond the plan does not exceed it', () => {
    expect(throughPlan(4, 99, false)).toBe(100);
  });
});
