import { Component, output, signal, inject, OnDestroy } from '@angular/core';
import { IngestionStatus } from 'domain';
import { Subscription, interval, switchMap } from 'rxjs';
import { LumenApi } from '../api/lumen-api';

/** How often to ask how the lesson is coming along. */
const POLL_MS = 700;

@Component({
  selector: 'lumen-upload',
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class Upload implements OnDestroy {
  private readonly api = inject(LumenApi);

  /** Fires with the course id once there is a lesson to teach. */
  readonly ready = output<string>();

  readonly status = signal<IngestionStatus | null>(null);
  readonly error = signal<string | null>(null);
  readonly dragging = signal(false);
  readonly formats = signal<string[]>([]);
  readonly fileName = signal<string | null>(null);

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
    this.fileName.set(null);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private send(file: File): void {
    this.error.set(null);
    this.fileName.set(file.name);

    this.api.upload(file).subscribe({
      next: (status) => {
        this.status.set(status);
        this.watch(status.documentId);
      },
      error: (failure: Error) => {
        this.fileName.set(null);
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
            this.ready.emit(status.courseId);
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
