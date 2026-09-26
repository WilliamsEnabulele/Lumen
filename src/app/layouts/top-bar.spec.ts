import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { bearer } from '../auth/bearer';
import { AUTH_PATH, Session } from '../auth/session';
import { TopBar } from './top-bar';

describe('TopBar', () => {
  let http: HttpTestingController;
  let session: Session;
  let fixture: ComponentFixture<TopBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [
        provideHttpClient(withInterceptors([bearer])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(Session);

    session.signIn('adaeze@example.com', 'a long enough password').subscribe();
    http.expectOne(`${AUTH_PATH}/login`).flush({
      accessToken: 'tok',
      expiresAt: new Date(Date.now() + 9e5).toISOString(),
      id: '1111',
      email: 'adaeze@example.com',
      name: 'Adaeze Okoro',
    });

    fixture = TestBed.createComponent(TopBar);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('says who is signed in', () => {
    expect(fixture.nativeElement.textContent).toContain('Adaeze Okoro');
    expect(fixture.componentInstance.initial).toBe('A');
  });

  it('falls back to the address when nobody gave a name', () => {
    // A blank avatar is worse than the first letter of an email nobody looks at.
    session.signIn('nameless@example.com', 'a long enough password').subscribe();
    http.expectOne(`${AUTH_PATH}/login`).flush({
      accessToken: 'tok',
      expiresAt: new Date(Date.now() + 9e5).toISOString(),
      id: '2222',
      email: 'nameless@example.com',
      name: '',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.initial).toBe('N');
  });

  it('signs out from here, since this is the only place it is offered', () => {
    fixture.componentInstance.signOut();
    http.expectOne(`${AUTH_PATH}/logout`).flush({ signedOut: true });

    expect(session.isSignedIn()).toBeFalse();
  });
});
