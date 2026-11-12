/** Keep brand and executive context visible without inventing notification behavior. */
import PropTypes from 'prop-types';

/** Render shared identity context and an explicit logout control when signed in. */
export function AppHeader({ username, onLogout, pending = false }) {
  const initials = username?.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase();

  return (
    <header className="app-header">
      <div className="brand-block">
        <span className="brand">Canon</span>
        <h1>Global CIO Command Center</h1>
      </div>
      {username && (
        <div className="identity">
          <span className="username" role="img" aria-label={`${username} initials avatar`}>
            {initials}
          </span>
          <div>
            <p className="role-label">Global CIO · Demo</p>
            <p className="username">{username}</p>
            <p className="role-label">Notifications unavailable in demo</p>
          </div>
          <button className="button secondary" type="button" onClick={onLogout} disabled={pending}>
            {pending ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      )}
    </header>
  );
}

AppHeader.propTypes = { username: PropTypes.string, onLogout: PropTypes.func, pending: PropTypes.bool };
