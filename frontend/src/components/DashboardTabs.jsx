/** Define one allowlisted navigation model shared by the tabs and active panel. */
import { useRef } from 'react';
import PropTypes from 'prop-types';

export const DASHBOARD_VIEWS = Object.freeze([
  { key: 'strategic', label: 'Strategic Command' },
  { key: 'executive', label: 'Executive Summary' },
  { key: 'businessImpact', label: 'Business Impact' },
  { key: 'operations', label: 'Operations' },
  { key: 'riskGovernance', label: 'Risk & Governance' },
  { key: 'innovation', label: 'Innovation' },
  { key: 'partnerships', label: 'Partnerships' },
]);

/** Render automatically activated roving tabs with wrapping arrow navigation. */
export function DashboardTabs({ activeView, onSelect }) {
  const refs = useRef([]);

  /** Activate and focus an allowlisted tab on arrows, Home, or End. */
  function handleKey(event, index) {
    const last = DASHBOARD_VIEWS.length - 1;
    const destinations = {
      ArrowRight: (index + 1) % (last + 1),
      ArrowLeft: (index + last) % (last + 1),
      Home: 0,
      End: last,
    };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    const next = destinations[event.key];
    onSelect(DASHBOARD_VIEWS[next].key);
    refs.current[next]?.focus();
  }

  return (
    <nav className="dashboard-navigation" aria-label="Dashboard sections">
      <div className="dashboard-tabs" role="tablist" aria-label="Dashboard views" aria-orientation="horizontal">
        {DASHBOARD_VIEWS.map((view, index) => (
          <button
            key={view.key}
            ref={(element) => { refs.current[index] = element; }}
            type="button"
            role="tab"
            id={`tab-${view.key}`}
            aria-controls={`panel-${view.key}`}
            aria-selected={activeView === view.key}
            tabIndex={activeView === view.key ? 0 : -1}
            onClick={() => onSelect(view.key)}
            onKeyDown={(event) => handleKey(event, index)}
          >
            {view.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

DashboardTabs.propTypes = { activeView: PropTypes.string.isRequired, onSelect: PropTypes.func.isRequired };
