import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { bearer } from './bearer';
import { AUTH_PATH, Session } from './session';
import { SignIn } from './sign-in';

describe('SignIn', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SignIn>;
  let screen: SignIn;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignIn],
      providers: [provideHttpClient(withInterceptors([bearer])), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SignIn);
    screen = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('opens on signing in, because most people already have an account', () => {
    expect(screen.isSignUp()).toBeFalse();
    expect(text()).toContain('Sign in');
  });

  it('will not submit an empty form, and so will not spend an attempt on one', () => {
    expect(screen.canSubmit()).toBeFalse();

    screen.email.set('student@example.com');
    expect(screen.canSubmit()).toBeFalse();

    screen.password.set('a long enough password');
    expect(screen.canSubmit()).toBeTrue();
  });

  it('signs in, and leaves the session holding the student', () => {
    screen.email.set('  student@example.com  ');
    screen.password.set('a long enough password');
    screen.submit();

    const request = http.expectOne(`${AUTH_PATH}/login`);
    // Trimmed, because an address pasted out of an email client arrives with a space on it and
    // the server would rightly not match it against anything.
    expect(request.request.body).toEqual({
      email: 'student@example.com',
      password: 'a long enough password',
    });
    request.flush(authenticated);

    expect(TestBed.inject(Session).isSignedIn()).toBeTrue();
  });

  it('signs up against the other endpoint, with the name it asked for', () => {
    screen.switchTo('up');
    screen.name.set('A Student');
    screen.email.set('student@example.com');
    screen.password.set('a long enough password');
    screen.submit();

    const request = http.expectOne(`${AUTH_PATH}/register`);
    expect(request.request.body).toEqual({
      email: 'student@example.com',
      password: 'a long enough password',
      name: 'A Student',
    });
    request.flush(authenticated);
  });

  it('shows the server’s own words, and leaves the attempt ready to correct', () => {
    screen.email.set('student@example.com');
    screen.password.set('not the password');
    screen.submit();

    http
      .expectOne(`${AUTH_PATH}/login`)
      .flush(
        { error: 'That email and password do not match an account.' },
        { status: 401, statusText: 'Unauthorized' },
      );
    fixture.detectChanges();

    expect(text()).toContain('That email and password do not match an account.');
    // Most failures here are one wrong character. Emptying the field would make the student
    // retype the whole password to fix it, and would not slow down anybody guessing.
    expect(screen.password()).toBe('not the password');
    expect(screen.busy()).toBeFalse();
    expect(screen.canSubmit()).toBeTrue();
  });

  it('drops the refusal when the student changes their mind about which form they wanted', () => {
    screen.email.set('student@example.com');
    screen.password.set('a long enough password');
    screen.submit();

    http
      .expectOne(`${AUTH_PATH}/login`)
      .flush(
        { error: 'That email and password do not match an account.' },
        { status: 401, statusText: 'Unauthorized' },
      );

    screen.switchTo('up');
    fixture.detectChanges();

    // Left on screen under a "Create account" button, the old refusal reads as though signing
    // up had just failed.
    expect(screen.error()).toBeNull();
    expect(text()).toContain('Create account');
  });

  it('keeps the typed email when swapping between the two forms', () => {
    screen.email.set('student@example.com');
    screen.switchTo('up');

    expect(screen.email()).toBe('student@example.com');
  });

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }
});

const authenticated = {
  accessToken: 'fresh',
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  id: '11111111-1111-1111-1111-111111111111',
  email: 'student@example.com',
  name: 'A Student',
};
