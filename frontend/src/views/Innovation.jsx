/** Present only supplied innovation measures and portfolio distribution data. */
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ChartPanel } from '../components/ChartPanel.jsx';
import { MetricCard, displayValue } from '../components/MetricCard.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { INNOVATION_FIXTURES, INNOVATION_METRICS } from '../data/dashboardFixtures.js';

/** @typedef {{metrics?: Array, labels?: string[], distribution?: {displayState?: string, data?: Array}}} InnovationFixture */

/** Render fixed cards and category-aligned distribution with persistent text.
 * Args:
 *   fixtures: Supplied measures and category-aligned distribution; only entries
 *     explicitly marked available can display values.
 * Returns:
 *   Read-only content preserving gaps, with no inferred categories or totals.
 * Notes:
 *   Reject malformed category lists as a whole to avoid shifting values.
 * @param {{fixtures?: InnovationFixture}} props Supplied illustrative fixtures.
 * @returns {import('react').ReactElement} Innovation content.
 */
export default function Innovation({ fixtures = INNOVATION_FIXTURES }) {
  const data = useMemo(() => {
    const metrics = Array.isArray(fixtures?.metrics) ? fixtures.metrics : [];
    const labels = Array.isArray(fixtures?.labels)
      && Array.from(fixtures.labels).every((label) => typeof label === 'string' && label.trim())
      ? fixtures.labels : [];
    const distribution = fixtures?.distribution;
    const values = labels.map((_, index) => {
      const value = Array.isArray(distribution?.data) ? distribution.data[index] : null;
      return distribution?.displayState === 'available'
        && typeof value === 'number' && Number.isFinite(value) ? value : null;
    });
    return { metrics, labels, series: [{ label: 'Value', data: values }], hasData: values.some((value) => value !== null) };
  }, [fixtures]);

  return (
    <div className="strategic-content">
      <MockDataNotice>
        Innovation measures are shown only when supplied. Units, definitions and calculations are not specified or inferred.
      </MockDataNotice>
      <div className="metric-grid">
        {INNOVATION_METRICS.map(({ label }) => {
          const metric = data.metrics.find((item) => item?.label === label);
          return (
            <MetricCard
              key={label}
              label={label}
              value={metric?.displayState === 'available' ? displayValue(metric.value) : null}
            />
          );
        })}
      </div>
      {!data.hasData && (
        <p className="muted">illustrative domain data and values have not been specified</p>
      )}
      <ChartPanel
        title="Innovation Portfolio Distribution"
        description="Compare supplied portfolio categories and distribution values. The textual data preserves the same categories, values and gaps."
        caveat="Portfolio taxonomy, units and calculations are not specified or inferred. Missing values are not zero."
        type="bar"
        labels={data.labels}
        series={data.series}
      />
    </div>
  );
}

Innovation.propTypes = {
  fixtures: PropTypes.object,
};
