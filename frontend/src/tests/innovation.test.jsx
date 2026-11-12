/** Verify innovation fixture boundaries and persistent chart text equivalents. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import Innovation from '../views/Innovation.jsx';
import { INNOVATION_FIXTURES } from '../data/dashboardFixtures.js';
import { seedServerSession } from './serverAuthFixture.js';

const chart = vi.hoisted(() => ({ props: null, fail: false }));
// Stub only external canvas drawing; preserve real shared components and tables.
vi.mock('react-chartjs-2', () => ({
  Chart: (props) => {
    chart.props = props;
    if (chart.fail) throw new Error('Synthetic drawing failure');
    return (
      <canvas role={props.role} aria-label={props['aria-label']} />
    );
  },
}));

const metricLabels = ['AI models in production', 'Innovation pipeline value', 'Patents'];
const tableName = 'Innovation Portfolio Distribution — textual data';
const emptyMessage = 'illustrative domain data and values have not been specified';

beforeEach(() => {
  chart.props = null;
  chart.fail = false;
});

describe('Innovation', () => {
  it('renders exactly three requested cards and a visible no-taxonomy state without invented defaults', () => {
    render(
      <Innovation />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    metricLabels.forEach((label) => {
      const card = screen.getByRole('article', { name: label, exact: true });
      expect(within(card).getByRole('heading', { name: label, exact: true })).toBeVisible();
      expect(within(card).getAllByText('Not specified')).toHaveLength(3);
    });
    expect(screen.getByText(emptyMessage)).toBeVisible();
    expect(screen.getByRole('table', { name: tableName })).toBeVisible();
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    expect(screen.queryByRole('rowheader')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Illustrative demo only — not live or verified enterprise data/)).toHaveLength(2);
    expect(INNOVATION_FIXTURES.labels).toEqual([]);
    expect(INNOVATION_FIXTURES.distribution.data).toEqual([]);
    expect(INNOVATION_FIXTURES.metrics.map((item) => item.label)).toEqual(metricLabels);
    expect(INNOVATION_FIXTURES.metrics.every((item) => item.value === null && item.displayState === 'not-specified')).toBe(true);
    expect(Object.isFrozen(INNOVATION_FIXTURES.distribution.data)).toBe(true);
  });

  it('preserves supplied synthetic values including explicit zero in cards, chart and text without calculations', () => {
    const fixtures = {
      metrics: metricLabels.map((label, index) => ({ label, displayState: 'available', value: index === 2 ? 'Synthetic value' : index })),
      labels: ['Synthetic A', 'Synthetic B'],
      distribution: { displayState: 'available', data: [0, 7] },
    };
    render(
      <Innovation fixtures={fixtures} />
    );
    fixtures.metrics.forEach((metric) => {
      expect(within(screen.getByRole('article', { name: metric.label })).getByText(String(metric.value))).toBeVisible();
    });
    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument();
    expect(chart.props.type).toBe('bar');
    expect(chart.props.data.labels).toEqual(fixtures.labels);
    expect(chart.props.data.datasets[0].data).toEqual([0, 7]);
    expect(chart.props.options.animation).toBe(false);
    expect(screen.getByRole('img')).toHaveAccessibleName('Innovation Portfolio Distribution — textual data below');
    const table = screen.getByRole('table', { name: tableName });
    fixtures.labels.forEach((label, index) => {
      const header = within(table).getByRole('rowheader', { name: label });
      expect(header).toHaveAttribute('scope', 'row');
      expect(within(header.closest('tr')).getByRole('cell')).toHaveTextContent(String(fixtures.distribution.data[index]));
    });
  });

  it.each([null, {}, { metrics: {}, labels: null, distribution: [] }])('handles absent or malformed fixture collections: %j', (fixtures) => {
    render(
      <Innovation fixtures={fixtures} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByText(emptyMessage)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it.each([Infinity, NaN, {}, [], true, '', ' '])('keeps invalid available card values unspecified: %j', (value) => {
    render(
      <Innovation fixtures={{ metrics: metricLabels.map((label) => ({ label, displayState: 'available', value })) }} />
    );
    metricLabels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
  });

  it('preserves invalid and missing distribution cells as gaps and ignores unknown or unavailable card values', () => {
    render(
      <Innovation fixtures={{
        metrics: [null, { label: 'Patents', value: 99, displayState: 'not-specified' }, { label: 'Unknown metric', value: 42, displayState: 'available' }],
        labels: ['Synthetic A', 'Synthetic B', 'Synthetic C', 'Synthetic D', 'Synthetic E'],
        distribution: { displayState: 'available', data: [5, '6', NaN, { x: 1, y: 2 }] },
      }} />
    );
    expect(chart.props.data.datasets[0].data).toEqual([5, null, null, null, null]);
    expect(within(screen.getByRole('table', { name: tableName })).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['5', 'Not specified', 'Not specified', 'Not specified', 'Not specified']);
    expect(screen.queryByText(/Unknown/)).not.toBeInTheDocument();
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'AI models in production' })).getAllByText('Not specified')).toHaveLength(3);
  });

  it.each([
    undefined, null, {}, { displayState: 'not-specified', data: [8] },
    { data: [8] }, { displayState: 'available', data: {} },
    { displayState: 'available', data: [Infinity] },
  ])('retains supplied categories but does not plot unavailable distribution: %j', (distribution) => {
    render(
      <Innovation fixtures={{ labels: ['Synthetic A'], distribution }} />
    );
    expect(screen.getByText(emptyMessage)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Synthetic A' })).toBeVisible();
    expect(screen.getByRole('cell')).toHaveTextContent('Not specified');
    expect(screen.queryByText('8')).not.toBeInTheDocument();
  });

  it.each([[['Synthetic A', null, 'Synthetic B']], [[' ']], [[7]], [Array(2)]])('rejects malformed taxonomy without shifting distribution values: %j', (labels) => {
    render(
      <Innovation fixtures={{ labels, distribution: { displayState: 'available', data: [1, 2, 3] } }} />
    );
    expect(screen.getByText(emptyMessage)).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('cell')).not.toBeInTheDocument();
  });

  it('preserves the textual distribution when external canvas drawing fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.fail = true;
    render(
      <Innovation fixtures={{ labels: ['Synthetic A'], distribution: { displayState: 'available', data: [4] } }} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable. Textual data remains below.');
    expect(screen.getByRole('table', { name: tableName })).toHaveTextContent('Synthetic A');
    expect(screen.getByRole('cell')).toHaveTextContent('4');
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('mounts Innovation by click and keyboard without network calls or storage writes', async () => {
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
    await user.click(screen.getByRole('tab', { name: 'Innovation', exact: true }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: 'Innovation', exact: true })).toHaveTextContent(emptyMessage);
    await user.click(screen.getByRole('tab', { name: 'Risk & Governance' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Innovation', exact: true })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Innovation', exact: true })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Tab}');
    expect(screen.getByRole('tabpanel', { name: 'Innovation', exact: true })).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('region', { name: 'Innovation Portfolio Distribution textual data' })).toHaveFocus();
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
  });
});
