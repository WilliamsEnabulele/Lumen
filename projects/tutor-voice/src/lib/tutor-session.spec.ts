import { TurnTaken } from 'domain';
import { TutorSession } from './tutor-session';

function turn(said: string, drew: TurnTaken['drew'] = [], complete = false): TurnTaken {
  return {
    said,
    drew,
    conceptComplete: false,
    complete,
    lessonTitle: 'Loops',
    conceptTitle: 'Nesting',
    sourceRef: 'ch4:p63',
    tutor: 'anthropic:claude-opus-5',
  };
}

describe('TutorSession', () => {
  let session: TutorSession;

  beforeEach(() => {
    session = new TutorSession();
  });

  it('starts idle with nothing on the canvas', () => {
    expect(session.state()).toBe('idle');
    expect(session.canvas()).toBeNull();
  });

  it('draws what the turn drew, then speaks it', () => {
    session.beginTurn(turn('Nesting multiplies.', [{ tool: 'show_statement', text: 'Nesting multiplies' }]));

    expect(session.state()).toBe('teaching');
    expect(session.canvas()).toEqual({ tool: 'show_statement', text: 'Nesting multiplies' });
    expect(session.said()).toBe('Nesting multiplies.');
  });

  it('progress through the turn is what the canvas animates against', () => {
    session.beginTurn(turn('0123456789'));

    expect(session.progress()).toBe(0);
    session.noteProgress(5);
    expect(session.progress()).toBe(0.5);
  });

  it('a highlight moves the line on code already up', () => {
    session.beginTurn(turn('Look at the inner loop.', [
      { tool: 'show_code', language: 'python', source: 'a\nb\nc', highlightLine: 1 },
    ]));
    session.draw({ tool: 'highlight_code', line: 2 });

    expect(session.canvas()).toEqual({
      tool: 'show_code', language: 'python', source: 'a\nb\nc', highlightLine: 2,
    });
  });

  it('records exactly what the student heard before cutting in', () => {
    const text = 'A loop is a promise. The question is how often it is kept.';
    session.beginTurn(turn(text));
    session.noteProgress(30);

    session.bargeIn(30);

    expect(session.state()).toBe('listening');
    expect(session.heardSoFar()).toBe(text.slice(0, 30));
    expect(session.interruptions()).toBe(1);
  });

  it('resumes from a clause boundary rather than mid-word', () => {
    const text = 'A loop is a promise. The question is how often it is kept.';
    session.beginTurn(turn(text));
    session.bargeIn(text.indexOf('how often'));

    expect(session.resumeOffset()).toBe(text.indexOf('The question'));
  });

  it('a finished course ends the session rather than asking for another turn', () => {
    session.beginTurn(turn('That is the lot.', [], true));

    expect(session.state()).toBe('complete');
  });

  it('progress cannot run past the end of the turn', () => {
    session.beginTurn(turn('short'));
    session.noteProgress(9999);

    expect(session.spokenTo()).toBe('short'.length);
    expect(session.progress()).toBe(1);
  });
});
