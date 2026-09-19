import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CourseSummary,
  GroundedAnswer,
  IngestionStatus,
  LessonScriptResponse,
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

  /** Hands the document over. The lesson is built in the background; poll `status`. */
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

  course(courseId: string): Observable<CourseSummary> {
    return this.http.get<CourseSummary>(`${this.base}/courses/${courseId}`).pipe(catchError(readable));
  }

  script(lessonId: string): Observable<LessonScriptResponse> {
    return this.http
      .get<LessonScriptResponse>(`${this.base}/lessons/${lessonId}/script`)
      .pipe(catchError(readable));
  }

  ask(lessonId: string, question: string, currentNodeId: string | null): Observable<GroundedAnswer> {
    return this.http
      .post<GroundedAnswer>(`${this.base}/lessons/${lessonId}/ask`, { question, currentNodeId })
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
