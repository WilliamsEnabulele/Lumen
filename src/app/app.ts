import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Paid } from './billing/paid';
import { SignIn } from './auth/sign-in';
import { Session } from './auth/session';

/**
 * What is in front of the router, and why anything is.
 *
 * Two things sit outside routing on purpose. The door, because every read on the server is
 * scoped to an owner and an app shown to nobody in particular is an app where every request
 * comes back 401 — there is no useful screen behind the gate to give an address to. And the
 * return from the payment provider, because which query parameter comes back is the provider's
 * decision rather than ours, and a route that only matches when a third party spells something
 * the way we expected is a route that strands the one person who has already paid.
 */
@Component({
  selector: 'app-root',
  imports: [Paid, SignIn, RouterOutlet],
  template: `
    @if (!session.settled()) {
      <!--
        The silent restore, still in flight. Nothing is decided yet, and showing the sign-in
        screen here would sign out everybody with a perfectly good refresh cookie for as long
        as one request takes.
      -->
      <p class="waking">Signing you back in…</p>
    } @else if (!session.isSignedIn()) {
      <lumen-sign-in />
    } @else if (paymentReference(); as reference) {
      <lumen-paid [reference]="reference" (done)="leavePayment()" />
    } @else {
      <!-- The chrome lives in the shell layout, which every routed page is a child of. -->
      <router-outlet />
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
      }

      /*
        Held back rather than shown immediately. A restore against a server on the same machine
        finishes in tens of milliseconds, and a message that appears for one frame on every
        single load is worse than a page that is briefly still — so this is invisible until the
        wait is long enough to be worth explaining.
      */
      .waking {
        margin: auto;
        color: var(--subtle-foreground);
        font-size: 14px;
        opacity: 0;
        animation: waking-surfaces 0.25s ease 600ms forwards;
      }

      @keyframes waking-surfaces {
        to {
          opacity: 1;
        }
      }

    `,
  ],
})
export class App {
  readonly session = inject(Session);
  private readonly router = inject(Router);

  /**
   * Set when this load is a return from the payment provider.
   *
   * Read from the URL first and from storage second, because which query parameter comes back
   * is the provider's decision and not ours — and a student who paid must still be shown what
   * happened if it comes back with nothing at all.
   */
  readonly paymentReference = signal<string | null>(returning());

  constructor() {
    // The access token lives in memory, so a reload loses it. The refresh cookie does not, so
    // asking once at boot is the difference between "reloading the page signs me out" and not.
    this.session.restore();
  }

  /**
   * Done looking at the payment.
   *
   * Sent to the library rather than left where they were. This load began at whatever address
   * the provider redirected to, which is not an address in this app, and leaving them on it
   * means the next reload shows the payment page again.
   */
  leavePayment(): void {
    this.paymentReference.set(null);
    void this.router.navigate(['/library']);
  }
}

function returning(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromUrl =
    params.get('paymentReference') ?? params.get('reference') ?? params.get('transactionReference');

  if (fromUrl) return fromUrl;

  // Only treated as a return when the provider actually sent them back here — otherwise a
  // stored reference would show the payment page to somebody who just opened the app.
  const looksLikeReturn =
    window.location.pathname.includes('paid') || params.has('status') || params.has('paymentStatus');

  if (!looksLikeReturn) return null;

  try {
    return localStorage.getItem('lumen.payment');
  } catch {
    return null;
  }
}
