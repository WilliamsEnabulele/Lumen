import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { bearer } from '../auth/bearer';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideHttpClient(withInterceptors([bearer])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('draws the chrome around whatever is routed inside it', () => {
    const fixture = TestBed.createComponent(AppShell);
    fixture.detectChanges();

    // Every page is a child of this, so a page cannot be routed to without its menu — the kind
    // of thing that otherwise shows up on the one route somebody added in a hurry.
    expect(fixture.nativeElement.querySelector('lumen-side-nav')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
