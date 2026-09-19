import { canvasStateOf, heldAt, isMidUtterance, NO_CANVAS, pointerAtStartOf } from './resume-pointer';
import { ScriptNode } from './script-node';

function nodeWithCode(): ScriptNode {
  return {
    id: 'n11',
    lessonId: 'les_loops_01',
    ordinal: 11,
    kind: 'codeplayground',
    conceptKey: 'nesting',
    text: 'This is that same shape, wearing a business suit.',
    pauseAfterMs: 400,
    visualRef: 'loops-nested',
    carriesDefinition: false,
    visualKind: 'Code',
    interjectionSlots: [],
  };
}

describe('ResumePointer', () => {
  it('starts at the beginning of a fresh node', () => {
    const pointer = pointerAtStartOf('les_loops_01', nodeWithCode());
    expect(pointer.utteranceOffset).toBe(0);
    expect(isMidUtterance(pointer)).toBeFalse();
  });

  it('carries the canvas, not just the speech', () => {
    expect(pointerAtStartOf('les_loops_01', nodeWithCode()).canvasState).toBe('codeplayground:loops-nested');
  });

  it('says so explicitly when nothing is on screen', () => {
    const bare: ScriptNode = { ...nodeWithCode(), kind: 'speech', visualRef: undefined };
    expect(canvasStateOf(bare)).toBe(NO_CANVAS);
  });

  it('records exactly where the tutor was cut off', () => {
    const pointer = heldAt(pointerAtStartOf('les_loops_01', nodeWithCode()), 31);
    expect(pointer.utteranceOffset).toBe(31);
    expect(isMidUtterance(pointer)).toBeTrue();
  });

  it('refuses a negative offset', () => {
    expect(() => heldAt(pointerAtStartOf('les_loops_01', nodeWithCode()), -1)).toThrowError(RangeError);
  });
});
