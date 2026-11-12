/** Compose the strategic landing content without inventing fixture data or actions. */
import { MetricCard } from '../components/MetricCard.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { ChartPanel } from '../components/ChartPanel.jsx';
import { STRATEGIC_METRICS, STRATEGIC_PERIODS, STRATEGIC_SERIES } from '../data/dashboardFixtures.js';

/** Show exactly the approved metrics, relative periods and inert named controls.
 * Returns:
 *   Strategic content inside the shell's existing named tabpanel and heading.
 */
export default function StrategicCommand() {
  return (
    <div className="strategic-content">
      <MockDataNotice>
        Values, trends and AI insights have not been specified.
      </MockDataNotice>
      <div className="metric-grid">
        {STRATEGIC_METRICS.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
      <div className="strategic-sections">
        <section>
          <h3>Strategic Priorities</h3>
          <p className="muted">Not specified.</p>
        </section>
        <section>
          <h3>Recommended Actions</h3>
          <p className="muted">Not specified.</p>
        </section>
        <section>
          <h3>Quick Actions</h3>
          <p className="muted">Labels and outcomes: Not specified.</p>
        </section>
      </div>
      <ChartPanel
        title="Twelve-Month Strategic Trends"
        description="Compare Business Impact, Risk and Innovation across twelve relative monthly periods."
        caveat="No fixture values, units, scales or calculations have been specified. Month 1–12 are relative periods, not calendar dates."
        labels={STRATEGIC_PERIODS}
        series={STRATEGIC_SERIES}
      />
      <div className="strategic-controls">
        <p id="strategic-actions-note" className="muted">These demonstration controls are inactive; no export or predictive analysis is performed.</p>
        <div className="action-buttons">
          <button type="button" className="button secondary" aria-disabled="true" aria-describedby="strategic-actions-note">Export Data</button>
          <button type="button" className="button secondary" aria-disabled="true" aria-describedby="strategic-actions-note">Predictive Analysis</button>
        </div>
      </div>
    </div>
  );
}
