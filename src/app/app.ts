import { Component, inject, signal } from '@angular/core';
import { Paid } from './billing/paid';
import { SignIn } from './auth/sign-in';
import { Session } from './auth/session';
import { Tutor } from './tutor/tutor';
import { Upload } from './upload/upload';

/**
 * Which of the three things the app is doing, once there is somebody to do it for.
 *
 * Deliberately a switch rather than a router: there are three states, one of them is reached
 * by being sent back from a payment provider, and a router would add a dependency and a set of
 * URLs to maintain for a decision this small.
 *
 * In front of all three is the door. Every read on the server is scoped to an owner, so an app
 * shown to nobody in particular is an app where every request comes back 401 — the gate is
 * here rather than at each call site because there is no useful screen behind it.
 */
@Component({
  selector: 'app-root',
  imports: [Upload, Tutor, Paid, SignIn],
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
    } @else {
      @if (paymentReference(); as reference) {
        <lumen-paid [reference]="reference" (done)="paymentReference.set(null)" />
      } @else if (courseId(); as id) {
        <lumen-tutor [courseId]="id" />
      } @else {
        <header class="account">
          <span class="who">{{ session.student()?.name || session.student()?.email }}</span>
          <button class="ghost" type="button" (click)="signOut()">Sign out</button>
        </header>
        <lumen-upload (ready)="courseId.set($event)" />
      }
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

      /*
        Only over the upload screen. The tutor view is a room with a bar of its own, and two
        bars stacked at the top of a lesson is one more than anybody needs while being taught.
      */
      .account {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        padding: 12px 20px;
      }

      .who {
        font-size: 13px;
        color: var(--subtle-foreground);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ghost {
        border: 0;
        background: none;
        color: var(--muted-foreground);
        font-size: 13px;
        padding: 4px 6px;
      }
      .ghost:hover {
        color: var(--foreground);
      }
    `,
  ],
})
export class App {
  readonly session = inject(Session);

  /** Set once a document has become a lesson. Until then there is nothing to teach. */
  readonly courseId = signal<string | null>(null);

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

  signOut(): void {
    // Cleared here and not only in the session, because a course id is one student's. Leaving
    // it set would drop whoever signs in next straight into the last person's lesson — and the
    // server would refuse every request in it, which looks like a broken app rather than the
    // sign-out that actually happened.
    this.courseId.set(null);
    this.paymentReference.set(null);

    this.session.signOut().subscribe();
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
