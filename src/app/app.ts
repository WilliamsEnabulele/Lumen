import { Component, signal } from '@angular/core';
import { Paid } from './billing/paid';
import { Tutor } from './tutor/tutor';
import { Upload } from './upload/upload';

/**
 * Which of the three things the app is doing.
 *
 * Deliberately a switch rather than a router: there are three states, one of them is reached
 * by being sent back from a payment provider, and a router would add a dependency and a set of
 * URLs to maintain for a decision this small.
 */
@Component({
  selector: 'app-root',
  imports: [Upload, Tutor, Paid],
  template: `
    @if (paymentReference(); as reference) {
      <lumen-paid [reference]="reference" (done)="paymentReference.set(null)" />
    } @else if (courseId(); as id) {
      <lumen-tutor [courseId]="id" />
    } @else {
      <lumen-upload (ready)="courseId.set($event)" />
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
      }
    `,
  ],
})
export class App {
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
