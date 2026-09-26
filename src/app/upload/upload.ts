import { Component, signal, inject, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Paywall } from '../billing/paywall';
import { IngestionStatus } from 'domain';
import { Subscription, interval, switchMap } from 'rxjs';
import { LumenApi, PaywallError } from '../api/lumen-api';

/** How often to ask how the lesson is coming along. */
const POLL_MS = 700;

@Component({
  selector: 'lumen-upload',
  imports: [Paywall],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class Upload implements OnDestroy {
  private readonly api = inject(LumenApi);
  private readonly router = inject(Router);

  readonly status = signal<IngestionStatus | null>(null);
  readonly error = signal<string | null>(null);
  readonly dragging = signal(false);
  readonly formats = signal<string[]>([]);
  readonly fileName = signal<string | null>(null);

  /**
   * Set when the month's free document is already spent. Held apart from `error` because it is
   * not one: nothing failed, and the two want completely different words and buttons.
   */
  readonly paywalled = signal<PaywallError | null>(null);

  private polling: Subscription | null = null;

  constructor() {
    this.api.supportedFormats().subscribe({
      next: (response) => this.formats.set(response.supported),
      error: () => this.formats.set([]),
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.send(file);
  }

  onPick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.send(file);
  }

  retry(): void {
    this.stopPolling();
    this.status.set(null);
    this.error.set(null);
    this.paywalled.set(null);
    this.fileName.set(null);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private send(file: File): void {
    this.error.set(null);
    this.paywalled.set(null);
    this.fileName.set(file.name);

    this.api.upload(file).subscribe({
      next: (status) => {
        this.status.set(status);
        this.watch(status.documentId);
      },
      error: (failure: Error) => {
        this.fileName.set(null);

        // Being out of free uploads is a choice to offer, not a failure to report.
        if (failure instanceof PaywallError) {
          this.paywalled.set(failure);
          return;
        }

        this.error.set(failure.message);
      },
    });
  }

  /**
   * Stages, not a percentage we invented. Reading a document and working out what it teaches
   * takes as long as it takes, and a progress bar that lies is one a student catches.
   */
  private watch(documentId: string): void {
    this.stopPolling();
    this.polling = interval(POLL_MS)
      .pipe(switchMap(() => this.api.status(documentId)))
      .subscribe({
        next: (status) => {
          this.status.set(status);
          if (status.failed) {
            this.stopPolling();
            this.error.set(status.message);
            return;
          }
          if (status.ready) {
            this.stopPolling();
            // Straight into the lesson, at its own address. Going back afterwards lands on the
            // course rather than on an upload form with the document already spent.
            void this.router.navigate(['/lesson', status.courseId]);
          }
        },
        error: (failure: Error) => {
          this.stopPolling();
          this.error.set(failure.message);
        },
      });
  }

  private stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
  }
}
