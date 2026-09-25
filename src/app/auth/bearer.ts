import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AUTH_PATH, Session } from './session';

/** Where this app's own API lives. Nothing outside it is ours to put a token on. */
const API_PATH = '/api';

/**
 * What the interceptor does with a request, decided from its URL alone.
 *
 * Three outcomes rather than two, because the auth endpoints are not simply "skip this": they
 * need the opposite treatment from everything else. They carry the refresh cookie and no
 * bearer, where every other call carries a bearer and no cookie.
 */
export type Treatment =
  /** Carries the access token. A 401 here is worth one refresh and one replay. */
  | 'bearer'
  /** Carries the refresh cookie and nothing else, and a 401 here is an answer, not a retry. */
  | 'credentials'
  /** Not ours. Left exactly as it was found. */
  | 'untouched';

/**
 * Which of the three a URL gets.
 *
 * A pure function over the URL rather than a `startsWith` at the call site, because the two
 * ways of getting this wrong are both silent. Matching `/api/auth/` as a substring would treat
 * `/api/courses?next=/api/auth/` as an auth call and quietly stop sending the token to it. And
 * attaching the bearer to whatever host a URL names would hand the access token to anybody the
 * app can be talked into calling — so the origin is checked, and the default is to touch
 * nothing.
 */
export function treatmentFor(url: string, origin: string): Treatment {
  let target: URL;

  try {
    target = new URL(url, origin);
  } catch {
    // A URL neither the browser nor we can parse is not one we are going to authenticate.
    return 'untouched';
  }

  if (target.origin !== origin) return 'untouched';

  const path = target.pathname;

  if (path === AUTH_PATH || path.startsWith(`${AUTH_PATH}/`)) return 'credentials';

  return path === API_PATH || path.startsWith(`${API_PATH}/`) ? 'bearer' : 'untouched';
}

/**
 * Attaches the access token, and on a 401 trades the refresh cookie for a new one and sends
 * the request again.
 *
 * The retry happens here rather than at each call site because the expiry is invisible from
 * there: a token that was valid when the upload started is fifteen minutes older when the
 * status poll goes out, and every caller would otherwise need the same recovery.
 *
 * It happens exactly once. The replay goes straight to `next`, outside this operator, so a
 * second 401 is the server's answer rather than the second step of a loop — a refresh that
 * succeeds against a server that still refuses would otherwise spin forever.
 */
export const bearer: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);

  switch (treatmentFor(request.url, window.location.origin)) {
    case 'untouched':
      return next(request);

    case 'credentials':
      // `withCredentials` is what actually sends the HttpOnly refresh cookie when the app and
      // the API are on different origins, which in development they are — :4200 and :5299.
      // Without it the cookie simply is not on the request, the server correctly says nobody
      // is signed in, and it looks exactly like being signed out for no reason.
      //
      // Set here as well as at the call site so that an auth call added later cannot be
      // written without it and appear to work until somebody reloads the page.
      return next(request.clone({ withCredentials: true }));
  }

  return next(bearing(request, session.token)).pipe(
    catchError((failure: unknown) => {
      if (!(failure instanceof HttpErrorResponse) || failure.status !== 401) {
        return throwError(() => failure);
      }

      return session.refresh().pipe(
        switchMap((fresh) =>
          // A refresh that came back with nothing has already cleared the session, so the app
          // is about to show the sign-in screen. The original 401 is what actually happened
          // and is what the caller is told.
          fresh ? next(bearing(request, fresh)) : throwError(() => failure),
        ),
      );
    }),
  );
};

function bearing(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  // No token yet is a real state — the first requests of a page load race the silent restore —
  // and it is the server's job to refuse them, not ours to invent an empty header for.
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}
