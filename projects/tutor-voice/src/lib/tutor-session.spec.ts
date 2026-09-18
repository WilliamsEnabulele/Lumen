import { LessonScript, ScriptNode, toLessonScript } from 'domain';
import { TutorSession } from './tutor-session';

function node(id: string, ordinal: number, text: string, visualRef?: string): ScriptNode {
  return {
    id,
    lessonId: 'les_loops_01',
    ordinal,
    kind: visualRef ? 'codeplayground' : 'speech',
    conceptKey: 'nesting',
    text,
    pauseAfterMs: 300,
    visualRef,
    carriesDefinition: false,
    interjectionSlots: [],
  };
}

function lesson(): LessonScript {
  return toLessonScript('les_loops_01', [
    node('n01', 1, 'A loop is a promise. The question is how many times it is kept.'),
    node('n02', 2, 'Ten outer turns, ten inner turns on each one.', 'loops-nested'),
    node('n03', 3, 'So the counts do not add. They multiply.'),
  ]);
}

describe('TutorSession', () => {
  let session: TutorSession;

  beforeEach(() => {
    session = new TutorSession();
    session.loadLesson(lesson());
  });

  it('loads a lesson pointing at its first node', () => {
    expect(session.state()).toBe('loadingLesson');
    expect(session.pointer()?.scriptNodeId).toBe('n01');
    expect(session.pointer()?.utteranceOffset).toBe(0);
  });

  it('will not teach before a lesson is loaded', () => {
    expect(() => new TutorSession().beginTeaching()).toThrowError(/Cannot move/);
  });

  it('holds the exact offset when the student cuts in, then resumes from a clause boundary', () => {
    session.beginTeaching();
    const text = session.currentNode()!.text;
    const cutOff = text.indexOf('how many');

    const held = session.bargeIn(cutOff);
    expect(session.state()).toBe('listening');
    expect(held.utteranceOffset).toBe(cutOff);

    session.startAnswering();
    const instruction = session.resume();

    expect(session.state()).toBe('teaching');
    // The pointer keeps the truth; the resume rewinds to the start of the sentence.
    expect(session.pointer()!.utteranceOffset).toBe(cutOff);
    expect(instruction.speakFrom).toBe(text.indexOf('The question'));
  });

  it('restores the canvas as well as the speech', () => {
    session.beginTeaching();
    session.nodeComplete();
    session.progress(10);

    session.bargeIn(10);
    const instruction = session.resume();

    expect(instruction.canvasState).toBe('codeplayground:loops-nested');
  });

  it('counts interruptions, because whether the student tries again is the result', () => {
    session.beginTeaching();
    session.bargeIn(5);
    session.resume();
    session.bargeIn(7);
    session.resume();

    expect(session.interruptions()).toBe(2);
    expect(session.midUtteranceResumes()).toBe(2);
  });

  it('treats a cough as a false positive and resumes rather than answering it', () => {
    session.beginTeaching();
    session.bargeIn(12);

    const instruction = session.falsePositive();

    expect(session.falsePositives()).toBe(1);
    expect(session.state()).toBe('teaching');
    expect(instruction.node.id).toBe('n01');
  });

  it('advances node by node and then finishes', () => {
    session.beginTeaching();
    expect(session.nodeComplete()?.id).toBe('n02');
    expect(session.nodeComplete()?.id).toBe('n03');
    expect(session.nodeComplete()).toBeNull();
    expect(session.state()).toBe('lessonComplete');
  });

  it('survives a pause and comes back to the same place', () => {
    session.beginTeaching();
    session.progress(18);
    const saved = session.pause();

    expect(session.state()).toBe('paused');

    const elsewhere = new TutorSession();
    elsewhere.restore(lesson(), saved);
    const instruction = elsewhere.resume();

    expect(elsewhere.state()).toBe('teaching');
    expect(elsewhere.pointer()!.utteranceOffset).toBe(18);
    expect(instruction.node.id).toBe('n01');
  });

  it('reteaches from an earlier node when a check is failed', () => {
    session.beginTeaching();
    session.nodeComplete();
    session.nodeComplete();
    session.askCheck();

    const reteach = session.adapt('n01');

    expect(reteach.id).toBe('n01');
    expect(session.state()).toBe('teaching');
    expect(session.pointer()!.scriptNodeId).toBe('n01');
    expect(session.pointer()!.utteranceOffset).toBe(0);
  });

  it('refuses to reteach from a node that is not in the script', () => {
    session.beginTeaching();
    session.askCheck();
    expect(() => session.adapt('nope')).toThrowError(/unknown node/);
  });
});
