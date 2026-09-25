import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Session } from './session';

/** Which of the two things this screen is doing. */
type Mode = 'in' | 'up';

/**
 * The door.
 *
 * One screen for both signing in and signing up, because they differ by one field and a verb,
 * and a student who picked the wrong one should be able to change their mind without losing
 * what they have typed.
 *
 * It validates almost nothing. The rules about what an email looks like and how long a
 * password has to be live on the server, which already writes its refusals as sentences for a
 * person to read — a second copy of them here would be a second copy to keep in step, and the
 * copy that drifts is always the one the student is looking at.
 */
@Component({
  selector: 'lumen-sign-in',
  imports: [FormsModule],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
})
export class SignIn {
  private readonly session = inject(Session);

  readonly mode = signal<Mode>('in');
  readonly email = signal('');
  readonly password = signal('');
  readonly name = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly isSignUp = computed(() => this.mode() === 'up');

  /**
   * Blank fields are the one thing refused here rather than at the server.
   *
   * Not because the server would get it wrong, but because a round trip to be told to fill in
   * the form is a round trip that also spends one of ten attempts a minute.
   */
  readonly canSubmit = computed(
    () => !this.busy() && this.email().trim().length > 0 && this.password().length > 0,
  );

  switchTo(mode: Mode): void {
    this.mode.set(mode);
    // The refusal belonged to the other form. Leaving "there is already an account with that
    // address" on screen under a "Sign in" button reads as though signing in had just failed.
    this.error.set(null);
  }

  submit(): void {
    if (!this.canSubmit()) return;

    this.busy.set(true);
    this.error.set(null);

    const email = this.email().trim();
    const attempt = this.isSignUp()
      ? this.session.signUp(email, this.password(), this.name().trim())
      : this.session.signIn(email, this.password());

    attempt.subscribe({
      // Nothing is emitted from here. The session now holds a student, and the app is watching
      // that signal — this screen is replaced rather than navigating away from itself. The
      // password is dropped because it has done its job and there is no reason for it to still
      // be in a field, or in this object, a second later.
      next: () => this.password.set(''),
      error: (failure: Error) => {
        this.busy.set(false);
        // Deliberately left in the box. Most failures here are one wrong character, and
        // emptying the field makes the student retype the whole thing to fix it — while doing
        // nothing about the one case it looks like it is for, since somebody guessing at an
        // account is not inconvenienced by having to type again. Rate limiting is what stops
        // that, and it is on the server where it cannot be skipped.
        this.error.set(failure.message);
      },
    });
  }
}
