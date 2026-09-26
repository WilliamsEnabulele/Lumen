import { Routes } from '@angular/router';
import { AppShell } from './layouts/app-shell';
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
  {
    // Every page is a child of the shell rather than a sibling of the bar. A page cannot then
    // be routed to without its chrome, which is the kind of thing that only shows up later,
    // on the one route somebody added in a hurry.
    path: '',
    component: AppShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'library' },
      { path: 'library', component: Library, title: 'Your courses — Lumen' },
      { path: 'new', component: Upload, title: 'New lesson — Lumen' },
      // The course id binds straight to the Tutor's required input, via withComponentInputBinding.
      { path: 'lesson/:courseId', component: Tutor, title: 'Lesson — Lumen' },
      { path: '**', redirectTo: 'library' },
    ],
  },
];
