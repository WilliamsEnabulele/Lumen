import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Session } from '../auth/session';

/**
 * The menu, down the left of every signed-in screen.
 *
 * It replaced a bar across the top because the top of the screen is where the lesson needs to
 * be: a room with a status line, a canvas and a transcript is three horizontal bands already,
 * and a fourth above them pushes the canvas below the fold on a laptop. Down the side it costs
 * width, which there is more of, and it leaves room for the delivery modes to be listed rather
 * than hidden behind a control.
 *
 * It still carries only what there is somewhere to go to.
 */
@Component({
  selector: 'lumen-side-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './side-nav.html',
  styleUrl: './side-nav.scss',
})
export class SideNav {
  readonly session = inject(Session);

  /** One letter for the avatar. Falls back to the address when nobody gave a name. */
  get initial(): string {
    const student = this.session.student();
    const source = student?.name?.trim() || student?.email?.trim() || '';
    return source.charAt(0).toUpperCase() || '?';
  }

  signOut(): void {
    this.session.signOut().subscribe();
  }
}
