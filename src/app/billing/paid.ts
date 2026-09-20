import { Component, OnDestroy, inject, input, output, signal } from '@angular/core';
import { PaymentView } from 'domain';
import { Subscription, interval, switchMap } from 'rxjs';
import { LumenApi } from '../api/lumen-api';

/** How often to ask whether the provider has told us anything yet. */
const POLL_MS = 1500;

/**
 * How long to keep asking before saying plainly that it has not arrived.
 *
 * Confirmation reaches this server as a webhook and by no other route, so there is a real gap
 * between the student finishing at the provider and this page knowing about it. Twenty seconds
 * covers the ordinary case; past that, a spinner is a lie and the honest thing is to say the
 * money is fine and the confirmation is late.
 */
const PATIENCE_MS = 20_000;

@Component({
  selector: 'lumen-paid',
  templateUrl: './paid.html',
  styleUrl: './paid.scss',
})
export class Paid implements OnDestroy {
  private readonly api = inject(LumenApi);

  readonly reference = input.required<string>();

  readonly done = output<void>();

  readonly payment = signal<PaymentView | null>(null);
  readonly error = signal<string | null>(null);
  readonly waitedTooLong = signal(false);

  private polling: Subscription | null = null;
  private startedAt = Date.now();

  constructor() {
    queueMicrotask(() => this.watch());
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** True while the provider has taken the money but told this server nothing yet. */
  get waiting(): boolean {
    const current = this.payment();
    return current === null || current.status === 'Pending';
  }

  continue(): void {
    try {
      localStorage.removeItem('lumen.payment');
    } catch {
      // Nothing to clean up if the store was never writable.
    }
    this.done.emit();
  }

  private watch(): void {
    this.stop();

    this.polling = interval(POLL_MS)
      .pipe(switchMap(() => this.api.payment(this.reference())))
      .subscribe({
        next: (payment) => {
          this.payment.set(payment);

          if (payment.status !== 'Pending') {
            this.stop();
            return;
          }

          if (Date.now() - this.startedAt > PATIENCE_MS) {
            this.stop();
            this.waitedTooLong.set(true);
          }
        },
        error: (failure: Error) => {
          this.stop();
          this.error.set(failure.message);
        },
      });
  }

  private stop(): void {
    this.polling?.unsubscribe();
    this.polling = null;
  }
}
