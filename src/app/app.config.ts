import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { bearer } from './auth/bearer';

// No router yet: the app is one flow — hand over a document, then be taught. Routing arrives
// with a course library and an instructor console, not before.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Registered here rather than wrapped around each call in LumenApi. An access token
    // expires halfway through a lesson rather than between features, so recovering from that
    // cannot be something a call site has to remember — the one that forgets is the one a
    // student is sitting in front of.
    provideHttpClient(withInterceptors([bearer])),
  ],
};
