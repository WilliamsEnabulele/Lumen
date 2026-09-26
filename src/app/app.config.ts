import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { bearer } from './auth/bearer';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Registered here rather than wrapped around each call in LumenApi. An access token
    // expires halfway through a lesson rather than between features, so recovering from that
    // cannot be something a call site has to remember — the one that forgets is the one a
    // student is sitting in front of.
    provideHttpClient(withInterceptors([bearer])),
    // Component input binding, so a course id in the URL arrives at the Tutor's required input
    // without a resolver or a subscription in between. The id in the address bar and the id
    // being taught are then the same fact rather than two that have to be kept in step.
    provideRouter(routes, withComponentInputBinding()),
  ],
};
