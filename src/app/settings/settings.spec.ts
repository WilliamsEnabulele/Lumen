import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { bearer } from '../auth/bearer';
import { AUTH_PATH, Session } from '../auth/session';
import { Settings } from './settings';
import { Theme } from './theme';

describe('Settings', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    localStorage.removeItem('lumen.theme');
    document.documentElement.removeAttribute('data-theme');

    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideHttpClient(withInterceptors([bearer])), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);

    TestBed.inject(Session).signIn('adaeze@example.com', 'a long enough password').subscribe();
    http.expectOne(`${AUTH_PATH}/login`).flush({
      accessToken: 'tok',
      expiresAt: new Date(Date.now() + 9e5).toISOString(),
      id: '1111',
      email: 'adaeze@example.com',
      name: 'Adaeze Okoro',
    });

    fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('lumen.theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('starts on the device setting, which is the absence of a choice', () => {
    // "System" is not a third palette; it is the attribute not being there, which is the only
    // state in which the media query gets to decide.
    expect(TestBed.inject(Theme).preference()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBeFalse();
  });

  it('an explicit choice is stamped on the document so it can win over the machine', () => {
    TestBed.inject(Theme).set('dark');
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('choosing the device setting takes the attribute back off', () => {
    const theme = TestBed.inject(Theme);
    theme.set('light');
    fixture.detectChanges();
    theme.set('system');
    fixture.detectChanges();

    expect(document.documentElement.hasAttribute('data-theme')).toBeFalse();
  });

  it('shows the account it is signed in as', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Adaeze Okoro');
    expect(text).toContain('adaeze@example.com');
  });

  it('offers nothing that does not do something', () => {
    // A settings page padded out with switches that do nothing teaches the student that this
    // screen is where changes go to be ignored.
    const controls = fixture.nativeElement.querySelectorAll('button');
    expect(controls.length).toBe(4); // three appearance choices, and sign out
  });
});
