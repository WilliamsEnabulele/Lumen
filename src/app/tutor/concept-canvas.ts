import { Component, computed, input } from '@angular/core';
import { ScriptNode } from 'domain';

interface CodeLine {
  readonly text: string;
  readonly index: number;
}

/**
 * The illustration, animated against the speech rather than beside it.
 *
 * Everything here is driven by one number: how far through the current utterance the tutor is.
 * That is the same number the resume pointer is made of, which is the point — the words and
 * the picture cannot drift apart, and a node that was interrupted comes back with its
 * illustration at the frame it left rather than restarted.
 *
 * The visual kinds are behaviours, not pictures. The backend chooses one when it composes the
 * lesson; nothing here needs an asset to fetch.
 */
@Component({
  selector: 'lumen-concept-canvas',
  templateUrl: './concept-canvas.html',
  styleUrl: './concept-canvas.scss',
})
export class ConceptCanvas {
  readonly node = input.required<ScriptNode | null>();
  /** 0..1 through the current node's speech. */
  readonly progress = input(0);

  readonly kind = computed(() => this.node()?.visualKind ?? 'None');

  private readonly lines = computed(() =>
    (this.node()?.visualPayload ?? '')
      .split('\n')
      .map((text, index) => ({ text, index }) satisfies CodeLine),
  );

  readonly codeLines = this.lines;

  /** The line being talked about. Walks the source as the explanation moves. */
  readonly activeLine = computed(() => {
    const lines = this.lines();
    if (lines.length === 0) return -1;
    return Math.min(lines.length - 1, Math.floor(this.progress() * lines.length));
  });

  readonly steps = computed(() =>
    (this.node()?.visualPayload ?? '').split('\n').filter((step) => step.trim().length > 0),
  );

  /** A point arrives when the speech reaches its share of the utterance. */
  revealed(index: number): boolean {
    const total = this.steps().length;
    if (total === 0) return false;
    // The first point is up from the start; a canvas that opens empty reads as broken.
    return index === 0 || this.progress() >= index / total;
  }

  readonly statement = computed(() => this.node()?.visualPayload ?? '');

  readonly comparison = computed(() => {
    const halves = (this.node()?.visualPayload ?? '').split('\n');
    return { left: halves[0] ?? '', right: halves[1] ?? '' };
  });

  readonly counter = computed(() => {
    const [from, to, label] = (this.node()?.visualPayload ?? '').split('|');
    const start = Number(from) || 0;
    const end = Number(to) || 0;
    return {
      value: Math.round(start + (end - start) * this.progress()),
      label: label ?? '',
    };
  });
}
