/** Render informational metrics without inferring values or advice. */
import PropTypes from 'prop-types';

/** Format only supplied readable primitives; invalid data stays unspecified.
 * Args:
 *   value: Supplied display value, not an input to a calculation.
 * Returns:
 *   Safe display text, including an explicitly supplied numeric zero.
 */
export function displayValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value;
  return 'Not specified';
}

/** Present a metric's value, trend and AI insight as noninteractive text.
 * Args:
 *   label, value, trend, insight: Supplied metric label and display fields.
 * Returns:
 *   An informational card with explicit missing states.
 */
export function MetricCard({ label, value, trend, insight }) {
  return (
    <article className="metric-card" aria-label={displayValue(label)}>
      <h3>{displayValue(label)}</h3>
      <dl>
        <dt>Value</dt>
        <dd className="metric-value">{displayValue(value)}</dd>
        <dt>Trend</dt>
        <dd>{displayValue(trend)}</dd>
        <dt>AI insight</dt>
        <dd>{displayValue(insight)}</dd>
      </dl>
    </article>
  );
}

MetricCard.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  trend: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  insight: PropTypes.string,
};
