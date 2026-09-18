/**
 * The lesson script, as the client sees it.
 *
 * Kind strings are the backend enum names lowercased, not a separate client vocabulary.
 * They travel inside `canvasState` on the resume pointer, which is persisted server-side and
 * read back on another device — so the two halves have to agree on the spelling or a
 * cross-device resume restores a canvas nobody can find.
 */
export type ScriptNodeKind =
  | 'speech'
  | 'visual'
  | 'checkforunderstanding'
  | 'simulation'
  | 'codeplayground';

export type SlotPosition = 'before' | 'after';

export type InterjectionFunction =
  | 'encouragement'
  | 'surprise'
  | 'correctionsoftener'
  | 'emphasis'
  | 'transition'
  | 'sharedknowledge';

/** A position where an interjection may go — never the interjection itself. */
export interface InterjectionSlot {
  readonly position: SlotPosition;
  readonly function: InterjectionFunction;
}

export interface ScriptNode {
  readonly id: string;
  readonly lessonId: string;
  readonly ordinal: number;
  readonly kind: ScriptNodeKind;
  readonly conceptKey: string;
  /** What is spoken, and what the resume offset indexes into. */
  readonly text: string;
  readonly ssml?: string;
  readonly pauseAfterMs: number;
  readonly visualRef?: string;
  readonly sourceRef?: string;
  readonly carriesDefinition: boolean;
  readonly interjectionSlots: readonly InterjectionSlot[];
  /** Pre-synthesised audio, rendered once at publish time. Absent means fall back to live TTS. */
  readonly audioKey?: string;
}

export interface LessonScript {
  readonly lessonId: string;
  readonly nodes: readonly ScriptNode[];
}

/** Ordering happens once, here — never by however the rows came back. */
export function toLessonScript(lessonId: string, nodes: readonly ScriptNode[]): LessonScript {
  if (nodes.length === 0) {
    throw new Error('A lesson script with no nodes cannot be taught.');
  }
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) {
      throw new Error(`Script node ${node.id} appears twice; the resume pointer would be ambiguous.`);
    }
    seen.add(node.id);
  }
  return { lessonId, nodes: [...nodes].sort((a, b) => a.ordinal - b.ordinal) };
}

export function findNode(script: LessonScript, scriptNodeId: string): ScriptNode | null {
  return script.nodes.find((node) => node.id === scriptNodeId) ?? null;
}

export function nextNode(script: LessonScript, scriptNodeId: string): ScriptNode | null {
  const at = script.nodes.findIndex((node) => node.id === scriptNodeId);
  if (at < 0) return null;
  return script.nodes[at + 1] ?? null;
}

export function isLastNode(script: LessonScript, scriptNodeId: string): boolean {
  const at = script.nodes.findIndex((node) => node.id === scriptNodeId);
  return at >= 0 && at === script.nodes.length - 1;
}

export function isAssessment(node: ScriptNode): boolean {
  return node.kind === 'checkforunderstanding';
}
