import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Session } from '../auth/session';

/**
 * The bar across the top of every signed-in screen.
 *
 * It carries only what there is somewhere to go to. The design it comes from has Analytics and
 * Settings beside Library; neither exists, and a navigation item that opens an empty page is a
 * worse answer than not offering it.
 */
@Component({
  selector: 'lumen-top-bar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
})
export class TopBar {
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
