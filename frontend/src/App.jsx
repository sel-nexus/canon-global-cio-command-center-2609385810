/** Gate server access and isolate the selected dashboard content from the shared shell. */
import { useRef, useState } from 'react';
import { AssistantPanel } from './components/AssistantPanel.jsx';
import { ASSISTANT_CHIPS } from './data/assistantResponses.js';
import { useServerAssistant } from './hooks/useServerAssistant.js';
import { useServerAuth } from './hooks/useServerAuth.js';
import { AuthForm } from './components/AuthForm.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { DashboardTabs, DASHBOARD_VIEWS } from './components/DashboardTabs.jsx';
import { PanelErrorBoundary } from './components/PanelErrorBoundary.jsx';
import StrategicCommand from './views/StrategicCommand.jsx';
import ExecutiveSummary from './views/ExecutiveSummary.jsx';
import BusinessImpact from './views/BusinessImpact.jsx';
import Operations from './views/Operations.jsx';
import RiskGovernance from './views/RiskGovernance.jsx';
import Innovation from './views/Innovation.jsx';
import Partnerships from './views/Partnerships.jsx';

/** Restore server identity and handle authentication only on explicit activation. */
export default function App() {
  const auth = useServerAuth();
  const session = { signedIn: Boolean(auth.account), username: auth.account?.username };
  const [mode, setMode] = useState('login');
  const [activeView, setActiveView] = useState('strategic');
  const [notice, setNotice] = useState('');
  const assistant = useServerAssistant(auth.account, auth.token, auth.expireSession);
  const returnFocus = useRef(null);
  const view = DASHBOARD_VIEWS.find((item) => item.key === activeView);
  /** Route successful server registration to login without automatic account migration. */
  async function handleSubmit(credentials) {
    const result = await auth.submit(mode, credentials);
    if (result.ok && mode === 'signup') {
      setMode('login');
      setNotice('Account saved on the server. Log in with your new credentials.');
    } else if (result.ok) {
      setActiveView('strategic');
      setNotice('');
    }
    return result;
  }

  /** Close the local assistant only after the server session is revoked. */
  async function handleLogout() {
    const result = await auth.logout();
    if (!result.ok) return;
    assistant.closePanel();
    setMode('login');
    setNotice('Logged out. Your account remains on the server.');
  }

  /** Prefill an approved chip and request its fixed narrative from the server. */
  function activateChip(keyword, trigger) {
    const chip = ASSISTANT_CHIPS.find((item) => item.keyword === keyword);
    if (!chip) return;
    returnFocus.current = trigger;
    assistant.respond(chip.label);
  }

  /** Select only a supported panel without persisting preferences or fetching content. */
  function selectView(key) {
    if (DASHBOARD_VIEWS.some((item) => item.key === key)) setActiveView(key);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <AppHeader username={session.signedIn ? session.username : undefined} onLogout={handleLogout} pending={auth.pending} />
      <main id="main-content" tabIndex={-1}>
        {auth.error && <p role="alert" className="error">{auth.error}</p>}
        {auth.loading ? (
          <p role="status" className="notice">Checking server session…</p>
        ) : !session.signedIn ? (
          <div className="auth-layout">
            <AuthForm
              key={mode}
              mode={mode}
              onSubmit={handleSubmit}
              notice={notice}
              pending={auth.pending}
              onModeChange={(next) => { setMode(next); setNotice(''); }}
            />
          </div>
        ) : (
          <div className="dashboard-layout">
            <p className="demo-context">Server account access · Dashboard fixtures and assistant remain illustrative. Do not enter confidential information.</p>
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
              <PanelErrorBoundary key={activeView}>
                {activeView === 'strategic' && (
                  <StrategicCommand onAssistantChip={activateChip} />
                )}
                {activeView === 'executive' && (
                  <ExecutiveSummary />
                )}
                {activeView === 'businessImpact' && (
                  <BusinessImpact />
                )}
                {activeView === 'operations' && (
                  <Operations />
                )}
                {activeView === 'riskGovernance' && (
                  <RiskGovernance />
                )}
                {activeView === 'innovation' && (
                  <Innovation />
                )}
                {activeView === 'partnerships' && (
                  <Partnerships />
                )}
              </PanelErrorBoundary>
            </section>
          </div>
        )}
      </main>
      {session.signedIn && (
        <AssistantPanel
          {...assistant}
          returnFocus={returnFocus}
          onToggle={(trigger) => {
            returnFocus.current = trigger;
            assistant.openPanel();
          }}
          onClose={assistant.closePanel}
          onInput={assistant.setInput}
          onSubmit={() => assistant.respond(assistant.input)}
          onRetry={assistant.retry}
        />
      )}
    </div>
  );
}
