import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { bearer } from './bearer';
import { AUTH_PATH, Session } from './session';

describe('Session', () => {
  let http: HttpTestingController;
  let session: Session;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([bearer])), provideHttpClientTesting()],
    });

    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(Session);
  });

  afterEach(() => http.verify());

  it('holds the access token in memory and nowhere a script can read it', () => {
    session.signIn('student@example.com', 'a long enough password').subscribe();
    http.expectOne(`${AUTH_PATH}/login`).flush(authenticated('kept-in-memory'));

    expect(session.token).toBe('kept-in-memory');

    // The reason the refresh token is HttpOnly is that a script on the page must not be able
    // to read the long-lived half. Putting the short-lived half in storage hands back most of
    // what that bought.
    const stored = [localStorage, sessionStorage].flatMap((store) =>
      Object.keys(store).map((key) => store.getItem(key) ?? ''),
    );
    expect(stored.some((value) => value.includes('kept-in-memory'))).toBeFalse();
  });

  it('fires one refresh for fifteen callers, not fifteen', () => {
    const tokens: (string | null)[] = [];
    for (let i = 0; i < 15; i++) session.refresh().subscribe((token) => tokens.push(token));

    // Fifteen refreshes would race, and every loser would be left holding a token the server
    // has already replaced.
    http.expectOne(`${AUTH_PATH}/refresh`).flush(authenticated('one-for-all'));

    expect(tokens.length).toBe(15);
    expect(new Set(tokens)).toEqual(new Set(['one-for-all']));
  });

  it('refreshes again once the shared one has finished', () => {
    session.refresh().subscribe();
    http.expectOne(`${AUTH_PATH}/refresh`).flush(authenticated('first'));

    session.refresh().subscribe();
    http.expectOne(`${AUTH_PATH}/refresh`).flush(authenticated('second'));

    expect(session.token).toBe('second');
  });

  it('settles at boot whether or not there was a cookie', () => {
    expect(session.settled()).toBeFalse();

    session.restore();
    http.expectOne(`${AUTH_PATH}/refresh`).flush({ error: 'Nobody is signed in.' }, unauthorized);

    // Settled and signed out are different answers, and until the first one arrives the app
    // must show neither the door nor the app.
    expect(session.settled()).toBeTrue();
    expect(session.isSignedIn()).toBeFalse();
  });

  it('signs in silently at boot when the refresh cookie is still good', () => {
    session.restore();
    http.expectOne(`${AUTH_PATH}/refresh`).flush(authenticated('restored'));

    expect(session.settled()).toBeTrue();
    expect(session.isSignedIn()).toBeTrue();
    expect(session.student()?.email).toBe('student@example.com');
  });

  it('turns a refusal into a sentence rather than a status code', () => {
    const said: string[] = [];
    session
      .signIn('student@example.com', 'wrong')
      .subscribe({ error: (failure: Error) => said.push(failure.message) });

    http
      .expectOne(`${AUTH_PATH}/login`)
      .flush({ error: 'That email and password do not match an account.' }, unauthorized);

    expect(said).toEqual(['That email and password do not match an account.']);
  });

  it('says something useful when the attempt was rate limited, which answers with no body', () => {
    const said: string[] = [];
    session
      .signIn('student@example.com', 'wrong again')
      .subscribe({ error: (failure: Error) => said.push(failure.message) });

    http
      .expectOne(`${AUTH_PATH}/login`)
      .flush(null, { status: 429, statusText: 'Too Many Requests' });

    expect(said[0]).toContain('Too many attempts');
  });

  it('lets go of the session even when signing out fails', () => {
    session.signIn('student@example.com', 'a long enough password').subscribe();
    http.expectOne(`${AUTH_PATH}/login`).flush(authenticated('about-to-go'));

    session.signOut().subscribe();
    http.expectOne(`${AUTH_PATH}/logout`).flush(null, { status: 500, statusText: 'Server Error' });

    // A sign-out that visibly fails leaves somebody looking at their own account believing
    // they have left it. The server-side revocation is what actually ends the session; this
    // half only has to stop showing it.
    expect(session.isSignedIn()).toBeFalse();
    expect(session.token).toBeNull();
  });
});

const unauthorized = { status: 401, statusText: 'Unauthorized' };

function authenticated(accessToken: string) {
  return {
    accessToken,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    id: '11111111-1111-1111-1111-111111111111',
    email: 'student@example.com',
    name: 'A Student',
  };
}
