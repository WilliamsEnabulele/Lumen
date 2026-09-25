import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { bearer, treatmentFor } from './bearer';
import { AUTH_PATH, Session } from './session';

/** An origin to reason about that is not whichever one Karma happens to be serving from. */
const HERE = 'http://localhost:4200';

describe('treatmentFor', () => {
  it('puts the bearer on this app’s API', () => {
    expect(treatmentFor('/api/courses', HERE)).toBe('bearer');
    expect(treatmentFor(`${HERE}/api/sessions/1/turn`, HERE)).toBe('bearer');
  });

  it('gives the auth endpoints the cookie instead, including the bare path', () => {
    expect(treatmentFor('/api/auth/refresh', HERE)).toBe('credentials');
    expect(treatmentFor('/api/auth/login', HERE)).toBe('credentials');
    expect(treatmentFor('/api/auth', HERE)).toBe('credentials');
  });

  it('reads the path, not the string — an auth path in a query is not an auth call', () => {
    // The substring check this replaces would have stopped sending the token here, and the
    // only symptom would have been one endpoint quietly 401ing.
    expect(treatmentFor('/api/courses?next=/api/auth/refresh', HERE)).toBe('bearer');
    expect(treatmentFor('/api/documents/1/status#/api/auth/', HERE)).toBe('bearer');
  });

  it('does not hand the access token to another origin', () => {
    expect(treatmentFor('https://elsewhere.example/api/courses', HERE)).toBe('untouched');
    expect(treatmentFor('//elsewhere.example/api/auth/refresh', HERE)).toBe('untouched');
  });

  it('leaves alone everything that is not the API', () => {
    expect(treatmentFor('/favicon.ico', HERE)).toBe('untouched');
    // A prefix that merely starts the same way is not the API.
    expect(treatmentFor('/apiary/notes', HERE)).toBe('untouched');
    expect(treatmentFor('not a url at all', 'also not a url')).toBe('untouched');
  });
});

describe('bearer interceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let session: Session;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([bearer])), provideHttpClientTesting()],
    });

    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    session = TestBed.inject(Session);
  });

  afterEach(() => http.verify());

  it('attaches the access token to an API call', () => {
    signIn('first');

    client.get('/api/courses').subscribe();

    const request = http.expectOne('/api/courses');
    expect(request.request.headers.get('Authorization')).toBe('Bearer first');
    expect(request.request.withCredentials).toBeFalse();
    request.flush([]);
  });

  it('sends the refresh cookie on an auth call, and no bearer', () => {
    signIn('first');

    session.refresh().subscribe();

    const request = http.expectOne(`${AUTH_PATH}/refresh`);
    // Without this the cookie is simply not on the request in development, where the app is
    // on :4200 and the API on :5299, and the server truthfully says nobody is signed in.
    expect(request.request.withCredentials).toBeTrue();
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush(authenticated('second'));
  });

  it('refreshes on a 401 and replays the request with the new token', () => {
    signIn('first');

    const answered: unknown[] = [];
    client.get('/api/courses').subscribe((courses) => answered.push(courses));

    http.expectOne('/api/courses').flush({ error: 'Nobody is signed in.' }, unauthorized);
    http.expectOne(`${AUTH_PATH}/refresh`).flush(authenticated('second'));

    const replay = http.expectOne('/api/courses');
    expect(replay.request.headers.get('Authorization')).toBe('Bearer second');
    replay.flush([{ id: 'a' }]);

    // The caller never saw the 401. That is the whole point: an expiry mid-lesson is not an
    // error anybody should have to write a branch for.
    expect(answered).toEqual([[{ id: 'a' }]]);
  });

  it('retries once, not until the server relents', () => {
    signIn('first');

    const refused: HttpErrorResponse[] = [];
    client
      .get('/api/courses')
      .subscribe({ error: (given: HttpErrorResponse) => refused.push(given) });

    http.expectOne('/api/courses').flush({ error: 'no' }, unauthorized);
    http.expectOne(`${AUTH_PATH}/refresh`).flush(authenticated('second'));
    http.expectOne('/api/courses').flush({ error: 'still no' }, unauthorized);

    // Nothing further goes out — verified by afterEach. A second refresh here is an infinite
    // loop against a server that has decided the answer is no.
    expect(refused.map((given) => given.status)).toEqual([401]);
  });

  it('never refreshes on the refresh call itself', () => {
    session.refresh().subscribe();

    http.expectOne(`${AUTH_PATH}/refresh`).flush({ error: 'ended' }, unauthorized);

    // The one request guaranteed to 401 is a refresh with a cookie the server has revoked. If
    // that triggered a refresh, every signed-out reload would hammer the endpoint forever.
    expect(session.isSignedIn()).toBeFalse();
  });

  it('serves every request that expired together from one refresh', () => {
    signIn('first');

    client.get('/api/courses').subscribe();
    client.get('/api/entitlement').subscribe();

    http.expectOne('/api/courses').flush({ error: 'no' }, unauthorized);
    http.expectOne('/api/entitlement').flush({ error: 'no' }, unauthorized);

    const refreshes = http.match(`${AUTH_PATH}/refresh`);
    expect(refreshes.length).toBe(1);
    refreshes[0].flush(authenticated('second'));

    for (const replay of [http.expectOne('/api/courses'), http.expectOne('/api/entitlement')]) {
      expect(replay.request.headers.get('Authorization')).toBe('Bearer second');
      replay.flush({});
    }
  });

  it('gives the caller the original refusal when the refresh cookie has gone too', () => {
    signIn('first');

    const refused: HttpErrorResponse[] = [];
    client
      .get('/api/courses')
      .subscribe({ error: (given: HttpErrorResponse) => refused.push(given) });

    http.expectOne('/api/courses').flush({ error: 'Sign in to see your courses.' }, unauthorized);
    http.expectOne(`${AUTH_PATH}/refresh`).flush({ error: 'ended' }, unauthorized);

    expect(refused.map((given) => given.status)).toEqual([401]);
    // And the session knows, so the app puts the sign-in screen up rather than showing an
    // error over a page that cannot load anything.
    expect(session.isSignedIn()).toBeFalse();
  });

  it('leaves a request to another origin untouched', () => {
    signIn('first');

    client.get('https://elsewhere.example/whatever').subscribe();

    const request = http.expectOne('https://elsewhere.example/whatever');
    expect(request.request.headers.has('Authorization')).toBeFalse();
    request.flush({});
  });

  function signIn(token: string): void {
    session.signIn('student@example.com', 'a long enough password').subscribe();
    http.expectOne(`${AUTH_PATH}/login`).flush(authenticated(token));
  }
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
