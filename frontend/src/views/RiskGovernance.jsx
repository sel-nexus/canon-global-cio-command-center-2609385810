/** Present only the named risk measures without interpreting or calculating scores. */
import PropTypes from 'prop-types';
import { MetricCard, displayValue } from '../components/MetricCard.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { RISK_FIXTURES, RISK_METRICS } from '../data/dashboardFixtures.js';

/** Render read-only indicators and persistent limits on their meaning.
 * Args:
 *   fixtures: Supplied metrics identified by exact label and explicit display state.
 * Returns:
 *   Three informational cards; absent or invalid values remain Not specified.
 * Notes:
 *   Ignore unknown labels and accept only available, readable primitives.
 *   A supplied zero is displayed unchanged, never inferred from missing data.
 */
export default function RiskGovernance({ fixtures = RISK_FIXTURES }) {
  const metrics = Array.isArray(fixtures?.metrics) ? fixtures.metrics : [];

  return (
    <div className="strategic-content">
      <MockDataNotice>
        Missing values remain Not specified; they are not zero.
      </MockDataNotice>
      <p className="muted">
        Source and calculation are not established. Framework, severity scale and units are not specified or inferred.
      </p>
      <div className="metric-grid">
        {RISK_METRICS.map(({ label }) => {
          const metric = metrics.find((item) => item?.label === label);
          return (
            <MetricCard
              key={label}
              label={label}
              value={metric?.displayState === 'available' ? displayValue(metric.value) : null}
            />
          );
        })}
      </div>
    </div>
  );
}

RiskGovernance.propTypes = {
  fixtures: PropTypes.shape({
    metrics: PropTypes.arrayOf(PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      displayState: PropTypes.oneOf(['available', 'not-specified']).isRequired,
    })),
  }),
};
