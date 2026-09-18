import { ResumePointer } from './resume-pointer';
import { TutorState, validateTransition } from './tutor-state';

const somewhere: ResumePointer = {
  lessonId: 'les_loops_01',
  scriptNodeId: 'n07',
  utteranceOffset: 42,
  canvasState: 'codeplayground:loops-nested',
};

describe('validateTransition', () => {
  const resuming: TutorState[] = ['listening', 'answering', 'checkingUnderstanding', 'adapting', 'paused'];

  resuming.forEach((from) => {
    it(`refuses to resume teaching from ${from} without a pointer`, () => {
      expect(validateTransition(from, 'teaching', null)).toContain('resume pointer');
    });
  });

  it('resumes teaching when the pointer is there', () => {
    expect(validateTransition('listening', 'teaching', somewhere)).toBeNull();
  });

  it('refuses to leave teaching without capturing where we were', () => {
    expect(validateTransition('teaching', 'listening', null)).toContain('capturing a resume pointer');
  });

  it('starts a first lesson without needing a pointer', () => {
    expect(validateTransition('loadingLesson', 'teaching', null)).toBeNull();
  });

  it('refuses transitions that are not in the machine', () => {
    expect(validateTransition('idle', 'teaching', somewhere)).toContain('Cannot move');
    expect(validateTransition('teaching', 'adapting', somewhere)).toContain('Cannot move');
  });
});
