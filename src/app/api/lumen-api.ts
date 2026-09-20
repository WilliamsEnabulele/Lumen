import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ConceptProgress,
  EntitlementView,
  IngestionStatus,
  PaymentView,
  PlanView,
  SessionStarted,
  StartedPayment,
  TurnTaken,
} from 'domain';
import { Observable, catchError, throwError } from 'rxjs';

/** Everything the student app asks the backend for. One place, so the contract has one owner. */
@Injectable({ providedIn: 'root' })
export class LumenApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  supportedFormats(): Observable<{ supported: string[] }> {
    return this.http.get<{ supported: string[] }>(`${this.base}/formats`).pipe(catchError(readable));
  }

  /** Hands the document over. The model reads it in the background; poll `status`. */
  upload(file: File): Observable<IngestionStatus> {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<IngestionStatus>(`${this.base}/courses`, body).pipe(catchError(readable));
  }

  status(documentId: string): Observable<IngestionStatus> {
    return this.http
      .get<IngestionStatus>(`${this.base}/documents/${documentId}/status`)
      .pipe(catchError(readable));
  }

  startSession(courseId: string): Observable<SessionStarted> {
    return this.http
      .post<SessionStarted>(`${this.base}/sessions`, { courseId })
      .pipe(catchError(readable));
  }

  /**
   * One turn of the conversation. `said` is what the student just said, or null when the tutor
   * is simply carrying on — the server decides what the turn is for either way.
   */
  turn(sessionId: string, said: string | null): Observable<TurnTaken> {
    return this.http
      .post<TurnTaken>(`${this.base}/sessions/${sessionId}/turn`, { said })
      .pipe(catchError(readable));
  }

  plans(): Observable<readonly PlanView[]> {
    return this.http.get<readonly PlanView[]>(`${this.base}/plans`).pipe(catchError(readable));
  }

  entitlement(): Observable<EntitlementView> {
    return this.http.get<EntitlementView>(`${this.base}/entitlement`).pipe(catchError(readable));
  }

  /**
   * Starts a payment and returns where to send the student.
   *
   * The plan code goes up; the price does not. What a plan costs is the server's to state, and
   * a price the client can name is a price the client will name.
   */
  startPayment(planCode: string, customerName: string, customerEmail: string): Observable<StartedPayment> {
    return this.http
      .post<StartedPayment>(`${this.base}/payments`, { planCode, customerName, customerEmail })
      .pipe(catchError(readable));
  }

  /**
   * What the server has been told about a payment.
   *
   * It reports rather than checks: the server is confirmed by the provider's webhook and
   * nothing else, so a payment can legitimately still read as pending for a few seconds after
   * the student is sent back here. That is the truth and the page says so.
   */
  payment(reference: string): Observable<PaymentView> {
    return this.http.get<PaymentView>(`${this.base}/payments/${reference}`).pipe(catchError(readable));
  }

  /**
   * What the server believes the student knows, and the answers it believes it from.
   *
   * Fetched rather than accumulated on the client. The belief is computed server-side from
   * every answer ever marked, and a second copy assembled here from the turns this tab
   * happened to see would disagree with it the moment anyone reloads.
   */
  progress(sessionId: string): Observable<readonly ConceptProgress[]> {
    return this.http
      .get<readonly ConceptProgress[]>(`${this.base}/sessions/${sessionId}/progress`)
      .pipe(catchError(readable));
  }
}

/**
 * Out of free uploads.
 *
 * A distinct type rather than a message to match on, because this is the one refusal that is
 * not a failure — nothing went wrong, the student simply has to choose something. Rendering it
 * as an error next to a "try again" button would be telling them to retry an action that
 * cannot succeed.
 */
export class PaywallError extends Error {
  constructor(
    message: string,
    readonly resetsAt: string | null,
  ) {
    super(message);
    this.name = 'PaywallError';
  }
}

/**
 * Errors reach the student as a sentence, not a status code. The server already writes its
 * refusals for a person to read, so those are passed through rather than replaced.
 */
function readable(error: HttpErrorResponse): Observable<never> {
  if (error.status === 0) {
    return throwError(() => new Error('Could not reach the server. Is the API running?'));
  }

  const message = typeof error.error?.error === 'string' ? error.error.error : null;

  if (error.status === 402) {
    const resetsAt = typeof error.error?.freeAllowanceResetsAt === 'string'
      ? error.error.freeAllowanceResetsAt
      : null;
    return throwError(() => new PaywallError(message ?? 'This needs a subscription.', resetsAt));
  }

  return throwError(() => new Error(message ?? 'Something went wrong on the server.'));
}
