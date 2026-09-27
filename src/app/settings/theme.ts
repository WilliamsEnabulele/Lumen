import { Injectable, effect, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'lumen.theme';

/**
 * Which palette the app is drawn in.
 *
 * One of the few things that genuinely belongs in the browser rather than on the server: it is
 * about this screen in this room, not about the student. Somebody reading in bed on a phone
 * and at a desk in daylight wants different answers on the two devices, and a preference that
 * followed them between devices would be wrong on one of them.
 *
 * "System" is the default and removes the attribute entirely, which is what lets the media
 * query decide. An explicit choice sets it, and the stylesheet has a rule for that case in
 * both directions so the choice wins over the operating system either way.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  readonly preference = signal<ThemePreference>(remembered());

  constructor() {
    effect(() => apply(this.preference()));
  }

  set(preference: ThemePreference): void {
    this.preference.set(preference);

    try {
      localStorage.setItem(KEY, preference);
    } catch {
      // A blocked or full store costs the student their preference on the next load and
      // nothing else. It is not worth telling them about, and it is not worth failing over.
    }
  }
}

function remembered(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function apply(preference: ThemePreference): void {
  const root = document.documentElement;

  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}
