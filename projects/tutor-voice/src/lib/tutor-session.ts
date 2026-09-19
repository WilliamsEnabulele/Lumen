import { Injectable, computed, signal } from '@angular/core';
import {
  LessonScript,
  ResumePointer,
  ScriptNode,
  TutorState,
  canvasStateOf,
  heldAt,
  isLastNode,
  isMidUtterance,
  nextNode,
  pointerAtStartOf,
  snapBack,
  validateTransition,
} from 'domain';

/** Where to start speaking, and which node to speak. */
export interface ResumeInstruction {
  readonly node: ScriptNode;
  /** Snapped back to a clause boundary — not the raw offset the tutor was cut off on. */
  readonly speakFrom: number;
  readonly canvasState: string;
}

/**
 * The client half of the tutor session: which state it is in, where the resume pointer is,
 * and what to do when the student cuts in.
 *
 * Deliberately free of browser APIs. Microphone and speech live in their own services and
 * are wired to this by the component, which keeps the part that decides *where teaching
 * resumes* testable without a sound card — and that part is the product.
 *
 * The server holds the authoritative pointer. This one exists because the decision to stop
 * and the decision where to restart both have to happen inside the barge-in budget.
 */
@Injectable({ providedIn: 'root' })
export class TutorSession {
  private readonly _state = signal<TutorState>('idle');
  private readonly _pointer = signal<ResumePointer | null>(null);
  private readonly _script = signal<LessonScript | null>(null);
  private readonly _held = signal<ResumePointer | null>(null);

  readonly state = this._state.asReadonly();
  readonly pointer = this._pointer.asReadonly();
  readonly script = this._script.asReadonly();

  readonly currentNode = computed<ScriptNode | null>(() => {
    const script = this._script();
    const pointer = this._pointer();
    if (!script || !pointer) return null;
    return script.nodes.find((node) => node.id === pointer.scriptNodeId) ?? null;
  });

  /**
   * How far through the current node's speech we are, 0 to 1.
   *
   * This is what the canvas animates against. Keying the illustration to the same offset the
   * resume pointer uses is what makes an interrupted node come back at the frame it left —
   * the words and the picture cannot drift apart because they are reading the same number.
   */
  readonly progress = computed(() => {
    const node = this.currentNode();
    const pointer = this._pointer();
    if (!node || !pointer || node.text.length === 0) return 0;
    return Math.min(1, pointer.utteranceOffset / node.text.length);
  });

  /** Instrumentation, because the corridor test's question outlives the corridor test. */
  readonly interruptions = signal(0);
  readonly falsePositives = signal(0);
  readonly midUtteranceResumes = signal(0);

  loadLesson(script: LessonScript): void {
    this.moveTo('loadingLesson', null);
    this._script.set(script);
    this._pointer.set(pointerAtStartOf(script.lessonId, script.nodes[0]));
  }

  /** Resuming a session that was paused, possibly on another device, possibly days ago. */
  restore(script: LessonScript, pointer: ResumePointer): void {
    this._script.set(script);
    this._pointer.set(pointer);
    this._state.set('paused');
  }

  beginTeaching(): ScriptNode {
    this.moveTo('teaching', this._pointer());
    const node = this.requireNode();
    return node;
  }

  /**
   * Checkpoint. Called as the tutor speaks, and on every node boundary — at fifteen to thirty
   * seconds a node that is a trivial write rate, and it bounds the worst case to one node of
   * lost progress, which is the amount a student forgives without noticing.
   */
  noteProgress(utteranceOffset: number): ResumePointer {
    const pointer = heldAt(this.requirePointer(), utteranceOffset);
    this._pointer.set(pointer);
    return pointer;
  }

  /**
   * The student cut in. Capture where we were, then stop — in that order, because by the time
   * the detour ends there is nothing left to come back to otherwise.
   */
  bargeIn(utteranceOffset: number): ResumePointer {
    const held = heldAt(this.requirePointer(), utteranceOffset);
    this._held.set(held);
    this._pointer.set(held);
    this.moveTo('listening', held);
    this.interruptions.update((n) => n + 1);
    return held;
  }

  startAnswering(): void {
    this.moveTo('answering', this._pointer());
  }

  /**
   * Nothing intelligible arrived, so the gate opened on a cough or a door. Resume from where
   * we were rather than pretending it was a question.
   */
  falsePositive(): ResumeInstruction {
    this.falsePositives.update((n) => n + 1);
    return this.resume();
  }

  resume(): ResumeInstruction {
    const held = this._held() ?? this.requirePointer();
    this.moveTo('teaching', held);
    this._pointer.set(held);
    this._held.set(null);

    if (isMidUtterance(held)) this.midUtteranceResumes.update((n) => n + 1);

    const node = this.requireNode();
    return {
      node,
      speakFrom: snapBack(node.text, held.utteranceOffset),
      canvasState: held.canvasState,
    };
  }

  /** A comprehension check asks, then waits for the student rather than carrying on. */
  askCheck(): void {
    this.moveTo('checkingUnderstanding', this._pointer());
  }

  /** A wrong answer reteaches from an earlier node instead of repeating the same words. */
  adapt(toScriptNodeId: string): ScriptNode {
    this.moveTo('adapting', this._pointer());
    const script = this.requireScript();
    const node = script.nodes.find((candidate) => candidate.id === toScriptNodeId);
    if (!node) throw new Error(`Cannot reteach from unknown node ${toScriptNodeId}.`);

    const pointer = pointerAtStartOf(script.lessonId, node);
    this._pointer.set(pointer);
    this._held.set(pointer);
    this.moveTo('teaching', pointer);
    this._held.set(null);
    return node;
  }

  /** The current node finished speaking. Advance, or finish the lesson. */
  nodeComplete(): ScriptNode | null {
    const script = this.requireScript();
    const pointer = this.requirePointer();

    if (isLastNode(script, pointer.scriptNodeId)) {
      this.moveTo('lessonComplete', pointer);
      return null;
    }

    const next = nextNode(script, pointer.scriptNodeId);
    if (!next) throw new Error('The script disagrees with itself about where the lesson ends.');

    this._pointer.set(pointerAtStartOf(script.lessonId, next));
    return next;
  }

  pause(): ResumePointer {
    const pointer = this.requirePointer();
    this.moveTo('paused', pointer);
    return pointer;
  }

  canvasState(): string {
    const node = this.currentNode();
    return node ? canvasStateOf(node) : 'none';
  }

  private moveTo(next: TutorState, pointer: ResumePointer | null): void {
    const refusal = validateTransition(this._state(), next, pointer);
    if (refusal) throw new Error(refusal);
    this._state.set(next);
  }

  private requirePointer(): ResumePointer {
    const pointer = this._pointer();
    if (!pointer) throw new Error('No resume pointer. Teaching cannot proceed without one.');
    return pointer;
  }

  private requireScript(): LessonScript {
    const script = this._script();
    if (!script) throw new Error('No lesson loaded.');
    return script;
  }

  private requireNode(): ScriptNode {
    const node = this.currentNode();
    if (!node) throw new Error('The resume pointer names a node that is not in this script.');
    return node;
  }
}
