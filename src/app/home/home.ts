import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EntitlementView, OpenLessonView, ShownConceptView, StreakView, throughPlan } from 'domain';
import { LumenApi } from '../api/lumen-api';
import { Session } from '../auth/session';

/** One day of this week, for drawing it rather than describing it. */
interface Day {
  readonly letter: string;
  readonly iso: string;
  readonly taught: boolean;
  readonly today: boolean;
  /** Later this week. Not a day that was missed, and must not be drawn as one. */
  readonly ahead: boolean;
}

/**
 * Where a student lands.
 *
 * It answers three questions and does not invent a fourth: where was I, what have I shown, and
 * have I been turning up. Everything on it is read from something the server actually records.
 */
@Component({
  selector: 'lumen-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly api = inject(LumenApi);
  readonly session = inject(Session);

  readonly open = signal<readonly OpenLessonView[] | null>(null);
  readonly shown = signal<readonly ShownConceptView[] | null>(null);
  readonly streak = signal<StreakView | null>(null);
  readonly entitlement = signal<EntitlementView | null>(null);

  /** The lesson to offer first. The rest are in the library. */
  readonly resume = computed(() => this.open()?.[0] ?? null);

  readonly mastered = computed(() => this.shown()?.filter((it) => it.mastered) ?? []);
  readonly flagged = computed(() => this.shown()?.filter((it) => it.movedOnUnmastered) ?? []);

  /** Position through the plan, decided by the same rule the lesson view uses. */
  readonly resumePosition = computed(() => {
    const lesson = this.resume();
    return lesson ? throughPlan(lesson.conceptsTotal, lesson.conceptsBehind, false) : 0;
  });

  /**
   * Monday to Sunday of this week — the same week the server counted.
   *
   * Not the last seven days. A rolling strip beside a figure that counts from Monday is two
   * things on one card that disagree: on a Wednesday the strip would show four days of last
   * week while the number ignored them.
   */
  readonly week = computed<readonly Day[]>(() => {
    const taught = new Set(this.streak()?.days ?? []);
    const today = new Date();
    const todayIso = local(today);

    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

    const days: Day[] = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const iso = local(day);

      days.push({
        letter: day.toLocaleDateString(undefined, { weekday: 'narrow' }),
        iso,
        taught: taught.has(iso),
        today: iso === todayIso,
        ahead: iso > todayIso,
      });
    }

    return days;
  });

  /** Morning, afternoon or evening, from the clock on this device rather than the server's. */
  get greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    return hour < 18 ? 'Good afternoon' : 'Good evening';
  }

  get name(): string {
    const student = this.session.student();
    return student?.name?.trim() || student?.email?.split('@')[0] || 'there';
  }

  constructor() {
    // Four independent reads rather than one endpoint shaped like this screen. A card that
    // fails is a card that says so, and the other three still answer.
    this.api.openLessons().subscribe({ next: (open) => this.open.set(open), error: () => this.open.set([]) });
    this.api.shown().subscribe({ next: (shown) => this.shown.set(shown), error: () => this.shown.set([]) });
    this.api.streak().subscribe({ next: (streak) => this.streak.set(streak), error: () => this.streak.set(null) });
    this.api.entitlement().subscribe({
      next: (entitlement) => this.entitlement.set(entitlement),
      error: () => this.entitlement.set(null),
    });
  }

  /** When the lesson was last touched, as a person would say it. */
  lastTaught(lesson: OpenLessonView): string | null {
    const when = new Date(lesson.lastTaughtAt);
    if (Number.isNaN(when.getTime())) return null;

    const hours = (Date.now() - when.getTime()) / 36e5;

    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.round(hours)} hours ago`;
    if (hours < 48) return 'yesterday';

    return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}

/**
 * A date as this device reckons it, not as UTC does.
 *
 * `toISOString` is UTC, and using it here would put somebody west of Greenwich on yesterday's
 * square all evening. The server's own day is still UTC — a known limitation recorded with the
 * store — but the strip at least agrees with the clock on the wall in front of the student.
 */
function local(day: Date): string {
  const month = `${day.getMonth() + 1}`.padStart(2, '0');
  const date = `${day.getDate()}`.padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}
