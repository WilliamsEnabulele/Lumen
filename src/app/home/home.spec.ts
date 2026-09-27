import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { bearer } from '../auth/bearer';
import { Home } from './home';

const ONE_LESSON = [
  {
    sessionId: 's1',
    courseId: 'c1',
    courseTitle: 'Photosynthesis — Bio 101',
    conceptTitle: 'Light-dependent reactions',
    conceptsBehind: 2,
    conceptsTotal: 5,
    lastTaughtAt: new Date(Date.now() - 3 * 36e5).toISOString(),
  },
];

const A_STREAK = {
  current: 3,
  longest: 7,
  thisWeek: 3,
  goal: 5,
  goalMet: false,
  days: [] as string[],
};

describe('Home', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideHttpClient(withInterceptors([bearer])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('does not say there is nothing before it has asked', () => {
    // Null and empty are different answers, and showing the second for the first tells somebody
    // their work is gone.
    expect(text()).not.toContain('Nothing part-way through');
    expect(text()).toContain('Looking for where you got to');

    answer();
  });

  it('offers the lesson to carry on with, and where it got to', () => {
    answer({ open: ONE_LESSON });

    expect(text()).toContain('Photosynthesis — Bio 101');
    expect(text()).toContain('Light-dependent reactions');
    expect(text()).toContain('2 of 5 concepts behind you');

    const carryOn = fixture.nativeElement.querySelector('.resume .go') as HTMLAnchorElement;
    expect(carryOn.getAttribute('href')).toContain('c1');
  });

  it('counts position the way the lesson does, so the two cannot disagree', () => {
    answer({ open: ONE_LESSON });

    // Two concepts behind, out of five. Counting the open one would read 60% here and 40% in
    // the lesson, which is worse than either being wrong alone.
    expect(fixture.componentInstance.resumePosition()).toBe(40);
  });

  it('says so plainly when nothing is part-way through', () => {
    answer({ open: [] });

    expect(text()).toContain('Nothing part-way through');
    expect(text()).toContain('Hand over a document');
  });

  it('draws the week from Monday, which is the week the server counted', () => {
    answer({ streak: { ...A_STREAK, days: [today()] } });

    const days = [...fixture.nativeElement.querySelectorAll('.day')] as HTMLElement[];
    expect(days.length).toBe(7);

    // A rolling seven days beside a figure counted from Monday is two things on one card that
    // disagree: on a Wednesday the strip would show four days the number ignored.
    const first = new Date(`${days[0].getAttribute('title')}T00:00:00`);
    expect(first.getDay()).toBe(1);

    expect(fixture.nativeElement.querySelectorAll('.day.today').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.day.taught').length).toBe(1);
  });

  it('marks the rest of the week as not yet, rather than as missed', () => {
    answer({ streak: { ...A_STREAK, days: [] } });

    const week = fixture.componentInstance.week();
    const todayAt = week.findIndex((day) => day.today);

    // An empty Friday on a Wednesday is a day that has not happened.
    expect(week.slice(0, todayAt + 1).every((day) => !day.ahead)).toBeTrue();
    expect(week.slice(todayAt + 1).every((day) => day.ahead)).toBeTrue();
  });

  it('says what the streak counts, because it is the only number on the page', () => {
    answer({ streak: A_STREAK });

    expect(text()).toContain('3 days in a row');
    expect(text()).toContain('3 of 5 days so far');
    // A streak counts attendance. Nothing on this page may read as a mark for what is known.
    expect(text()).toContain('Counts days you did some work, not how well it went');
  });

  it('shows concepts in words, never as a figure', () => {
    answer({
      shown: [
        { concept: 'Role of chlorophyll', courseId: 'c1', belief: 0.88, mastered: true, reteaches: 0, movedOnUnmastered: false, answers: 2 },
        { concept: 'The Calvin cycle', courseId: 'c1', belief: 0.31, mastered: false, reteaches: 2, movedOnUnmastered: true, answers: 3 },
      ],
    });

    expect(text()).toContain('1 of 2 concepts shown');
    expect(text()).toContain('Moved on without it');
    expect(text()).toContain('worth coming back to');
    // The belief is on the wire and must not reach the screen as a percentage.
    expect(text()).not.toContain('88');
    expect(text()).not.toContain('31');
  });

  it('a card that fails does not take the others down with it', () => {
    http.expectOne('/api/sessions').flush(null, { status: 500, statusText: 'nope' });
    http.expectOne('/api/progress').flush([]);
    http.expectOne('/api/streak').flush(A_STREAK);
    http.expectOne('/api/entitlement').flush(null, { status: 500, statusText: 'nope' });
    fixture.detectChanges();

    // Three reads, three answers. One failing is one card saying so.
    expect(text()).toContain('3 days in a row');
    expect(text()).toContain('Nothing part-way through');
  });

  function answer(given: {
    open?: unknown;
    shown?: unknown;
    streak?: unknown;
    entitlement?: unknown;
  } = {}): void {
    http.expectOne('/api/sessions').flush(given.open ?? []);
    http.expectOne('/api/progress').flush(given.shown ?? []);
    http.expectOne('/api/streak').flush(given.streak ?? A_STREAK);
    http.expectOne('/api/entitlement').flush(
      given.entitlement ?? {
        active: false,
        plan: null,
        expiresAt: null,
        enforced: true,
        freeUploadsLeft: 1,
        freeAllowanceResetsAt: new Date().toISOString(),
      },
    );
    fixture.detectChanges();
  }

  /** Today as the device reckons it, which is how the component builds its squares. */
  function today(): string {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const date = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${date}`;
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }
});
