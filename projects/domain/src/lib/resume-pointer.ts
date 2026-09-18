import { ScriptNode } from './script-node';

export const NO_CANVAS = 'none';

/**
 * Where teaching picks back up. Three-dimensional on purpose: restoring the speech but not
 * the canvas is still a wrong resume — the student gets the right words in front of the
 * wrong picture.
 *
 * The client holds this because the client is what decides to stop (see BargeInDetector);
 * the server holds the authoritative copy because the student may come back tomorrow on a
 * different device. Both use the same shape.
 */
export interface ResumePointer {
  readonly lessonId: string;
  readonly scriptNodeId: string;
  /** Exact character the tutor was cut off on — the truth about what was heard. */
  readonly utteranceOffset: number;
  readonly canvasState: string;
}

export function canvasStateOf(node: ScriptNode): string {
  return node.visualRef ? `${node.kind}:${node.visualRef}` : NO_CANVAS;
}

export function pointerAtStartOf(lessonId: string, node: ScriptNode): ResumePointer {
  return {
    lessonId,
    scriptNodeId: node.id,
    utteranceOffset: 0,
    canvasState: canvasStateOf(node),
  };
}

/**
 * Records exactly where the tutor was cut off. Where to *start speaking* again is a separate
 * judgement and belongs to `snapBack` — see utterance-boundary.
 */
export function heldAt(pointer: ResumePointer, utteranceOffset: number): ResumePointer {
  if (utteranceOffset < 0) {
    throw new RangeError('A resume offset cannot be negative.');
  }
  return { ...pointer, utteranceOffset };
}

export function isMidUtterance(pointer: ResumePointer): boolean {
  return pointer.utteranceOffset > 0;
}
