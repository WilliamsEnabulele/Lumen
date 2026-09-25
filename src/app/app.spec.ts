import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { bearer } from './auth/bearer';
import { AUTH_PATH } from './auth/session';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(withInterceptors([bearer])), provideHttpClientTesting()],
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
    expect(fixture.nativeElement.querySelector('lumen-upload')).toBeFalsy();

    http.expectOne(`${AUTH_PATH}/refresh`).flush(null, unauthorized);
  });

  it('asks to sign in when nobody is', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    restore(fixture, null);

    expect(fixture.nativeElement.querySelector('lumen-sign-in')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('lumen-upload')).toBeFalsy();
  });

  it('opens on the upload step for somebody whose refresh cookie is still good', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    restore(fixture, authenticated);

    // A reload is not a sign-out. The access token is gone, the cookie is not, and the student
    // never sees the door.
    expect(fixture.nativeElement.querySelector('lumen-sign-in')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('lumen-upload')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('lumen-tutor')).toBeFalsy();

    // Rendering the upload step sends this, and it is worth seeing in this test: it is the
    // first request that went out carrying the restored token.
    const formats = http.expectOne('/api/formats');
    expect(formats.request.headers.get('Authorization')).toBe('Bearer restored');
    formats.flush({ supported: ['.txt'] });
  });

  it('puts the door back, and drops the lesson, when the student signs out', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    restore(fixture, authenticated);
    http.expectOne('/api/formats').flush({ supported: ['.txt'] });

    // Set without rendering the tutor: what is under test is that signing out lets go of it.
    fixture.componentInstance.courseId.set('a-course');
    fixture.componentInstance.signOut();

    const request = http.expectOne(`${AUTH_PATH}/logout`);
    // Without the cookie the server cannot tell which session to revoke, and the refresh
    // token stays valid for whoever else has it.
    expect(request.request.withCredentials).toBeTrue();
    request.flush({ signedOut: true });
    fixture.detectChanges();

    // The course id belonged to one student. Left set, it would drop whoever signs in next
    // straight into somebody else's lesson — which the server would refuse on every request,
    // and which would look like a broken app rather than the sign-out that actually happened.
    expect(fixture.componentInstance.courseId()).toBeNull();
    expect(fixture.nativeElement.querySelector('lumen-sign-in')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('lumen-tutor')).toBeFalsy();
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
