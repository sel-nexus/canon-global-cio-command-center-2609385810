/** Present partnership fixtures as read-only information, never partner integration. */
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ChartPanel } from '../components/ChartPanel.jsx';
import { MetricCard, displayValue } from '../components/MetricCard.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { PARTNERSHIP_CHART_LABELS, PARTNERSHIP_FIXTURES, PARTNERSHIP_METRICS } from '../data/dashboardFixtures.js';

const TIMELINE_OPTIONS = {
  scales: {
    x: { title: { display: true, text: 'Time' } },
    y: { title: { display: true, text: 'Investment / Value' } },
  },
};

/** Accept supplied time identities without shifting the associated signals. */
function hasTimeLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Render exact KPIs, an equivalent timeline table and neutral intelligence areas.
 * Args:
 *   fixtures: Metrics with label, value and displayState; time labels; charts
 *     with label, displayState and aligned numeric data.
 * Returns:
 *   Informational content with missing values preserved rather than calculated.
 * Notes:
 *   Only explicitly available finite signals are plotted. Invalid time-label
 *   lists are rejected as a whole. Unapproved intelligence and actions are ignored.
 */
export default function Partnerships({ fixtures = PARTNERSHIP_FIXTURES }) {
  const data = useMemo(() => {
    const metrics = Array.isArray(fixtures?.metrics) ? fixtures.metrics : [];
    const labels = Array.isArray(fixtures?.labels) && fixtures.labels.every(hasTimeLabel)
      ? fixtures.labels : [];
    const charts = Array.isArray(fixtures?.charts) ? fixtures.charts : [];
    const series = PARTNERSHIP_CHART_LABELS.map((label, index) => {
      const signal = charts.find((item) => item?.label === label);
      return {
        label,
        borderDash: index === 0 ? [] : [6, 4],
        pointStyle: index === 0 ? 'circle' : 'rect',
        data: labels.map((_, position) => {
          const value = Array.isArray(signal?.data) ? signal.data[position] : null;
          return signal?.displayState === 'available' && typeof value === 'number' && Number.isFinite(value)
            ? value : null;
        }),
      };
    });
    return { metrics, labels, series };
  }, [fixtures]);

  return (
    <div className="strategic-content">
      <MockDataNotice>
        Partnership values and time periods are shown only when supplied. No partner integration is connected.
      </MockDataNotice>
      <div className="metric-grid">
        {PARTNERSHIP_METRICS.map(({ label }) => {
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
      <ChartPanel
        title="Investment and Value Timeline"
        description="Compare supplied Investment and Value over Time. Investment uses a solid line and circle markers; Value uses a dashed line and square markers. The textual data preserves the same time periods and values."
        caveat="Time periods, dates, units and values are not specified unless supplied. Missing values are not zero; no ROI calculation is inferred."
        type="line"
        labels={data.labels}
        series={data.series}
        options={TIMELINE_OPTIONS}
      />
      <div className="strategic-sections">
        <section aria-label="Summary">
          <h3>Summary</h3>
          <p className="muted">Not specified. Approved summary content has not been supplied.</p>
        </section>
        <section aria-label="Opportunities">
          <h3>Opportunities</h3>
          <p className="muted">Not specified. Approved opportunity labels and content have not been supplied.</p>
        </section>
        <section aria-label="Actions">
          <h3>Actions</h3>
          <p className="muted">Not specified. Approved action labels and outcomes have not been supplied. No action controls are available.</p>
        </section>
      </div>
    </div>
  );
}

Partnerships.propTypes = {
  fixtures: PropTypes.object,
};
