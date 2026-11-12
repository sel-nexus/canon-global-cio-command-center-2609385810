/** Test-owned synthetic signals; not imported by the production app. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ChartJS from 'chart.js/auto';
import { ChartPanel } from '../src/components/ChartPanel.jsx';
import '../src/index.css';

const labels = ['Synthetic A', 'Synthetic B', 'Synthetic C'];
const series = [
  { label: 'Synthetic primary', data: [3, 7, 0] },
  { label: 'Synthetic secondary', data: [5, null, 9] },
];

// Read-only real-library observation, not mocked drawing or replacement cleanup.
window.chartHarness = {
  getChart: (canvas) => ChartJS.getChart(canvas),
  instanceIds: () => Object.keys(ChartJS.instances),
};

/** Exercise the real wrapper through explicit controls, including StrictMode cleanup. */
function ChartHarness() {
  const [mounted, setMounted] = useState(true);
  return (
    <main className="dashboard-layout">
      <h1>Synthetic chart lifecycle test harness</h1>
      <p>Explicitly synthetic test data only. Not production dashboard fixtures or performance evidence.</p>
      <button type="button" onClick={() => setMounted((current) => !current)}>
        {mounted ? 'Unmount chart' : 'Mount chart'}
      </button>
      {mounted && (
        <ChartPanel
          title="Synthetic lifecycle chart"
          description="Synthetic primary and secondary signals across synthetic categories."
          caveat="Explicitly synthetic test-only values; no business meaning or units."
          labels={labels}
          series={series}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ChartHarness />
  </React.StrictMode>,
);
