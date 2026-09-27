import { Component, inject } from '@angular/core';
import { Session } from '../auth/session';
import { Theme, ThemePreference } from './theme';

/**
 * The settings there actually are.
 *
 * Two of them, because two is what exists. A settings page padded out with switches that do
 * nothing is worse than a short one: it teaches the student that this screen is where changes
 * go to be ignored.
 */
@Component({
  selector: 'lumen-settings',
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly session = inject(Session);
  readonly theme = inject(Theme);

  readonly choices: readonly { value: ThemePreference; label: string; detail: string }[] = [
    { value: 'system', label: 'Match my device', detail: 'Follows the light or dark setting of whatever you are reading on.' },
    { value: 'light', label: 'Light', detail: 'Always light, whatever the device says.' },
    { value: 'dark', label: 'Dark', detail: 'Always dark, whatever the device says.' },
  ];

  signOut(): void {
    this.session.signOut().subscribe();
  }
}
