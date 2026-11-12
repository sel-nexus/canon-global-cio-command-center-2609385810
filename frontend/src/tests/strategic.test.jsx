/** Verify strategic acceptance and shared components with synthetic test data only. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import StrategicCommand from '../views/StrategicCommand.jsx';
import { MetricCard, displayValue } from '../components/MetricCard.jsx';
import { MockDataNotice } from '../components/MockDataNotice.jsx';
import { ChartPanel } from '../components/ChartPanel.jsx';
import { PanelErrorBoundary } from '../components/PanelErrorBoundary.jsx';
import { STRATEGIC_METRICS, STRATEGIC_PERIODS, STRATEGIC_SERIES } from '../data/dashboardFixtures.js';
import { STORAGE_KEYS } from '../services/localStorage.js';

const chart = vi.hoisted(() => ({ props: null, fail: false, viewFail: false }));
// jsdom has no canvas; replace only the external drawing dependency, not our wrapper.
vi.mock('react-chartjs-2', () => ({
  Chart: (props) => {
    chart.props = props;
    if (chart.fail) throw new Error('synthetic canvas failure');
    return (
      <canvas role={props.role} aria-label={props['aria-label']} />
    );
  },
}));
vi.mock('../views/StrategicCommand.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    default: () => {
      if (chart.viewFail) throw new Error('synthetic view failure');
      return (
        <actual.default />
      );
    },
  };
});

beforeEach(() => {
  chart.props = null;
  chart.fail = false;
  chart.viewFail = false;
});

/** Silence only expected React diagnostics within explicitly induced failure tests. */
function expectedDiagnostic() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('Strategic acceptance', () => {
  it('renders exactly three named cards with missing values, trends and insights', () => {
    render(
      <StrategicCommand />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    for (const label of ['Business Impact', 'Risk', 'Innovation']) {
      const card = screen.getByRole('article', { name: label });
      expect(within(card).getByRole('heading', { name: label })).toBeVisible();
      expect(within(card).getAllByText('Not specified')).toHaveLength(3);
      for (const field of ['Value', 'Trend', 'AI insight']) {
        expect(within(card).getByText(field)).toBeVisible();
      }
    }
    expect(STRATEGIC_METRICS.every((metric) => metric.value === null && metric.trend === null && metric.insight === null)).toBe(true);
  });

  it('preserves twelve relative periods and all null signals in the text equivalent', () => {
    render(
      <StrategicCommand />
    );
    const table = screen.getByRole('table', { name: 'Twelve-Month Strategic Trends — textual data' });
    expect(within(table).getAllByRole('row')).toHaveLength(13);
    STRATEGIC_PERIODS.forEach((period) => {
      const row = within(table).getByRole('rowheader', { name: period, exact: true }).closest('tr');
      expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Not specified', 'Not specified', 'Not specified']);
    });
    expect(STRATEGIC_SERIES.every((series) => series.data.length === 12 && series.data.every((value) => value === null))).toBe(true);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/units, scales or calculations/)).toBeVisible();
  });

  it('keeps priorities, actions and quick actions neutral without invented action labels', () => {
    render(
      <StrategicCommand />
    );
    for (const name of ['Strategic Priorities', 'Recommended Actions', 'Quick Actions']) {
      const section = screen.getByRole('heading', { name }).closest('section');
      expect(section).toHaveTextContent(/Not specified/);
      expect(within(section).queryByRole('button')).not.toBeInTheDocument();
    }
    expect(screen.getByText(/Values, trends and AI insights have not been specified/)).toBeVisible();
  });

  it('mounts Strategic by default within one named panel and preserves other shell headings', async () => {
    window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":"demo"}');
    render(
      <App />
    );
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel', { name: 'Strategic Command' })).toContainElement(screen.getByRole('article', { name: 'Risk' }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Operations' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Operations' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Strategic Command' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('does not mutate storage, content, navigation or network on button click/keyboard activation', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <StrategicCommand />
    );
    const content = document.body.textContent;
    const location = window.location.href;
    const user = userEvent.setup();
    for (const name of ['Export Data', 'Predictive Analysis']) {
      const button = screen.getByRole('button', { name, exact: true });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(/inactive/);
      await user.click(button);
      button.focus();
      await user.keyboard('{Enter} ');
    }
    expect(document.body.textContent).toBe(content);
    expect(window.location.href).toBe(location);
    expect(writes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
  });

  it('preserves shell and heading on view failure and recovers by switching views', async () => {
    const diagnostic = expectedDiagnostic();
    chart.viewFail = true;
    window.localStorage.setItem(STORAGE_KEYS.session, '{"version":1,"username":"demo"}');
    render(
      <App />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Panel unavailable');
    expect(screen.getByRole('heading', { name: 'Strategic Command' })).toBeVisible();
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Operations' }));
    chart.viewFail = false;
    await user.click(screen.getByRole('tab', { name: 'Strategic Command' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    diagnostic.mockRestore();
  });
});

describe('Shared display boundaries', () => {
  it('renders synthetic available metric fields and preserves genuine zero', () => {
    render(
      <MetricCard label="Synthetic" value={0} trend="Synthetic trend" insight="Synthetic insight" />
    );
    expect(screen.getByText('0')).toBeVisible();
    expect(screen.getByText('Synthetic trend')).toBeVisible();
    expect(screen.getByText('Synthetic insight')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Not specified')).not.toBeInTheDocument();
  });

  it('handles omitted, null, nonfinite, blank and invalid primitive display values safely', () => {
    for (const value of [null, undefined, NaN, Infinity, '', ' ', {}, [], false]) {
      expect(displayValue(value)).toBe('Not specified');
    }
    const diagnostic = expectedDiagnostic();
    render(
      <MetricCard label={null} value={{ bad: true }} trend={NaN} insight={null} />
    );
    expect(screen.getAllByText('Not specified')).toHaveLength(4);
    diagnostic.mockRestore();
  });

  it('keeps the mock caveat visible with and without additional context', () => {
    const { rerender } = render(
      <MockDataNotice />
    );
    expect(screen.getByText(/not live or verified/)).toBeVisible();
    rerender(
      <MockDataNotice>Additional synthetic caveat.</MockDataNotice>
    );
    expect(screen.getByText(/Additional synthetic caveat/)).toBeVisible();
    expect(screen.getByText(/Not validated advice/)).toBeVisible();
  });

  it.each(['line', 'bar', 'radar', 'doughnut', 'pie', 'polarArea', 'scatter', 'bubble'])('passes safe synthetic %s data to real integration boundary and preserves equivalents', (type) => {
    const values = type === 'scatter' || type === 'bubble' ? [{ x: 1, y: 2 }, null] : [7, null];
    render(
      <ChartPanel
        title="Synthetic chart"
        description="Synthetic purpose"
        caveat="Synthetic only"
        type={type}
        labels={['A', 'B']}
        series={[{ label: 'Synthetic signal', data: values }]}
      />
    );
    expect(screen.getByRole('img')).toHaveAccessibleName('Synthetic chart — textual data below');
    expect(chart.props.type).toBe(type);
    expect(chart.props.data.datasets[0].data).toEqual(values);
    expect(screen.getByRole('table')).toHaveTextContent(type === 'scatter' || type === 'bubble' ? 'x: 1; y: 2' : '7');
    expect(screen.getByRole('table')).toHaveTextContent('Not specified');
    expect(screen.getByText('Synthetic purpose')).toBeVisible();
  });

  it('supports caller-defined mixed series axes and explicit table without inventing units', () => {
    render(
      <ChartPanel
        title="Synthetic mixed"
        labels={['A']}
        series={[{ label: 'Left', data: [0], type: 'bar', yAxisID: 'left' }, { label: 'Right', data: [3], yAxisID: 'right' }]}
        options={{ scales: { left: { title: { display: true, text: 'Synthetic left' } }, right: { position: 'right' } } }}
        tableHeaders={['Supplied text']}
        tableRows={[{ label: 'Supplied category', values: ['Supplied value'] }]}
      />
    );
    expect(chart.props.data.datasets[0]).toMatchObject({ data: [0], type: 'bar', yAxisID: 'left' });
    expect(chart.props.data.datasets[1].yAxisID).toBe('right');
    expect(chart.props.options.scales.left.title.text).toBe('Synthetic left');
    expect(chart.props.options.animation).toBe(false);
    expect(screen.getByRole('table')).toHaveTextContent('Supplied category');
    expect(screen.getByRole('table')).toHaveTextContent('Supplied value');
    expect(chart.props.data.datasets[0].pointStyle).not.toBe(chart.props.data.datasets[1].pointStyle);
  });

  it('preserves title, caveat and all text data when canvas rendering fails', () => {
    const diagnostic = expectedDiagnostic();
    chart.fail = true;
    render(
      <ChartPanel
        title="Failure chart"
        description="Preserved purpose"
        caveat="Preserved caveat"
        labels={['A', 'B']}
        series={[{ label: 'Synthetic', data: [5, null] }]}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chart unavailable');
    expect(screen.getByRole('heading', { name: 'Failure chart' })).toBeVisible();
    expect(screen.getByText('Preserved purpose')).toBeVisible();
    expect(screen.getByText('Preserved caveat')).toBeVisible();
    expect(screen.getByRole('table')).toHaveTextContent('5');
    expect(screen.getByRole('table')).toHaveTextContent('Not specified');
    diagnostic.mockRestore();
  });

  it('handles null collections, invalid rows and invalid chart values/types safely', () => {
    const diagnostic = expectedDiagnostic();
    const { rerender } = render(
      <ChartPanel title={null} description={null} caveat={null} labels={null} series={null} options={null} tableRows={null} />
    );
    expect(screen.getByText('Categories and values: Not specified.')).toBeVisible();
    rerender(
      <ChartPanel
        title="Invalid"
        type="unknown"
        labels={{}}
        series={[null, { label: 'Test', data: [undefined, NaN, Infinity, '4', {}, { x: 1, y: NaN }, { x: 1, y: 2, r: NaN }] }]}
        tableHeaders={['Test']}
        tableRows={[null, { label: 'Bad row', values: null }]}
      />
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(/Chart type unavailable/)).toBeVisible();
    expect(screen.getByRole('table')).toHaveTextContent('Bad row');
    expect(screen.getByRole('table')).toHaveTextContent('Not specified');
    diagnostic.mockRestore();
  });

  it('normalizes invalid series points to null rather than zero while retaining finite data', () => {
    const diagnostic = expectedDiagnostic();
    render(
      <ChartPanel title="Sanitized" labels={['A', 'B', 'C', 'D']} series={[{ label: 'Test', data: [0, NaN, '3', undefined] }]} />
    );
    expect(chart.props.data.datasets[0].data).toEqual([0, null, null, null]);
    expect(screen.getByRole('table')).toHaveTextContent('0');
    expect(within(screen.getByRole('table')).getAllByText('Not specified')).toHaveLength(3);
    diagnostic.mockRestore();
  });

  it('passes through healthy children in the shared panel boundary', () => {
    render(
      <PanelErrorBoundary>
        <p>Healthy panel content</p>
      </PanelErrorBoundary>
    );
    expect(screen.getByText('Healthy panel content')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
