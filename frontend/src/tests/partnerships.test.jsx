/** Verify partnership fixture boundaries, text equivalents and inert local navigation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import Partnerships from '../views/Partnerships.jsx';
import { PARTNERSHIP_FIXTURES } from '../data/dashboardFixtures.js';
import { seedServerSession } from './serverAuthFixture.js';

const chart = vi.hoisted(() => ({ props: null, fail: false }));
// Mock external canvas drawing only; retain the actual ChartPanel and text table.
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

const metricLabels = ['SLA performance', 'ROI', 'innovation velocity', 'delivery excellence'];
const tableName = 'Investment and Value Timeline — textual data';

describe('Partnerships', () => {
  it('renders four exact KPIs, missing timeline and neutral intelligence without invented controls or values', () => {
    render(
      <Partnerships />
    );
    expect(screen.getAllByRole('article')).toHaveLength(4);
    metricLabels.forEach((label) => {
      const card = screen.getByRole('article', { name: label, exact: true });
      expect(within(card).getByRole('heading', { name: label, exact: true })).toBeVisible();
      expect(within(card).getAllByText('Not specified')).toHaveLength(3);
    });
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Period / category', 'Investment', 'Value']);
    expect(screen.getByText(/Compare supplied Investment and Value over Time/)).toBeVisible();
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    expect(screen.getByText('Chart data not specified. Missing values are not zero.')).toBeVisible();
    ['Summary', 'Opportunities', 'Actions'].forEach((name) => {
      expect(screen.getByRole('region', { name })).toHaveTextContent('Not specified.');
    });
    expect(screen.getAllByText(/Illustrative demo only/)).toHaveLength(2);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[$€£%]|202[0-9]|TCS|recommended/i);
    expect(PARTNERSHIP_FIXTURES.metrics.map((item) => item.label)).toEqual(metricLabels);
    expect(PARTNERSHIP_FIXTURES.metrics.every((item) => item.value === null && item.displayState === 'not-specified')).toBe(true);
    expect(PARTNERSHIP_FIXTURES.labels).toEqual([]);
    expect(PARTNERSHIP_FIXTURES.charts.every((item) => item.data.length === 0 && item.displayState === 'not-specified')).toBe(true);
  });

  it('preserves supplied synthetic KPIs, time labels and finite signals including zero in chart and text', () => {
    const fixtures = {
      metrics: metricLabels.map((label, value) => ({ label, value, displayState: 'available' })),
      labels: ['Synthetic time A', 'Synthetic time B'],
      charts: [
        { label: 'Investment', displayState: 'available', data: [0, 5] },
        { label: 'Value', displayState: 'available', data: [7, 8] },
      ],
    };
    render(
      <Partnerships fixtures={fixtures} />
    );
    fixtures.metrics.forEach(({ label, value }) => {
      expect(within(screen.getByRole('article', { name: label })).getByText(String(value))).toBeVisible();
    });
    expect(chart.props.type).toBe('line');
    expect(chart.props.data.labels).toEqual(fixtures.labels);
    expect(chart.props.data.datasets[0]).toMatchObject({ label: 'Investment', data: [0, 5], borderDash: [], pointStyle: 'circle', spanGaps: false });
    expect(chart.props.data.datasets[1]).toMatchObject({ label: 'Value', data: [7, 8], borderDash: [6, 4], pointStyle: 'rect', spanGaps: false });
    expect(chart.props.options.scales.x.title).toEqual({ display: true, text: 'Time' });
    expect(chart.props.options.scales.y.title.text).toBe('Investment / Value');
    expect(screen.getByRole('img')).toHaveAccessibleName('Investment and Value Timeline — textual data below');
    const table = screen.getByRole('table', { name: tableName });
    fixtures.labels.forEach((label, index) => {
      const row = within(table).getByRole('rowheader', { name: label }).closest('tr');
      expect(within(row).getAllByRole('cell').map((cell) => cell.textContent))
        .toEqual(fixtures.charts.map((signal) => String(signal.data[index])));
    });
  });

  it.each([null, {}, { metrics: {}, labels: null, charts: {} }])('handles malformed or absent collections without crashing: %j', (fixtures) => {
    render(
      <Partnerships fixtures={fixtures} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('rejects invalid metric values, unknown labels and unapproved intelligence rather than exposing them', () => {
    render(
      <Partnerships fixtures={{
        metrics: [null,
          { label: 'SLA performance', displayState: 'available', value: {} },
          { label: 'ROI', displayState: 'available', value: Infinity },
          { label: 'innovation velocity', displayState: 'available', value: ' ' },
          { label: 'delivery excellence', displayState: 'not-specified', value: 99 },
          { label: 'Unknown KPI', displayState: 'available', value: 42 },
        ],
        summary: 'Unapproved summary', opportunities: ['Unapproved opportunity'],
        actions: [{ label: 'Unapproved action', outcome: 'Unapproved outcome' }],
      }} />
    );
    metricLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
    expect(screen.queryByText(/Unapproved|Unknown KPI|99|42/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps invalid signals as aligned gaps and hides unspecified and unknown series', () => {
    render(
      <Partnerships fixtures={{
        labels: ['Synthetic A', 'Synthetic B', 'Synthetic C', 'Synthetic D'],
        charts: [null,
          { label: 'Investment', displayState: 'available', data: [5, '6', NaN, { x: 1, y: 2 }] },
          { label: 'Value', displayState: 'not-specified', data: [99, 99, 99, 99] },
          { label: 'Unknown series', displayState: 'available', data: [42] },
        ],
      }} />
    );
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([[5, null, null, null], [null, null, null, null]]);
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['5', ...Array(7).fill('Not specified')]);
    expect(screen.queryByText(/Unknown series|99|42/)).not.toBeInTheDocument();
  });

  it('preserves time categories with missing or malformed series data, never filling gaps with zero', () => {
    render(
      <Partnerships fixtures={{ labels: ['Synthetic A', 'Synthetic B'], charts: [
        { label: 'Investment', displayState: 'available', data: {} },
        { label: 'Value', displayState: 'available', data: [0] },
      ] }} />
    );
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([[null, null], [0, null]]);
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['Not specified', '0', 'Not specified', 'Not specified']);
  });

  it.each([['Synthetic A', null, 'Synthetic B'], ['Synthetic A', 7], [' ']].map((labels) => [labels]))('rejects invalid time labels without shifting values: %j', (labels) => {
    render(
      <Partnerships fixtures={{ labels, charts: [{ label: 'Investment', displayState: 'available', data: [1, 2, 3] }] }} />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
  });

  it('retains the timeline text and neutral areas when canvas drawing fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.fail = true;
    render(
      <Partnerships fixtures={{ labels: ['Synthetic A'], charts: [{ label: 'Value', displayState: 'available', data: [4] }] }} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable. Textual data remains below.');
    expect(screen.getByRole('table', { name: tableName })).toHaveTextContent('4');
    expect(screen.getByRole('region', { name: 'Actions' })).toHaveTextContent('Not specified.');
  });

  it('mounts Partnerships by click and keyboard without writes, network requests or assistant activation', async () => {
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
    await user.click(screen.getByRole('tab', { name: 'Partnerships', exact: true }));
    const panel = screen.getByRole('tabpanel', { name: 'Partnerships' });
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(within(panel).getAllByRole('article')).toHaveLength(4);
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    const content = panel.textContent;
    await user.click(within(panel).getByRole('heading', { name: 'Actions', exact: true }));
    expect(panel.textContent).toBe(content);
    expect(screen.queryByRole('region', { name: 'Local assistant', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open local assistant', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('tab', { name: 'Innovation', exact: true }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Partnerships' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Partnerships' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Tab}{Tab}{Enter} ');
    expect(screen.getByRole('region', { name: 'Investment and Value Timeline textual data' })).toHaveFocus();
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
  });
});
