/** Verify exact business labels, fixture boundaries, text equivalents and local navigation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import BusinessImpact from '../views/BusinessImpact.jsx';
import { BUSINESS_FIXTURES } from '../data/dashboardFixtures.js';
import { seedServerSession } from './serverAuthFixture.js';

const chart = vi.hoisted(() => ({ props: null, fail: false }));
// Replace only third-party drawing; exercise the real ChartPanel and its table.
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

const cardLabels = ['Revenue Attribution', 'Cost Savings', 'Innovation ROI'];
const chartLabels = ['Revenue', 'Cost Avoidance', 'ROI'];
const tableName = 'Business Value Indicators — textual data';

describe('Business Impact', () => {
  it('renders exactly three chart indicators and separate neutral cards with explicit caveats', () => {
    render(
      <BusinessImpact />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    cardLabels.forEach((label) => {
      const card = screen.getByRole('article', { name: label, exact: true });
      expect(within(card).getByRole('heading', { name: label, exact: true })).toBeVisible();
      expect(within(card).getAllByText('Not specified')).toHaveLength(3);
    });
    const table = screen.getByRole('table', { name: tableName });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Period / category', ...chartLabels]);
    chartLabels.forEach((label) => {
      expect(within(table).getByRole('columnheader', { name: label, exact: true })).toHaveAttribute('scope', 'col');
    });
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    expect(screen.getByText('Chart data not specified. Missing values are not zero.')).toBeVisible();
    expect(screen.getByText(/Units, dates, formulas and attribution are not specified or inferred/)).toBeVisible();
    expect(screen.getAllByText(/Illustrative demo only — not live or verified enterprise data/)).toHaveLength(2);
    expect(BUSINESS_FIXTURES.labels).toEqual([]);
    expect(BUSINESS_FIXTURES.charts.map((item) => item.label)).toEqual(chartLabels);
    expect(BUSINESS_FIXTURES.charts.every((item) => item.data.length === 0 && item.displayState === 'not-specified')).toBe(true);
    expect(BUSINESS_FIXTURES.metrics.every((item) => item.value === null)).toBe(true);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[$€£%]|202[0-9]|USD|million/);
  });

  it('renders synthetic available values, including zero, with matching chart and text data', () => {
    const fixtures = {
      metrics: cardLabels.map((label, index) => ({ label, displayState: 'available', value: index === 2 ? 'Synthetic supplied value' : index })),
      labels: ['Synthetic category A', 'Synthetic category B'],
      charts: chartLabels.map((label, index) => ({ label, displayState: 'available', data: [index, index + 4] })),
    };
    render(
      <BusinessImpact fixtures={fixtures} />
    );
    fixtures.metrics.forEach((metric) => {
      expect(within(screen.getByRole('article', { name: metric.label })).getByText(String(metric.value))).toBeVisible();
    });
    expect(chart.props.type).toBe('bar');
    expect(chart.props.data.labels).toEqual(fixtures.labels);
    expect(chart.props.data.datasets.map((item) => item.label)).toEqual(chartLabels);
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([[0, 4], [1, 5], [2, 6]]);
    expect(screen.getByRole('img')).toHaveAccessibleName('Business Value Indicators — textual data below');
    const table = screen.getByRole('table', { name: tableName });
    fixtures.labels.forEach((label, index) => {
      const row = within(table).getByRole('rowheader', { name: label }).closest('tr');
      expect(within(row).getAllByRole('cell').map((cell) => cell.textContent))
        .toEqual(fixtures.charts.map((item) => String(item.data[index])));
    });
  });

  it.each([null, {}, { metrics: {}, labels: null, charts: {} }])('handles absent or malformed collections without invented values: %j', (fixtures) => {
    render(
      <BusinessImpact fixtures={fixtures} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    cardLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([Infinity, NaN, {}, [], true, '', ' '])('rejects malformed available metric values: %j', (value) => {
    render(
      <BusinessImpact fixtures={{ metrics: cardLabels.map((label) => ({ label, displayState: 'available', value })) }} />
    );
    cardLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
  });

  it('retains numeric gaps, ignores unknown labels and never derives cards or exposes unspecified values', () => {
    render(
      <BusinessImpact fixtures={{
        labels: ['Synthetic A', 'Synthetic B', 'Synthetic C', 'Synthetic D'],
        metrics: [null, { label: cardLabels[0], value: 99, displayState: 'not-specified' }, { label: 'Unknown card', value: 42, displayState: 'available' }],
        charts: [
          null,
          { label: 'Revenue', displayState: 'available', data: [5, '6', NaN, { x: 1, y: 2 }] },
          { label: 'Cost Avoidance', displayState: 'not-specified', data: [9, 9, 9, 9] },
          { label: 'ROI', displayState: 'available', data: null },
          { label: 'Unknown chart', displayState: 'available', data: [42] },
        ],
      }} />
    );
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([
      [5, null, null, null], [null, null, null, null], [null, null, null, null],
    ]);
    const table = screen.getByRole('table', { name: tableName });
    expect(within(table).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['5', ...Array(11).fill('Not specified')]);
    cardLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
    expect(screen.queryByText(/Unknown/)).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('keeps categories and missing cells when matching indicators are absent or data is short', () => {
    render(
      <BusinessImpact fixtures={{ labels: ['Synthetic A', 'Synthetic B'], charts: [
        { label: 'Revenue', displayState: 'available', data: [0] },
      ] }} />
    );
    expect(chart.props.data.datasets.map((item) => item.data)).toEqual([[0, null], [null, null], [null, null]]);
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['0', ...Array(5).fill('Not specified')]);
  });

  it.each([['Synthetic A', null, 'Synthetic B'], ['Synthetic A', 7], [' ']].map((labels) => [labels]))('rejects malformed categories without shifting values: %j', (labels) => {
    render(
      <BusinessImpact fixtures={{ labels, charts: [{ label: 'Revenue', displayState: 'available', data: [1, 2, 3] }] }} />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    expect(within(screen.getByRole('table', { name: tableName })).queryByRole('cell')).not.toBeInTheDocument();
  });

  it('preserves business text and cards when external chart drawing fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.fail = true;
    render(
      <BusinessImpact fixtures={{ labels: ['Synthetic category'], charts: [
        { label: 'Revenue', displayState: 'available', data: [4] },
      ] }} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable. Textual data remains below.');
    expect(screen.getByRole('table', { name: tableName })).toHaveTextContent('4');
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('selects only business content by click and keyboard, preserving shell and assistant without requests or writes', async () => {
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
    await user.click(screen.getByRole('tab', { name: 'Business Impact', exact: true }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    const panel = screen.getByRole('tabpanel', { name: 'Business Impact' });
    expect(within(panel).getAllByRole('article')).toHaveLength(3);
    expect(within(panel).getByRole('table', { name: tableName })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(screen.getByRole('button', { name: /assistant/i })).toBeVisible();
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Executive Summary' }));
    screen.getByRole('tab', { name: 'Executive Summary' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Business Impact', exact: true })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Business Impact', exact: true })).toHaveAttribute('aria-selected', 'true');
    const region = screen.getByRole('region', { name: 'Business Value Indicators textual data' });
    region.focus();
    await user.keyboard('{Enter} ');
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
  });
});
