import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { bearer } from '../auth/bearer';
import { Library } from './library';

describe('Library', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Library>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Library],
      providers: [
        provideHttpClient(withInterceptors([bearer])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Library);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('does not answer "you have nothing" before it has asked', () => {
    // Null and empty are different answers, and showing the second for the first is how an app
    // tells somebody their work is gone.
    expect(fixture.componentInstance.empty()).toBeFalse();
    expect(text()).not.toContain('Nothing here yet');

    http.expectOne('/api/courses').flush([]);
  });

  it('offers the way in when there is nothing yet', () => {
    http.expectOne('/api/courses').flush([]);
    fixture.detectChanges();

    expect(text()).toContain('Nothing here yet');
    expect(fixture.nativeElement.querySelector('.start')).toBeTruthy();
  });

  it('lists the courses, each one addressable', () => {
    http.expectOne('/api/courses').flush([
      {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        title: 'Photosynthesis',
        summary: 'How a leaf eats light.',
        authoredBy: 'gemini-3.1-flash-lite',
        createdAt: new Date().toISOString(),
      },
    ]);
    fixture.detectChanges();

    expect(text()).toContain('Photosynthesis');
    // The link is what makes a course worth keeping rather than worth finishing.
    const link = fixture.nativeElement.querySelector('.courses a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('aaaaaaaa-0000-0000-0000-000000000001');
  });

  it('says so when they could not be loaded, rather than looking empty', () => {
    http.expectOne('/api/courses').flush(
      { error: 'Could not reach the server.' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(text()).toContain('could not be loaded');
    expect(text()).not.toContain('Nothing here yet');
  });

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }
});
