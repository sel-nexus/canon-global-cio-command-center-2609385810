/** Present a floating, non-modal disclosure for fixed local demo responses. */
import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { ASSISTANT_DISCLOSURE } from '../data/assistantResponses.js';

/** Keep dashboard controls available while exposing prompt, history and notices.
 * Args:
 *   props: Shell-owned state, explicit callbacks and focus restoration target.
 * Returns:
 *   A toggle and an optional named non-modal region, without persistence on render.
 */
export function AssistantPanel({ open, input, messages, prompt, error = '', loading = false, pending = false, focusRequest, returnFocus, onToggle, onClose, onInput, onSubmit, onRetry }) {
  const inputRef = useRef(null);
  const toggleRef = useRef(null);

  /** Close the disclosure and return to its latest available activation control. */
  function close() {
    onClose();
    const target = returnFocus.current;
    (target?.isConnected ? target : toggleRef.current)?.focus();
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, focusRequest]);

  useEffect(() => {
    if (!open) return undefined;
    /** Handle Escape without trapping focus or locking dashboard scrolling. */
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  return (
    <aside className={`assistant-disclosure${open ? " is-open" : ""}`} aria-label="Local assistant controls">
      {open && (
        <section id="assistant-panel" className="assistant-panel" aria-labelledby="assistant-title" aria-describedby="assistant-disclosure">
          <div className="assistant-heading">
            <h2 id="assistant-title">Local assistant</h2>
            <button type="button" className="button secondary" onClick={close}>
              Close assistant
            </button>
          </div>
          <p id="assistant-disclosure" className="muted">{ASSISTANT_DISCLOSURE.replace('Local rule-based', 'Server rule-based')}</p>
          <p className="muted">Non-modal panel. Dashboard controls remain available. Escape closes this panel.</p>
          <div className="assistant-history" role="log" aria-label="Assistant response history" aria-live="polite" tabIndex={0}>
            {messages.length === 0 ? (
              <p>No saved responses yet.</p>
            ) : (
              <ol>
                {messages.map((message) => (
                  <li key={message.id}>
                    {message.text}
                  </li>
                ))}
              </ol>
            )}
          </div>
          {prompt && <p className="assistant-prompt">Current prompt: {prompt}</p>}
          {loading && <p role="status" className="notice">Loading server history…</p>}
          {pending && <p role="status" className="notice">Saving server response…</p>}
          {error && (
            <div>
              <p role="alert" className="error">{error}</p>
              <button type="button" className="button secondary" onClick={onRetry} disabled={loading || pending}>
                Retry server history
              </button>
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
            <div className="field">
              <label htmlFor="assistant-input">Assistant prompt</label>
              <input
                id="assistant-input"
                name="assistant-prompt"
                type="text"
                autoComplete="off"
                ref={inputRef}
                value={input}
                onChange={(event) => onInput(event.target.value)}
                aria-describedby="assistant-disclosure"
              />
            </div>
            <button type="submit" className="button primary" disabled={loading || pending}>
              Get local response
            </button>
          </form>
        </section>
      )}
      <button
        ref={toggleRef}
        type="button"
        className="button secondary assistant-toggle"
        aria-expanded={open}
        aria-controls="assistant-panel"
        onClick={(event) => { if (open) close(); else onToggle(event.currentTarget); }}
      >
        {open ? 'Hide local assistant' : 'Open local assistant'}
      </button>
    </aside>
  );
}

AssistantPanel.propTypes = {
  open: PropTypes.bool.isRequired,
  input: PropTypes.string.isRequired,
  messages: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['assistant']).isRequired,
    text: PropTypes.string.isRequired,
    created_at: PropTypes.string.isRequired,
  })).isRequired,
  prompt: PropTypes.string.isRequired,
  error: PropTypes.string,
  loading: PropTypes.bool,
  pending: PropTypes.bool,
  onRetry: PropTypes.func,
  focusRequest: PropTypes.number.isRequired,
  returnFocus: PropTypes.shape({ current: PropTypes.any }).isRequired,
  onToggle: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onInput: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
};
