/** Gate local access and isolate the selected dashboard content from the shared shell. */
import { useRef, useState } from 'react';
import { AssistantPanel } from './components/AssistantPanel.jsx';
import { ASSISTANT_CHIPS, ASSISTANT_RESPONSES } from './data/assistantResponses.js';
import { readAssistantMessages, persistAssistantMessages, resolveAssistantPrompt } from './services/localAssistant.js';
import { login, logout, readSession, registerAccount } from './services/localAuth.js';
import { AuthForm } from './components/AuthForm.jsx';
import { AppHeader } from './components/AppHeader.jsx';
import { DashboardTabs, DASHBOARD_VIEWS } from './components/DashboardTabs.jsx';
import { PanelErrorBoundary } from './components/PanelErrorBoundary.jsx';
import StrategicCommand from './views/StrategicCommand.jsx';
import ExecutiveSummary from './views/ExecutiveSummary.jsx';
import BusinessImpact from './views/BusinessImpact.jsx';
import Operations from './views/Operations.jsx';
import RiskGovernance from './views/RiskGovernance.jsx';

/** Restore demo state once and handle authentication only on explicit activation. */
export default function App() {
  const [session, setSession] = useState(readSession);
  const [mode, setMode] = useState('login');
  const [activeView, setActiveView] = useState('strategic');
  const [notice, setNotice] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [assistant, setAssistant] = useState(() => {
    const restored = readAssistantMessages();
    return {
      open: false, input: '', prompt: '', messages: restored.messages, focusRequest: 0,
      notice: restored.available ? '' : 'Saved assistant history is unavailable or unsupported. No saved data was changed.',
    };
  });
  const returnFocus = useRef(null);
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
    setAssistant((current) => ({ ...current, open: false, input: '', prompt: '' }));
    setMode('login');
    setNotice('Logged out. Your demo account remains in this browser.');
    setLogoutError('');
  }

  /** Append a response after activation, retaining memory even when saving fails.
   * Args:
   *   prompt: Current user text, kept in memory only.
   *   text: Fixed local response selected by a chip or resolver.
   */
  function respond(prompt, text) {
    const nextId = assistant.messages.reduce((largest, message) => Math.max(largest, Number(message.id.slice(6))), 0) + 1;
    const messages = [...assistant.messages, {
      id: `local-${nextId}`, role: 'assistant', text, createdAt: new Date().toISOString(),
    }];
    const result = persistAssistantMessages(messages);
    setAssistant((current) => ({
      ...current, open: true, input: prompt, prompt, messages,
      notice: result.ok ? '' : 'This response remains available now, but could not be saved and will not survive reload.',
    }));
  }

  /** Open and prefill only an approved chip, bypassing general prompt ambiguity.
   * Args:
   *   keyword: Approved chip mapping.
   *   trigger: Activated button to receive focus when closed.
   */
  function activateChip(keyword, trigger) {
    const chip = ASSISTANT_CHIPS.find((item) => item.keyword === keyword);
    if (!chip) return;
    returnFocus.current = trigger;
    respond(chip.label, ASSISTANT_RESPONSES[keyword]);
    setAssistant((current) => ({ ...current, focusRequest: current.focusRequest + 1 }));
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
            setAssistant((current) => ({ ...current, open: true }));
          }}
          onClose={() => setAssistant((current) => ({ ...current, open: false }))}
          onInput={(input) => setAssistant((current) => ({ ...current, input }))}
          onSubmit={() => respond(assistant.input, resolveAssistantPrompt(assistant.input).text)}
        />
      )}
    </div>
  );
}
