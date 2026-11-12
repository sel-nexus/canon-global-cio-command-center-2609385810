/** Present independent incident and efficiency signals without monitoring behavior. */
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { ChartPanel } from '../components/ChartPanel.jsx';
import { MetricCard, displayValue } from '../components/MetricCard.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { OPERATIONS_CHART_LABELS, OPERATIONS_FIXTURES, OPERATIONS_METRICS } from '../data/dashboardFixtures.js';

const AXES = Object.freeze({
  scales: {
    incidents: { type: 'linear', position: 'left', title: { display: true, text: 'Incidents' } },
    efficiency: {
      type: 'linear', position: 'right', title: { display: true, text: 'Efficiency' },
      grid: { drawOnChartArea: false },
    },
  },
});

/** Accept supplied category identities without inventing dates or shifting alignment. */
function hasLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Render three fixed metrics and matching dual-axis visual and textual signals.
 * Args:
 *   fixtures: Metrics with label, value and displayState; supplied labels; charts
 *     with label, displayState and category-aligned numeric data.
 * Returns:
 *   Read-only content that preserves missing values and ignores unknown labels.
 * Notes:
 *   Reject malformed label lists as a whole to avoid misaligning signals.
 *   Only explicitly available finite signals are plotted; cards are not derived.
 */
export default function Operations({ fixtures = OPERATIONS_FIXTURES }) {
  const data = useMemo(() => {
    const metrics = Array.isArray(fixtures?.metrics) ? fixtures.metrics : [];
    const labels = Array.isArray(fixtures?.labels) && fixtures.labels.every(hasLabel)
      ? fixtures.labels : [];
    const charts = Array.isArray(fixtures?.charts) ? fixtures.charts : [];
    const series = OPERATIONS_CHART_LABELS.map((label, index) => {
      const signal = charts.find((item) => item?.label === label);
      return {
        label,
        yAxisID: index === 0 ? 'incidents' : 'efficiency',
        borderDash: index === 0 ? [] : [6, 4],
        pointStyle: index === 0 ? 'circle' : 'rect',
        pointRadius: 4,
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
        Operational values and periods are shown only when supplied. Missing information is Not specified.
      </MockDataNotice>
      <div className="metric-grid">
        {OPERATIONS_METRICS.map(({ label }) => {
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
        title="Operational Trends"
        description="Compare supplied incident and efficiency trends on independent axes. Left axis: Incidents — solid line, circle markers. Right axis: Efficiency — dashed line, square markers. The textual data preserves the same periods and values."
        caveat="Units, dates, formulas and the MTTR definition are not specified or inferred. Missing values are not zero."
        type="line"
        labels={data.labels}
        series={data.series}
        options={AXES}
      />
    </div>
  );
}

Operations.propTypes = {
  fixtures: PropTypes.object,
};
