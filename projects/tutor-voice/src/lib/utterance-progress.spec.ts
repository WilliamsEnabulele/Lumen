import { UtteranceProgress } from './utterance-progress';

describe('UtteranceProgress', () => {
  const text = 'Every turn of the outer loop runs the whole inner one.';

  it('takes a boundary event as the truth', () => {
    const progress = new UtteranceProgress(text);
    expect(progress.onBoundary(11)).toBe(11);
    expect(progress.usingEstimate).toBeFalse();
  });

  it('estimates from elapsed time while no boundary has arrived', () => {
    const progress = new UtteranceProgress(text);
    expect(progress.onElapsed(1000)).toBe(14);
    expect(progress.usingEstimate).toBeTrue();
  });

  it('stops estimating once the engine has told us where it is', () => {
    const progress = new UtteranceProgress(text);
    progress.onBoundary(30);
    expect(progress.onElapsed(10_000)).toBe(30);
  });

  it('never rewinds on a late or out-of-order event', () => {
    const progress = new UtteranceProgress(text);
    progress.onBoundary(30);
    expect(progress.onBoundary(12)).toBe(30);
  });

  it('cannot run past the end of the utterance', () => {
    const progress = new UtteranceProgress(text);
    expect(progress.onBoundary(9999)).toBe(text.length);
  });

  it('resumes from where it was told to start, not from zero', () => {
    const progress = new UtteranceProgress(text, 20);
    expect(progress.current).toBe(20);
    expect(progress.onBoundary(5)).toBe(25);
  });

  it('is complete when the utterance ends', () => {
    const progress = new UtteranceProgress(text);
    expect(progress.complete()).toBe(text.length);
  });

  it('scales the estimate with the speaking rate', () => {
    const progress = new UtteranceProgress(text);
    expect(progress.onElapsed(1000, 2)).toBe(28);
  });
});
