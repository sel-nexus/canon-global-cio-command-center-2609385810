/** Present explicit server account entry with associated errors and disposable passwords. */
import { useRef, useState } from 'react';
import PropTypes from 'prop-types';

/** Render a two-field form and clear the password after every submit.
 * Args:
 *   mode: Signup or login action to expose.
 *   onSubmit: Async action returning a safe server authentication result.
 *   onModeChange: Explicit entry-mode selection.
 *   notice: Optional bootstrap or successful-registration feedback.
 * Returns:
 *   Accessible account entry form; never submits during rendering.
 */
export function AuthForm({ mode, onSubmit, onModeChange, notice = '', pending = false }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const signup = mode === 'signup';

  /** Validate an explicit submit, expose its result, and dispose of the password. */
  async function handleSubmit(event) {
    event.preventDefault();
    const credentials = { username, password };
    if (pending) return;
    const checked = !username.trim() ? { ok: false, field: 'username', message: 'Enter a username.' }
      : !password ? { ok: false, field: 'password', message: 'Enter a password.' } : { ok: true };
    setPassword('');
    let result;
    try { result = checked.ok ? await onSubmit(credentials) : checked; }
    catch { result = { ok: false, message: 'Account access failed. Try again.' }; }
    setError(result.ok ? null : result);
    if (!result.ok && result.field === 'username') usernameRef.current?.focus();
    if (!result.ok && result.field === 'password') passwordRef.current?.focus();
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Server account access</p>
      <h2 id="auth-title">{signup ? 'Create an account' : 'Log in to the command center'}</h2>
      <p className="muted" id="demo-warning">
        Accounts are stored on the server. Passwords are hashed; browser demo accounts are not imported.
        Dashboard data remains illustrative. Do not enter confidential information.
      </p>
      {notice && <p role="status" className="notice">{notice}</p>}
      <form onSubmit={handleSubmit} noValidate aria-busy={pending} aria-describedby="demo-warning">
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            ref={usernameRef}
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            required
            aria-required="true"
            aria-invalid={error?.field === 'username'}
            aria-describedby={error?.field === 'username' ? 'auth-error' : undefined}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            aria-required="true"
            aria-invalid={error?.field === 'password'}
            aria-describedby={error?.field === 'password' ? 'auth-error' : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && <p id="auth-error" className="error" role="alert">{error.message || 'Account access failed. Try again.'}</p>}
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
        </button>
      </form>
      <div className="mode-switch">
        <span className="muted">{signup ? 'Already have an account?' : 'Need an account?'}</span>
        <button className="text-button" type="button" disabled={pending} onClick={() => onModeChange(signup ? 'login' : 'signup')}>
          {signup ? 'Back to login' : 'Create an account'}
        </button>
      </div>
    </section>
  );
}

AuthForm.propTypes = {
  mode: PropTypes.oneOf(['signup', 'login']).isRequired,
  onSubmit: PropTypes.func.isRequired,
  onModeChange: PropTypes.func.isRequired,
  notice: PropTypes.string,
  pending: PropTypes.bool,
};
