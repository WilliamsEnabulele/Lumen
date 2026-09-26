import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { bearer } from './auth/bearer';
import { AUTH_PATH } from './auth/session';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(withInterceptors([bearer])),
        provideHttpClientTesting(),
        // No routes: what is under test is the gate in front of the router, not the router.
        provideRouter([]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows neither the door nor the app while the restore is in flight', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    // Showing the sign-in screen here would sign out everybody holding a perfectly good
    // refresh cookie, for as long as one request takes.
    expect(fixture.nativeElement.querySelector('lumen-sign-in')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('lumen-top-bar')).toBeFalsy();

    http.expectOne(`${AUTH_PATH}/refresh`).flush(null, unauthorized);
  });

  it('asks to sign in when nobody is, and offers no navigation to sign in from', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    restore(fixture, null);

    expect(fixture.nativeElement.querySelector('lumen-sign-in')).toBeTruthy();
    // The bar carries a sign-out and a link to somebody's library. Neither means anything yet.
    expect(fixture.nativeElement.querySelector('lumen-top-bar')).toBeFalsy();
  });

  it('opens the app for somebody whose refresh cookie is still good', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    restore(fixture, authenticated);

    // A reload is not a sign-out. The access token is gone, the cookie is not.
    expect(fixture.nativeElement.querySelector('lumen-sign-in')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('lumen-top-bar')).toBeTruthy();
  });

  function restore(fixture: ComponentFixture<App>, body: object | null): void {
    const request = http.expectOne(`${AUTH_PATH}/refresh`);
    if (body) request.flush(body);
    else request.flush({ error: 'Nobody is signed in.' }, unauthorized);
    fixture.detectChanges();
  }
});

const unauthorized = { status: 401, statusText: 'Unauthorized' };

const authenticated = {
  accessToken: 'restored',
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  id: '11111111-1111-1111-1111-111111111111',
  email: 'student@example.com',
  name: 'A Student',
};
