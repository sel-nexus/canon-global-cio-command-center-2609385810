/** Present explicit local demo entry with associated errors and disposable passwords. */
import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { validateCredentials } from '../services/localAuth.js';

const messages = {
  REQUIRED_USERNAME: 'Enter a username.',
  REQUIRED_PASSWORD: 'Enter a password.',
  DUPLICATE_USERNAME: 'This demo username already exists. Log in instead.',
  INVALID_CREDENTIALS: 'Username or password does not match.',
  STORAGE_UNAVAILABLE: 'Local storage is unavailable. Demo access cannot persist. Check browser storage permissions and try again.',
  STORAGE_WRITE_FAILED: 'Local demo state could not be saved. Check browser storage space and try again.',
  INVALID_LOCAL_STATE: 'Saved demo data is damaged or unsupported. It has not been overwritten. Review browser storage before trying again.',
};

/** Render a two-field form and clear the password after every submit.
 * Args:
 *   mode: Signup or login action to expose.
 *   onSubmit: Synchronous action returning a local authentication result.
 *   onModeChange: Explicit entry-mode selection.
 *   notice: Optional bootstrap or successful-registration feedback.
 * Returns:
 *   Accessible demo entry form; never submits during rendering.
 */
export function AuthForm({ mode, onSubmit, onModeChange, notice = '' }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const signup = mode === 'signup';

  /** Validate an explicit submit, expose its result, and dispose of the password. */
  function handleSubmit(event) {
    event.preventDefault();
    const credentials = { username, password };
    const checked = validateCredentials(credentials);
    const result = checked.ok ? onSubmit(credentials) : checked;
    setPassword('');
    setError(result.ok ? null : result);
    if (!result.ok && result.field === 'username') usernameRef.current?.focus();
    if (!result.ok && result.field === 'password') passwordRef.current?.focus();
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Local demonstration</p>
      <h2 id="auth-title">{signup ? 'Create a demo account' : 'Log in to the command center'}</h2>
      <p className="muted" id="demo-warning">
        Demo access only. Credentials are stored unencrypted in this browser and can be inspected or edited.
        Never use a real password or confidential information.
      </p>
      {notice && <p role="status" className="notice">{notice}</p>}
      <form onSubmit={handleSubmit} noValidate aria-describedby="demo-warning">
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
        {error && <p id="auth-error" className="error" role="alert">{messages[error.code] || 'Demo access failed. Try again.'}</p>}
        <button type="submit" className="button primary">{signup ? 'Create account' : 'Log in'}</button>
      </form>
      <div className="mode-switch">
        <span className="muted">{signup ? 'Already have a local account?' : 'New to this browser?'}</span>
        <button className="text-button" type="button" onClick={() => onModeChange(signup ? 'login' : 'signup')}>
          {signup ? 'Back to login' : 'Create a demo account'}
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
};
