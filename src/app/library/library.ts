import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CourseSummaryView } from 'domain';
import { LumenApi } from '../api/lumen-api';

/**
 * Everything this student has turned into a course.
 *
 * The screen that makes a course worth keeping. Until there was somewhere to come back to,
 * finishing a lesson and closing the tab were the same thing, and the only way back into
 * material was to upload it a second time.
 */
@Component({
  selector: 'lumen-library',
  imports: [RouterLink],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library {
  private readonly api = inject(LumenApi);

  readonly courses = signal<readonly CourseSummaryView[] | null>(null);
  readonly error = signal<string | null>(null);

  /** Null while loading, so "you have nothing" is never shown as the answer to "not yet asked". */
  readonly empty = computed(() => this.courses()?.length === 0);

  constructor() {
    this.api.courses().subscribe({
      next: (courses) => this.courses.set(courses),
      error: (failure: Error) => this.error.set(failure.message),
    });
  }

  /** The date as a person would say it, and nothing if the server sent something unreadable. */
  made(course: CourseSummaryView): string | null {
    const when = new Date(course.createdAt);
    return Number.isNaN(when.getTime())
      ? null
      : when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
