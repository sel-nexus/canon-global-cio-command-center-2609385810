/** Verify operational fixture boundaries, dual axes, readable equivalents and local navigation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import Operations from '../views/Operations.jsx';
import { OPERATIONS_FIXTURES } from '../data/dashboardFixtures.js';
import { seedServerSession } from './serverAuthFixture.js';

const chart = vi.hoisted(() => ({ props: null, fail: false }));
// Replace only external canvas drawing; retain the real chart wrapper and table.
vi.mock('react-chartjs-2', () => ({
  Chart: (props) => {
    chart.props = props;
    if (chart.fail) throw new Error('Synthetic drawing failure');
    return (
      <canvas role={props.role} aria-label={props['aria-label']} />
    );
  },
}));

beforeEach(() => {
  chart.props = null;
  chart.fail = false;
});

const metricLabels = ['Total incidents (MTD)', 'MTTR', 'Efficiency metrics'];
const tableName = 'Operational Trends — textual data';

describe('Operations', () => {
  it('renders exactly the requested metrics and unavailable trends without invented values or controls', () => {
    render(
      <Operations />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    metricLabels.forEach((label) => {
      const card = screen.getByRole('article', { name: label, exact: true });
      expect(within(card).getByRole('heading', { name: label, exact: true })).toBeVisible();
      expect(within(card).getAllByText('Not specified')).toHaveLength(3);
    });
    const table = screen.getByRole('table', { name: tableName });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Period / category', 'Incidents', 'Efficiency']);
    expect(screen.getByText(/Left axis: Incidents — solid line, circle markers/)).toBeVisible();
    expect(screen.getByText(/Right axis: Efficiency — dashed line, square markers/)).toBeVisible();
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    expect(screen.getByText('Chart data not specified. Missing values are not zero.')).toBeVisible();
    expect(screen.getByText(/Units, dates, formulas and the MTTR definition are not specified or inferred/)).toBeVisible();
    expect(screen.getAllByText(/Illustrative demo only — not live or verified enterprise data/)).toHaveLength(2);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[$€£%]|202[0-9]|hours|minutes|mean time|refresh|alerts/i);
    expect(OPERATIONS_FIXTURES.labels).toEqual([]);
    expect(OPERATIONS_FIXTURES.metrics.map((item) => item.label)).toEqual(metricLabels);
    expect(OPERATIONS_FIXTURES.metrics.every((item) => item.value === null && item.displayState === 'not-specified')).toBe(true);
    expect(OPERATIONS_FIXTURES.charts.map((item) => item.label)).toEqual(['Incidents', 'Efficiency']);
    expect(OPERATIONS_FIXTURES.charts.every((item) => item.data.length === 0 && item.displayState === 'not-specified')).toBe(true);
  });

  it('preserves available synthetic metrics and signals, including zero, on directly labeled independent axes', () => {
    const fixtures = {
      metrics: metricLabels.map((label, index) => ({ label, displayState: 'available', value: index === 2 ? 'Synthetic value' : index })),
      labels: ['Synthetic A', 'Synthetic B'],
      charts: [
        { label: 'Incidents', displayState: 'available', data: [0, 5] },
        { label: 'Efficiency', displayState: 'available', data: [7, 8] },
      ],
    };
    render(
      <Operations fixtures={fixtures} />
    );
    fixtures.metrics.forEach((metric) => {
      expect(within(screen.getByRole('article', { name: metric.label })).getByText(String(metric.value))).toBeVisible();
    });
    expect(chart.props.type).toBe('line');
    expect(chart.props.data.labels).toEqual(fixtures.labels);
    const [incidents, efficiency] = chart.props.data.datasets;
    expect(incidents).toMatchObject({ label: 'Incidents', yAxisID: 'incidents', data: [0, 5], borderDash: [], pointStyle: 'circle', spanGaps: false });
    expect(efficiency).toMatchObject({ label: 'Efficiency', yAxisID: 'efficiency', data: [7, 8], borderDash: [6, 4], pointStyle: 'rect', spanGaps: false });
    expect(chart.props.options.scales.incidents).toMatchObject({ type: 'linear', position: 'left', title: { display: true, text: 'Incidents' } });
    expect(chart.props.options.scales.efficiency).toMatchObject({ type: 'linear', position: 'right', title: { display: true, text: 'Efficiency' }, grid: { drawOnChartArea: false } });
    expect(chart.props.options.animation).toBe(false);
    expect(screen.getByRole('img')).toHaveAccessibleName('Operational Trends — textual data below');
    const table = screen.getByRole('table', { name: tableName });
    fixtures.labels.forEach((label, index) => {
      const header = within(table).getByRole('rowheader', { name: label });
      expect(header).toHaveAttribute('scope', 'row');
      expect(within(header.closest('tr')).getAllByRole('cell').map((cell) => cell.textContent))
        .toEqual(fixtures.charts.map((signal) => String(signal.data[index])));
    });
  });

  it.each([null, {}, { metrics: {}, labels: null, charts: {} }])('handles missing or malformed collections safely: %j', (fixtures) => {
    render(
      <Operations fixtures={fixtures} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    metricLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([Infinity, NaN, {}, [], true, '', ' '])('rejects invalid available metric values: %j', (value) => {
    render(
      <Operations fixtures={{ metrics: metricLabels.map((label) => ({ label, displayState: 'available', value })) }} />
    );
    metricLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
  });

  it('keeps invalid signals as gaps and hides unspecified and unknown data without deriving metrics', () => {
    render(
      <Operations fixtures={{
        labels: ['Synthetic A', 'Synthetic B', 'Synthetic C', 'Synthetic D'],
        metrics: [null, { label: 'MTTR', value: 99, displayState: 'not-specified' }, { label: 'Unknown metric', value: 42, displayState: 'available' }],
        charts: [null,
          { label: 'Incidents', displayState: 'available', data: [5, '6', NaN, { x: 1, y: 2 }] },
          { label: 'Efficiency', displayState: 'not-specified', data: [9, 9, 9, 9] },
          { label: 'Unknown signal', displayState: 'available', data: [42] },
        ],
      }} />
    );
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([[5, null, null, null], [null, null, null, null]]);
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['5', ...Array(7).fill('Not specified')]);
    expect(screen.queryByText(/Unknown/)).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    metricLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
  });

  it.each([undefined, null, {}])('retains categories when one signal has invalid or missing data: %j', (data) => {
    render(
      <Operations fixtures={{ labels: ['Synthetic A', 'Synthetic B'], charts: [
        { label: 'Incidents', displayState: 'available', data },
        { label: 'Efficiency', displayState: 'available', data: [0] },
      ] }} />
    );
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([[null, null], [0, null]]);
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['Not specified', '0', 'Not specified', 'Not specified']);
  });

  it('retains missing cells for an absent signal rather than assigning zero', () => {
    render(
      <Operations fixtures={{ labels: ['Synthetic A'], charts: [{ label: 'Incidents', displayState: 'available', data: [3] }] }} />
    );
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([[3], [null]]);
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['3', 'Not specified']);
  });

  it.each([['Synthetic A', null, 'Synthetic B'], ['Synthetic A', 7], [' ']].map((labels) => [labels]))('rejects malformed labels without shifting values: %j', (labels) => {
    render(
      <Operations fixtures={{ labels, charts: [{ label: 'Incidents', displayState: 'available', data: [1, 2, 3] }] }} />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    expect(within(screen.getByRole('table', { name: tableName })).queryByRole('cell')).not.toBeInTheDocument();
  });

  it('preserves the textual equivalent and metrics when external chart drawing fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.fail = true;
    render(
      <Operations fixtures={{ labels: ['Synthetic A'], charts: [{ label: 'Efficiency', displayState: 'available', data: [4] }] }} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable. Textual data remains below.');
    expect(screen.getByRole('table', { name: tableName })).toHaveTextContent('4');
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText(/Left axis: Incidents/)).toBeVisible();
  });

  it('selects Operations by click and keyboard without calls or writes, preserving previous views and shell', async () => {
    seedServerSession();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const diagnostic = vi.spyOn(console, 'error');
    const user = userEvent.setup();
    render(
      <App />
    );
    await screen.findByRole('tabpanel', { name: 'Strategic Command' });
    expect(screen.getByRole('tabpanel', { name: 'Strategic Command' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Operations', exact: true }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    const panel = screen.getByRole('tabpanel', { name: 'Operations' });
    expect(within(panel).getAllByRole('article')).toHaveLength(3);
    expect(within(panel).getByRole('table', { name: tableName })).toBeVisible();
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Executive Summary' }));
    expect(screen.getByRole('article', { name: 'IT Health Score' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Business Impact', exact: true }));
    expect(screen.getByRole('article', { name: 'Revenue Attribution' })).toBeVisible();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Operations', exact: true })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Operations', exact: true })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Tab}');
    expect(screen.getByRole('tabpanel', { name: 'Operations' })).toHaveFocus();
    await user.keyboard('{Tab}{Enter} ');
    expect(screen.getByRole('region', { name: 'Operational Trends textual data' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(screen.getByRole('button', { name: /assistant/i })).toBeVisible();
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
  });
});
