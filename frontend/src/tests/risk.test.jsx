/** Verify risk fixture boundaries and local tab wiring without inventing score meaning. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App.jsx';
import RiskGovernance from '../views/RiskGovernance.jsx';
import { RISK_FIXTURES } from '../data/dashboardFixtures.js';
import { seedServerSession } from './serverAuthFixture.js';

const labels = ['Compliance Score', 'Cybersecurity Maturity', 'Data Governance Score'];

describe('Risk & Governance', () => {
  it('shows exactly three unspecified measures and explicit caveats without scales or workflows', () => {
    render(
      <RiskGovernance />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    for (const label of labels) {
      const card = screen.getByRole('article', { name: label, exact: true });
      expect(within(card).getByRole('heading', { name: label, exact: true })).toBeVisible();
      expect(within(card).getAllByText('Not specified', { exact: true })).toHaveLength(3);
    }
    expect(screen.getByText(/Illustrative demo only — not live or verified enterprise data/)).toBeVisible();
    expect(screen.getByText(/Source and calculation are not established/)).toBeVisible();
    expect(screen.getByText(/Framework, severity scale and units are not specified or inferred/)).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NIST|ISO|Critical|Warning|Excellent|[$€£%]|refresh|remediat/i);
    expect(RISK_FIXTURES.metrics.map((metric) => metric.label)).toEqual(labels);
    expect(RISK_FIXTURES.metrics.every((metric) => metric.value === null && metric.displayState === 'not-specified')).toBe(true);
    expect(Object.isFrozen(RISK_FIXTURES)).toBe(true);
    expect(Object.isFrozen(RISK_FIXTURES.metrics)).toBe(true);
    expect(RISK_FIXTURES.metrics.every(Object.isFrozen)).toBe(true);
  });

  it('preserves supplied synthetic zero, finite number and escaped text without adding units or meaning', () => {
    const values = [0, 2.5, '<b>Synthetic value</b>'];
    render(
      <RiskGovernance fixtures={{ metrics: labels.map((label, index) => ({
        label, value: values[index], displayState: 'available',
      })) }} />
    );
    labels.forEach((label, index) => {
      const card = screen.getByRole('article', { name: label });
      expect(within(card).getByText(String(values[index]), { exact: true })).toBeVisible();
      expect(within(card).getAllByText('Not specified')).toHaveLength(2);
    });
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText(/Source and calculation are not established/)).toBeVisible();
  });

  it.each([null, {}, { metrics: null }, { metrics: {} }, { metrics: [] }])(
    'keeps absent or malformed collections unspecified: %j', (fixtures) => {
      // Invalid fixtures deliberately exercise the render boundary, not a supported prop contract.
      const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <RiskGovernance fixtures={fixtures} />
      );
      expect(screen.getAllByRole('article')).toHaveLength(3);
      expect(screen.getAllByText('Not specified', { exact: true })).toHaveLength(9);
      expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument();
      warning.mockRestore();
    },
  );

  it.each([undefined, null, Infinity, -Infinity, NaN, {}, [], true, '', '   '])(
    'rejects an invalid available value without coercion: %j', (value) => {
      const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <RiskGovernance fixtures={{ metrics: labels.map((label) => ({
          label, value, displayState: 'available',
        })) }} />
      );
      expect(screen.getAllByText('Not specified', { exact: true })).toHaveLength(9);
      expect(screen.queryByText('0', { exact: true })).not.toBeInTheDocument();
      warning.mockRestore();
    },
  );

  it('ignores unknown measures and refuses values without an available display state', () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RiskGovernance fixtures={{ metrics: [
        null,
        { label: labels[0], value: 91, displayState: 'not-specified' },
        { label: labels[1], value: 92, displayState: 'unsupported' },
        { label: labels[2], value: 93 },
        { label: 'Unknown measure', value: 94, displayState: 'available' },
      ] }} />
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getAllByText('Not specified', { exact: true })).toHaveLength(9);
    expect(screen.queryByText(/Unknown|91|92|93|94/)).not.toBeInTheDocument();
    warning.mockRestore();
  });

  it('mounts only the selected risk panel and preserves keyboard access through the real shell', async () => {
    const user = userEvent.setup();
    seedServerSession('risk.synthetic');
    render(
      <App />
    );
    await screen.findByRole('tabpanel', { name: 'Strategic Command' });
    expect(screen.queryByRole('heading', { name: labels[0] })).not.toBeInTheDocument();
    const tab = screen.getByRole('tab', { name: 'Risk & Governance', exact: true });
    await user.click(tab);
    const panel = screen.getByRole('tabpanel', { name: 'Risk & Governance' });
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(within(panel).getAllByRole('article')).toHaveLength(3);
    expect(tab).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Operations', exact: true })).toHaveFocus();
    expect(screen.queryByRole('heading', { name: labels[0] })).not.toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(tab).toHaveFocus();
    expect(tab).toHaveAttribute('aria-selected', 'true');
    await user.tab();
    expect(screen.getByRole('tabpanel', { name: 'Risk & Governance' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible();
  });
});
