/** Present supplied operational measures and regional data without computing outcomes. */
import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { MetricCard, displayValue } from '../components/MetricCard.jsx';
import { ChartPanel } from '../components/ChartPanel.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { EXECUTIVE_FIXTURES, EXECUTIVE_METRICS } from '../data/dashboardFixtures.js';

const STATUSES = ['Excellent', 'Good', 'Warning', 'Critical'];

/** Accept only a supplied nonblank identity, never an object or guessed name. */
function hasLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Render four fixed cards, radar context and a semantic status table.
 * Args:
 *   fixtures: Metrics with explicit displayState; axes as strings; regions with
 *     label, displayState, status and axis-aligned values. Invalid data stays unavailable.
 * Returns:
 *   Read-only content inside the shell's single active panel.
 * Notes:
 *   Reject an invalid axis list as a whole to avoid shifting value alignment.
 */
export default function ExecutiveSummary({ fixtures = EXECUTIVE_FIXTURES }) {
  const data = useMemo(() => {
    const metrics = Array.isArray(fixtures?.metrics) ? fixtures.metrics : [];
    const axes = Array.isArray(fixtures?.axes) && fixtures.axes.every(hasLabel)
      ? fixtures.axes : [];
    const regions = Array.isArray(fixtures?.regions)
      ? fixtures.regions.filter((region) => hasLabel(region?.label)) : [];
    const rows = regions.map((region) => ({
      label: region.label,
      values: axes.map((_, index) => {
        const value = Array.isArray(region.values) ? region.values[index] : null;
        return region.displayState === 'available' && typeof value === 'number' && Number.isFinite(value)
          ? value : null;
      }),
    }));
    return {
      metrics, axes, regions, rows,
      series: rows.map((row) => ({ label: row.label, data: row.values })),
    };
  }, [fixtures]);

  return (
    <div className="strategic-content">
      <MockDataNotice>
        Operational values, regions, radar axes and statuses are shown only when supplied. Missing information is Not specified.
      </MockDataNotice>
      <div className="metric-grid">
        {EXECUTIVE_METRICS.map(({ label }) => {
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
        title="Regional KPI Comparison"
        description="Radar comparison of supplied regional KPIs. The textual data lists each supplied region and its axis-aligned values."
        caveat="Regions, axes, values, units and scales are not inferred. Missing values are not zero."
        type="radar"
        labels={data.axes}
        series={data.series}
        tableHeaders={data.axes}
        tableRows={data.rows}
      />
      {!data.axes.length && (
        <p className="muted">Radar axes and values: Not specified.</p>
      )}
      <section className="chart-panel" aria-labelledby="executive-region-status-title">
        <h3 id="executive-region-status-title">Regional Performance Status</h3>
        <p className="muted">Statuses are supplied labels, not calculated from radar values.</p>
        <div className="chart-table-scroll" tabIndex={0} role="region" aria-label="Regional performance status table">
          <table>
            <caption>Regional performance statuses</caption>
            <thead>
              <tr>
                <th scope="col">Region</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.regions.map((region, index) => (
                <tr key={index}>
                  <th scope="row">{region.label}</th>
                  <td>
                    {region.displayState === 'available' && STATUSES.includes(region.status)
                      ? region.status : 'Not specified'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.regions.length && (
            <p className="muted">Regions and statuses: Not specified.</p>
          )}
        </div>
      </section>
    </div>
  );
}

ExecutiveSummary.propTypes = {
  fixtures: PropTypes.object,
};
