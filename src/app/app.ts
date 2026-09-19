import { Component, signal } from '@angular/core';
import { Tutor } from './tutor/tutor';
import { Upload } from './upload/upload';

@Component({
  selector: 'app-root',
  imports: [Upload, Tutor],
  template: `
    @if (courseId(); as id) {
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
}
