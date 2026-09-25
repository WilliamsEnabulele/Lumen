import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Authenticated, SignedInStudent } from 'domain';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { readableFailure } from '../api/lumen-api';

/**
 * Where the auth endpoints live.
 *
 * Requests under it must never carry a bearer token and must never trigger a refresh. A 401
 * from `/api/auth/refresh` that refreshed would refresh forever, and the one call guaranteed
 * to 401 is the one made with a cookie the server has revoked.
 */
export const AUTH_PATH = '/api/auth';

/**
 * Who is signed in, and the access token used to prove it.
 *
 * The token is held in memory and nowhere else. Putting it in local storage would undo the
 * reason the refresh token is HttpOnly: a script that gets onto the page could read it, and
 * then the fifteen-minute lifetime is the only thing between an attacker and the account.
 *
 * The cost is that a reload loses it, which is why the app asks for a new one on boot. The
 * refresh cookie survives the reload, so that succeeds silently for anybody already signed in.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly http = inject(HttpClient);

  private readonly _student = signal<SignedInStudent | null>(null);
  private readonly _token = signal<string | null>(null);

  /** Null until the first refresh attempt has finished, so "unknown" is not shown as "signed out". */
  private readonly _settled = signal(false);

  readonly student = this._student.asReadonly();
  readonly settled = this._settled.asReadonly();
  readonly isSignedIn = computed(() => this._student() !== null);

  /**
   * The refresh in flight, if there is one.
   *
   * Shared rather than started per caller. Fifteen concurrent requests whose tokens expire
   * together would otherwise fire fifteen refreshes, and the loser of that race gets a token
   * that has already been replaced.
   */
  private refreshing: Observable<string | null> | null = null;

  get token(): string | null {
    return this._token();
  }

  /**
   * Asks for a new access token using the refresh cookie.
   *
   * `withCredentials` is what actually sends that cookie cross-origin, and forgetting it is
   * the failure that looks exactly like "the server signed me out".
   */
  refresh(): Observable<string | null> {
    if (this.refreshing) return this.refreshing;

    this.refreshing = this.http
      .post<Authenticated>(`${AUTH_PATH}/refresh`, {}, { withCredentials: true })
      .pipe(
        map((authenticated) => {
          this.accept(authenticated);
          return authenticated.accessToken;
        }),
        catchError(() => {
          this.clear();
          return of(null);
        }),
        tap({ finalize: () => (this.refreshing = null) }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.refreshing;
  }

  /** Called once at startup: signs in anybody whose refresh cookie is still good. */
  restore(): void {
    this.refresh().subscribe({ complete: () => this._settled.set(true) });
  }

  signIn(email: string, password: string): Observable<SignedInStudent> {
    return this.authenticate(`${AUTH_PATH}/login`, { email, password });
  }

  signUp(email: string, password: string, name: string): Observable<SignedInStudent> {
    return this.authenticate(`${AUTH_PATH}/register`, { email, password, name });
  }

  signOut(): Observable<void> {
    return this.http.post(`${AUTH_PATH}/logout`, {}, { withCredentials: true }).pipe(
      map(() => undefined),
      // Cleared locally whichever way the request went. A sign-out that visibly fails leaves
      // somebody looking at their own account believing they have left it.
      tap({ next: () => this.clear(), error: () => this.clear() }),
      catchError(() => of(undefined)),
    );
  }

  private authenticate(path: string, body: object): Observable<SignedInStudent> {
    return this.http.post<Authenticated>(path, body, { withCredentials: true }).pipe(
      map((authenticated) => {
        this.accept(authenticated);
        this._settled.set(true);
        return authenticated;
      }),
      // Turned into a sentence here rather than at the screen, so "that email and password do
      // not match an account" and "could not reach the server" arrive the same way every other
      // failure in the app does.
      catchError(readableFailure),
    );
  }

  private accept(authenticated: Authenticated): void {
    this._token.set(authenticated.accessToken);
    this._student.set({
      id: authenticated.id,
      email: authenticated.email,
      name: authenticated.name,
    });
  }

  private clear(): void {
    this._token.set(null);
    this._student.set(null);
    this._settled.set(true);
  }
}
