/** Verify executive fixtures, unavailable branches and local shell navigation. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import ExecutiveSummary from '../views/ExecutiveSummary.jsx';
import { EXECUTIVE_FIXTURES } from '../data/dashboardFixtures.js';
import { STORAGE_KEYS } from '../services/localStorage.js';

const chart = vi.hoisted(() => ({ props: null, fail: false }));
// Replace only external canvas drawing, keeping the real chart wrapper and tables.
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

const labels = ['IT Health Score', 'Availability', 'Security Posture', 'Transformation Index'];

describe('Executive Summary', () => {
  it('renders exactly four neutral cards and no invented axes, regions, status or zero', () => {
    render(
      <ExecutiveSummary />
    );
    expect(screen.getAllByRole('article')).toHaveLength(4);
    labels.forEach((label) => {
      const card = screen.getByRole('article', { name: label, exact: true });
      expect(within(card).getAllByText('Not specified')).toHaveLength(3);
    });
    expect(EXECUTIVE_FIXTURES.axes).toEqual([]);
    expect(EXECUTIVE_FIXTURES.regions).toEqual([]);
    expect(EXECUTIVE_FIXTURES.metrics.every((metric) => metric.value === null)).toBe(true);
    expect(screen.getByText('Regions and statuses: Not specified.')).toBeVisible();
    expect(screen.getByText('Radar axes and values: Not specified.')).toBeVisible();
    expect(screen.getByRole('table', { name: 'Regional performance statuses' })).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    ['Excellent', 'Good', 'Warning', 'Critical'].forEach((status) => {
      expect(screen.queryByText(status)).not.toBeInTheDocument();
    });
  });

  it('renders supplied available metrics and all four exact statuses with radar text equivalents', () => {
    const fixtures = {
      metrics: labels.map((label, index) => ({ label, value: index, displayState: 'available' })),
      axes: ['Synthetic axis A', 'Synthetic axis B'],
      regions: ['Excellent', 'Good', 'Warning', 'Critical'].map((status, index) => ({
        label: `Synthetic region ${index}`, displayState: 'available', status, values: [index, 8],
      })),
    };
    render(
      <ExecutiveSummary fixtures={fixtures} />
    );
    labels.forEach((label, index) => {
      expect(within(screen.getByRole('article', { name: label })).getByText(String(index))).toBeVisible();
    });
    expect(chart.props.type).toBe('radar');
    expect(chart.props.data.labels).toEqual(fixtures.axes);
    expect(chart.props.data.datasets.map((series) => series.data)).toEqual([[0, 8], [1, 8], [2, 8], [3, 8]]);
    expect(screen.getByRole('img')).toHaveAccessibleName('Regional KPI Comparison — textual data below');
    const statusTable = screen.getByRole('table', { name: 'Regional performance statuses' });
    const dataTable = screen.getByRole('table', { name: 'Regional KPI Comparison — textual data' });
    fixtures.regions.forEach((region) => {
      const row = within(statusTable).getByRole('rowheader', { name: region.label }).closest('tr');
      expect(within(row).getByRole('cell')).toHaveTextContent(region.status);
      const values = within(dataTable).getByRole('rowheader', { name: region.label }).closest('tr');
      expect(within(values).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(region.values.map(String));
    });
    expect(within(statusTable).getByRole('columnheader', { name: 'Status' })).toHaveAttribute('scope', 'col');
  });

  it.each([null, {}, { metrics: {}, axes: null, regions: {} }])('handles absent or malformed fixture collections: %j', (fixtures) => {
    render(
      <ExecutiveSummary fixtures={fixtures} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Regions and statuses: Not specified.')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('rejects invalid metric fields and ignores extra or incorrectly named metrics', () => {
    render(
      <ExecutiveSummary fixtures={{ metrics: [
        null,
        { label: labels[0], value: 99, displayState: 'not-specified' },
        { label: labels[1], value: Infinity, displayState: 'available' },
        { label: labels[2], value: {}, displayState: 'available' },
        { label: labels[3], value: ' ', displayState: 'available' },
        { label: 'invented card', value: 7, displayState: 'available' },
      ] }} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.queryByText('99')).not.toBeInTheDocument();
    expect(screen.queryByText('invented card')).not.toBeInTheDocument();
    labels.forEach((label) => {
      expect(within(screen.getByRole('article', { name: label })).getAllByText('Not specified')).toHaveLength(3);
    });
  });

  it('retains gaps, rejects invalid identities/statuses, and never coerces values to zero', () => {
    render(
      <ExecutiveSummary fixtures={{ axes: ['A', 'B', 'C'], regions: [
        null, {}, { label: ' ' }, { label: 9 },
        { label: 'Synthetic partial', displayState: 'available', status: 'good', values: [5, '6', NaN] },
        { label: 'Synthetic unavailable', displayState: 'not-specified', status: 'Good', values: [9, 9, 9] },
        { label: 'Synthetic absent', displayState: 'available', status: {}, values: null },
      ] }} />
    );
    expect(chart.props.data.datasets.map((series) => series.data)).toEqual([[5, null, null], [null, null, null], [null, null, null]]);
    const table = screen.getByRole('table', { name: 'Regional performance statuses' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Not specified', 'Not specified', 'Not specified']);
    const values = screen.getByRole('table', { name: 'Regional KPI Comparison — textual data' });
    expect(within(values).getAllByText('Not specified')).toHaveLength(8);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('rejects malformed axes without shifting region values onto other labels', () => {
    render(
      <ExecutiveSummary fixtures={{ axes: ['A', null, 'B'], regions: [
        { label: 'Synthetic region', displayState: 'available', status: 'Good', values: [1, 2, 3] },
      ] }} />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Radar axes and values: Not specified.')).toBeVisible();
    expect(screen.getByRole('table', { name: 'Regional performance statuses' })).toHaveTextContent('Good');
    const table = screen.getByRole('table', { name: 'Regional KPI Comparison — textual data' });
    expect(within(table).queryByRole('cell')).not.toBeInTheDocument();
  });

  it('preserves chart equivalents and statuses when external canvas drawing fails', () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    chart.fail = true;
    render(
      <ExecutiveSummary fixtures={{ axes: ['Synthetic axis'], regions: [
        { label: 'Synthetic region', displayState: 'available', status: 'Warning', values: [4] },
      ] }} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable');
    expect(screen.getByRole('table', { name: 'Regional KPI Comparison — textual data' })).toHaveTextContent('4');
    expect(screen.getByRole('table', { name: 'Regional performance statuses' })).toHaveTextContent('Warning');
    diagnostic.mockRestore();
  });

  it('selects one executive panel by click and keyboard while preserving auth/assistant without requests or writes', async () => {
    window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":"synthetic"}');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const diagnostic = vi.spyOn(console, 'error');
    render(
      <App />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Executive Summary' }));
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: 'Executive Summary' })).toContainElement(screen.getByRole('article', { name: 'IT Health Score' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible();
    expect(screen.getByRole('button', { name: /assistant/i })).toBeVisible();
    expect(within(screen.getByRole('tabpanel')).queryByRole('button')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Strategic Command' }));
    screen.getByRole('tab', { name: 'Strategic Command' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Executive Summary' })).toHaveFocus();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    const region = screen.getByRole('region', { name: 'Regional performance status table' });
    region.focus();
    await user.keyboard('{Enter} ');
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
  });
});
