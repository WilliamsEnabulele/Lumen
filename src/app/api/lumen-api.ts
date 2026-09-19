import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ConceptProgress, IngestionStatus, SessionStarted, TurnTaken } from 'domain';
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
 * Errors reach the student as a sentence, not a status code. The server already writes its
 * refusals for a person to read, so those are passed through rather than replaced.
 */
function readable(error: HttpErrorResponse): Observable<never> {
  if (error.status === 0) {
    return throwError(() => new Error('Could not reach the server. Is the API running?'));
  }
  const message = typeof error.error?.error === 'string' ? error.error.error : null;
  return throwError(() => new Error(message ?? 'Something went wrong on the server.'));
}
