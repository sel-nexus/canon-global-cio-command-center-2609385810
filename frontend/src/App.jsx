/** Gate the local shell and mount only its selected heading; feature views are separate slices. */
import { useState } from 'react';
import { login, logout, readSession, registerAccount } from './services/localAuth.js';
import { AuthForm } from './components/AuthForm.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { DashboardTabs, DASHBOARD_VIEWS } from './components/DashboardTabs.jsx';

/** Restore demo state once and handle authentication only on explicit activation. */
export default function App() {
  const [session, setSession] = useState(readSession);
  const [mode, setMode] = useState('login');
  const [activeView, setActiveView] = useState('strategic');
  const [notice, setNotice] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const view = DASHBOARD_VIEWS.find((item) => item.key === activeView);
  const restoreNotice = session.code === 'STORAGE_UNAVAILABLE'
    ? 'Local storage is unavailable. A demo session could not be restored.'
    : session.code ? 'Saved session is damaged or unsupported. You are signed out; saved accounts have not been changed.' : '';

  /** Route successful registration to login; open the shell only after a saved login. */
  function handleSubmit(credentials) {
    const result = mode === 'signup' ? registerAccount(credentials) : login(credentials);
    if (result.ok && mode === 'signup') {
      setMode('login');
      setNotice('Demo account saved in this browser. Log in with your new credentials.');
    } else if (result.ok) {
      setSession({ signedIn: true, username: result.account.username, storageAvailable: true });
      setActiveView('strategic');
      setNotice('');
    }
    return result;
  }

  /** Keep the authenticated shell when storage refuses to clear the session. */
  function handleLogout() {
    const result = logout();
    if (!result.ok) {
      setLogoutError('The local session could not be cleared. You are still signed in. Check browser storage permissions and try again.');
      return;
    }
    setSession({ signedIn: false, storageAvailable: true });
    setMode('login');
    setNotice('Logged out. Your demo account remains in this browser.');
    setLogoutError('');
  }

  /** Select only a supported panel without persisting preferences or fetching content. */
  function selectView(key) {
    if (DASHBOARD_VIEWS.some((item) => item.key === key)) setActiveView(key);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <AppHeader username={session.signedIn ? session.username : undefined} onLogout={handleLogout} />
      <main id="main-content" tabIndex={-1}>
        {!session.signedIn ? (
          <div className="auth-layout">
            <AuthForm
              key={mode}
              mode={mode}
              onSubmit={handleSubmit}
              notice={notice || restoreNotice}
              onModeChange={(next) => { setMode(next); setNotice(''); }}
            />
          </div>
        ) : (
          <div className="dashboard-layout">
            <p className="demo-context">Local demo access · Not secure authentication. Do not enter confidential information.</p>
            {logoutError && <p role="alert" className="error">{logoutError}</p>}
            <DashboardTabs activeView={activeView} onSelect={selectView} />
            <section
              role="tabpanel"
              id={`panel-${view.key}`}
              aria-labelledby={`tab-${view.key}`}
              tabIndex={0}
              className="active-panel"
            >
              <p className="eyebrow">Command center</p>
              <h2>{view.label}</h2>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
