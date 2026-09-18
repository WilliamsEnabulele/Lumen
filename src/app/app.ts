import { Component } from '@angular/core';
import { Lesson } from './lesson/lesson';

@Component({
  selector: 'app-root',
  imports: [Lesson],
  template: '<lumen-lesson />',
})
export class App {}
