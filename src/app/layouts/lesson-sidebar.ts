import { Component, input } from '@angular/core';
import { ConceptProgress } from 'domain';
import { ConceptProgressPanel } from '../progress/concept-progress';

/** One concept of the plan, in teaching order, with the lesson it belongs to. */
export interface PlanStep {
  readonly lesson: string;
  readonly concept: string;
}

/**
 * The frame down the left of a lesson: where the lesson is, and what this student has shown.
 *
 * A layout piece rather than part of the lesson view, and presentational rather than wired to
 * anything. It takes what it renders and decides none of it — in particular it does not work
 * out the position itself, because `throughPlan` in the domain is where that decision is
 * written down along with the reason it is position and not belief.
 */
@Component({
  selector: 'lumen-lesson-sidebar',
  imports: [ConceptProgressPanel],
  templateUrl: './lesson-sidebar.html',
  styleUrl: './lesson-sidebar.scss',
})
export class LessonSidebar {
  readonly lessonTitle = input.required<string>();
  readonly courseTitle = input.required<string>();
  readonly steps = input.required<readonly PlanStep[]>();

  /** Which step is being taught, or -1 before the first. */
  readonly currentStep = input.required<number>();

  /** Concepts this student has demonstrated, which is a different claim from "covered". */
  readonly shown = input.required<ReadonlySet<string>>();

  /** How far through the plan, as a percentage. Handed in already decided. */
  readonly position = input.required<number>();

  readonly standing = input<readonly ConceptProgress[] | null>(null);
  readonly loadingStanding = input(false);
}
