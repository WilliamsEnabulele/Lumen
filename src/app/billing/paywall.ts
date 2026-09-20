import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlanView } from 'domain';
import { LumenApi } from '../api/lumen-api';

/**
 * The moment the free document is spent.
 *
 * Written as a choice rather than a failure. Nothing went wrong — the student used what they
 * were given and there is a second thing they can do — so there is no "try again", because
 * trying again is the one action guaranteed not to work.
 */
@Component({
  selector: 'lumen-paywall',
  imports: [FormsModule],
  templateUrl: './paywall.html',
  styleUrl: './paywall.scss',
})
export class Paywall {
  private readonly api = inject(LumenApi);

  readonly reason = input.required<string>();
  /** When the free allowance comes back, when the server said. */
  readonly resetsAt = input<string | null>(null);

  readonly dismissed = output<void>();

  readonly plans = signal<readonly PlanView[]>([]);
  readonly email = signal('');
  readonly name = signal('');
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.plans().subscribe({
      next: (plans) => this.plans.set(plans),
      error: () => this.plans.set([]),
    });
  }

  /** The free allowance date, as a person would say it. */
  get comesBack(): string | null {
    const at = this.resetsAt();
    if (!at) return null;

    const when = new Date(at);
    return Number.isNaN(when.getTime())
      ? null
      : when.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }

  subscribe(plan: PlanView): void {
    const email = this.email().trim();
    if (!email.includes('@')) {
      this.error.set('An email address is needed — it is where the receipt goes.');
      return;
    }

    this.sending.set(true);
    this.error.set(null);

    this.api.startPayment(plan.code, this.name().trim() || 'Lumen student', email).subscribe({
      next: (started) => {
        // Kept so the student can be shown what happened when they come back, even if the
        // provider returns them without the reference in the URL.
        try {
          localStorage.setItem('lumen.payment', started.reference);
        } catch {
          // A blocked or full store is not a reason to stop a payment. The return page falls
          // back to the reference in the URL.
        }
        window.location.href = started.checkoutUrl;
      },
      error: (failure: Error) => {
        this.sending.set(false);
        this.error.set(failure.message);
      },
    });
  }
}
