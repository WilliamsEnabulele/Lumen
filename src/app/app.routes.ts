import { Routes } from '@angular/router';
import { Library } from './library/library';
import { Tutor } from './tutor/tutor';
import { Upload } from './upload/upload';

/**
 * Four places, now that there is more than one course to be in.
 *
 * The app was one flow — hand over a document, then be taught — and a switch on two signals
 * was the right size for that. A library is the thing that changes it: a course you can come
 * back to needs an address, or coming back means uploading it again.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'library' },
  { path: 'library', component: Library, title: 'Your courses — Lumen' },
  { path: 'new', component: Upload, title: 'New lesson — Lumen' },
  // The course id binds straight to the Tutor's required input, via withComponentInputBinding.
  { path: 'lesson/:courseId', component: Tutor, title: 'Lesson — Lumen' },
  { path: '**', redirectTo: 'library' },
];
