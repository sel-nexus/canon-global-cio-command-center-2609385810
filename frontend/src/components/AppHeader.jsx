/** Keep brand and executive context visible without inventing notification behavior. */
import PropTypes from 'prop-types';

/** Render shared identity context and an explicit logout control when signed in. */
export function AppHeader({ username, onLogout }) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <span className="brand">Canon</span>
        <h1>Global CIO Command Center</h1>
      </div>
      {username && (
        <div className="identity">
          <div>
            <p className="role-label">Global CIO · Demo</p>
            <p className="username">{username}</p>
          </div>
          <button className="button secondary" type="button" onClick={onLogout}>Log out</button>
        </div>
      )}
    </header>
  );
}

AppHeader.propTypes = { username: PropTypes.string, onLogout: PropTypes.func };
