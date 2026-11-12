/** Pair a real Chart.js visualization with persistent readable equivalents. */
import { useId, useMemo } from 'react';
import PropTypes from 'prop-types';
import 'chart.js/auto';
import { Chart } from 'react-chartjs-2';
import { displayValue } from './MetricCard.jsx';
import { MockDataNotice } from './MockDataNotice.jsx';
import { PanelErrorBoundary } from './PanelErrorBoundary.jsx';

const CHART_TYPES = ['line', 'bar', 'radar', 'doughnut', 'pie', 'polarArea', 'scatter', 'bubble'];

/** Accept finite signals only, retaining gaps and caller-supplied scatter coordinates.
 * Args:
 *   value: A numeric signal or a coordinate object supplied by a future view.
 * Returns:
 *   A safe Chart.js datum, or null for unavailable data.
 */
function chartValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object'
    && Number.isFinite(value.x) && Number.isFinite(value.y)) {
    if ('r' in value && !Number.isFinite(value.r)) return null;
    return { x: value.x, y: value.y, ...('r' in value ? { r: value.r } : {}) };
  }
  return null;
}

/** Render coordinate data as text without introducing units or calculations. */
function datumText(value) {
  if (value && typeof value === 'object') {
    return `x: ${value.x}; y: ${value.y}${'r' in value ? `; r: ${value.r}` : ''}`;
  }
  return displayValue(value);
}

/** Render supplied series and an optional explicit table without guessing a scale.
 * Args:
 *   title, description, caveat: Visible purpose and source limitations.
 *   type, labels, series: Chart.js type, categories, and datasets (data arrays).
 *   options: Caller-owned axes/configuration; no domain units are added here.
 *   tableHeaders, tableRows: Optional text equivalent with label/values per row.
 * Returns:
 *   Heading, caveats and table survive a canvas rendering failure.
 * Notes:
 *   Mixed dataset types and yAxisID support future dual-axis views. Radar,
 *   distribution and timeline views reuse types, categories and explicit options.
 */
export function ChartPanel({
  title, description, caveat, type = 'line', labels, series, options,
  tableHeaders, tableRows,
}) {
  const id = useId();
  const data = useMemo(() => {
    const safeLabels = Array.isArray(labels) ? labels.map(displayValue) : [];
    const datasets = Array.isArray(series) ? series.filter((item) => item && typeof item === 'object').map((item, index) => ({
      ...item,
      label: displayValue(item.label),
      type: CHART_TYPES.includes(item.type) ? item.type : undefined,
      data: Array.isArray(item.data) ? item.data.map(chartValue) : [],
      spanGaps: false,
      borderColor: item.borderColor ?? '#686159',
      backgroundColor: item.backgroundColor ?? '#d5cfc6',
      borderDash: item.borderDash ?? (index % 2 ? [6, 4] : []),
      pointStyle: item.pointStyle ?? (index % 2 ? 'rect' : 'circle'),
    })) : [];
    return { labels: safeLabels, datasets };
  }, [labels, series]);
  const chartOptions = useMemo(() => ({
    ...(options && typeof options === 'object' && !Array.isArray(options) ? options : {}),
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
  }), [options]);
  const headers = Array.isArray(tableHeaders)
    ? tableHeaders.map(displayValue)
    : data.datasets.map((item) => item.label);
  const rows = Array.isArray(tableRows)
    ? tableRows.map((row) => ({
      label: displayValue(row?.label),
      values: Array.isArray(row?.values) ? row.values : [],
    }))
    : Array.from({ length: Math.max(data.labels.length, ...data.datasets.map((item) => item.data.length)) }, (_, index) => ({
      label: data.labels[index] ?? 'Not specified',
      values: data.datasets.map((item) => datumText(item.data[index])),
    }));
  const hasData = data.datasets.some((item) => item.data.some((value) => value !== null));
  const validType = CHART_TYPES.includes(type);

  return (
    <section className="chart-panel" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <h3 id={`${id}-title`}>{displayValue(title)}</h3>
      <p id={`${id}-description`} className="muted">{displayValue(description)}</p>
      <MockDataNotice>
        {displayValue(caveat)}
      </MockDataNotice>
      {hasData && validType ? (
        <PanelErrorBoundary fallback={
          <p role="alert" className="error">Chart unavailable. Textual data remains below.</p>
        }>
          <div className="chart-canvas">
            <Chart
              type={type}
              data={data}
              options={chartOptions}
              role="img"
              aria-label={`${displayValue(title)} — textual data below`}
            />
          </div>
        </PanelErrorBoundary>
      ) : (
        <p className="chart-empty">
          {validType ? 'Chart data not specified. Missing values are not zero.' : 'Chart type unavailable. Textual data remains below.'}
        </p>
      )}
      <div className="chart-table-scroll" tabIndex={0} role="region" aria-label={`${displayValue(title)} textual data`}>
        <table>
          <caption>{displayValue(title)} — textual data</caption>
          <thead>
            <tr>
              <th scope="col">Period / category</th>
              {headers.map((header, index) => (
                <th scope="col" key={index}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <th scope="row">{row.label}</th>
                {headers.map((header, column) => (
                  <td key={column}>{displayValue(row.values[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="muted">Categories and values: Not specified.</p>
        )}
      </div>
    </section>
  );
}

ChartPanel.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  caveat: PropTypes.string,
  type: PropTypes.string,
  labels: PropTypes.array,
  series: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string,
    data: PropTypes.array,
    type: PropTypes.string,
    yAxisID: PropTypes.string,
  })),
  options: PropTypes.object,
  tableHeaders: PropTypes.array,
  tableRows: PropTypes.arrayOf(PropTypes.shape({ label: PropTypes.string, values: PropTypes.array })),
};
