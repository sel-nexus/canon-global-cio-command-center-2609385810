/** Present business indicators and separate value cards without computing outcomes. */
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ChartPanel } from '../components/ChartPanel.jsx';
import { MetricCard, displayValue } from '../components/MetricCard.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { BUSINESS_CHART_LABELS, BUSINESS_FIXTURES, BUSINESS_METRICS } from '../data/dashboardFixtures.js';

/** Accept only a supplied nonblank category identity. */
function hasLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Render fixed indicators with equivalent text and three distinct value cards.
 * Args:
 *   fixtures: Metrics with label, value and displayState; labels as categories;
 *     charts with label, displayState and category-aligned numeric data.
 * Returns:
 *   Read-only illustrative content with unavailable states for malformed inputs.
 * Notes:
 *   Reject a malformed category list as a whole to preserve value alignment.
 *   Ignore unknown indicators and never derive card values from charts.
 */
export default function BusinessImpact({ fixtures = BUSINESS_FIXTURES }) {
  const data = useMemo(() => {
    const metrics = Array.isArray(fixtures?.metrics) ? fixtures.metrics : [];
    const labels = Array.isArray(fixtures?.labels) && fixtures.labels.every(hasLabel)
      ? fixtures.labels : [];
    const charts = Array.isArray(fixtures?.charts) ? fixtures.charts : [];
    const series = BUSINESS_CHART_LABELS.map((label) => {
      const indicator = charts.find((item) => item?.label === label);
      return {
        label,
        data: labels.map((_, index) => {
          const value = Array.isArray(indicator?.data) ? indicator.data[index] : null;
          return indicator?.displayState === 'available' && typeof value === 'number' && Number.isFinite(value)
            ? value : null;
        }),
      };
    });
    return { metrics, labels, series };
  }, [fixtures]);

  return (
    <div className="strategic-content">
      <MockDataNotice>
        Business values and categories are shown only when supplied. Missing information is Not specified.
      </MockDataNotice>
      <ChartPanel
        title="Business Value Indicators"
        description="Compare supplied Revenue, Cost Avoidance and ROI indicators. The textual data preserves the same categories and values."
        caveat="Units, dates, formulas and attribution are not specified or inferred. Missing values are not zero."
        type="bar"
        labels={data.labels}
        series={data.series}
      />
      <div className="metric-grid">
        {BUSINESS_METRICS.map(({ label }) => {
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
    </div>
  );
}

BusinessImpact.propTypes = {
  fixtures: PropTypes.object,
};
