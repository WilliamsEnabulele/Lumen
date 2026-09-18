import { snapBack } from './utterance-boundary';

/**
 * The same cases the backend's UtteranceBoundaryTests assert. Two implementations of one
 * rule stay honest only if they are held to the same tests.
 */
describe('snapBack', () => {
  it('resumes from the start of the sentence it was cut off in', () => {
    const text = 'A loop is a promise. The interesting question is how many times it is kept.';
    expect(snapBack(text, text.indexOf('how many'))).toBe(text.indexOf('The interesting'));
  });

  it('falls back to the start of the clause when there is no sentence break', () => {
    const text = 'Ten outer turns, ten inner turns on each one';
    expect(snapBack(text, text.indexOf('on each'))).toBe(text.indexOf('ten inner'));
  });

  it('never resumes half way through a word', () => {
    expect(snapBack('hello world', 8)).toBe('hello world'.indexOf('world'));
  });

  it('will not rewind further than the limit', () => {
    const tail = new Array(60).fill('word').join(' ');
    const text = `Start of a long stretch. ${tail}`;
    expect(snapBack(text, text.length)).toBe(text.lastIndexOf('word'));
  });

  it('has nothing to rewind when nothing was spoken', () => {
    expect(snapBack('A loop is a promise.', 0)).toBe(0);
    expect(snapBack('A loop is a promise.', -5)).toBe(0);
  });

  it('clamps an offset past the end rather than throwing', () => {
    const text = 'A loop is a promise. The question is how often.';
    expect(snapBack(text, text.length + 500)).toBe(snapBack(text, text.length));
  });

  it('resumes at zero for an empty utterance', () => {
    expect(snapBack('', 10)).toBe(0);
  });

  it('never returns a position past where the student cut in', () => {
    const text = 'One. Two. Three. Four.';
    for (let offset = 0; offset <= text.length; offset++) {
      expect(snapBack(text, offset)).toBeLessThanOrEqual(offset);
    }
  });
});
