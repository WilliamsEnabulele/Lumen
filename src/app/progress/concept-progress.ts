import { Component, computed, input } from '@angular/core';
import { ConceptProgress, standing, worthRevisiting } from 'domain';

/**
 * What the server believes the student knows, and why it believes it.
 *
 * Shown rather than kept, on the same reasoning the evidence trail is kept for at all: a
 * mastery estimate decides whether someone is taught a concept again, and a number nobody can
 * interrogate is one nobody should be allowed to act on — least of all the person it is about.
 *
 * So every row can be opened, and what is behind it is the actual questions, the actual
 * answers, and where the estimate moved to after each one.
 */
@Component({
  selector: 'lumen-concept-progress',
  templateUrl: './concept-progress.html',
  styleUrl: './concept-progress.scss',
})
export class ConceptProgressPanel {
  readonly progress = input.required<readonly ConceptProgress[]>();

  /** Null while the first fetch is in flight, so "nothing yet" is not shown as "nothing". */
  readonly loading = input(false);

  readonly standings = computed(() =>
    this.progress().map((record) => ({ record, standing: standing(record) })));

  readonly revisit = computed(() => worthRevisiting(this.progress()));

  readonly answered = computed(() =>
    this.progress().reduce((total, record) => total + record.evidence.length, 0));

  readonly shown = computed(() => this.progress().filter((record) => record.mastered).length);

  /** Belief as a number, for the people who want it. Rounded, never dressed up as a grade. */
  percent(belief: number): string {
    return `${Math.round(belief * 100)}`;
  }

  verdictLabel(verdict: string): string {
    return verdict === 'NoAnswer' ? 'No answer' : verdict;
  }
}
