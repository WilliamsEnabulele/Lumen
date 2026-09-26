import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBar } from './top-bar';

/**
 * The frame every signed-in page is drawn inside.
 *
 * A layout rather than something `App` renders above the outlet, because the chrome is not a
 * step in the gate — it is the shape of the app once somebody is through it. Keeping it here
 * means a page cannot accidentally be routed to without its bar, and `App` goes back to doing
 * one thing: deciding whether there is anybody to show an app to at all.
 *
 * The door and the return from the payment provider stay outside this, and outside routing
 * altogether. Neither wants a navigation bar: one is for somebody who cannot navigate yet, and
 * the other is a page a third party sent them to.
 */
@Component({
  selector: 'lumen-app-shell',
  imports: [TopBar, RouterOutlet],
  template: `
    <lumen-top-bar />
    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
      }
    `,
  ],
})
export class AppShell {}
