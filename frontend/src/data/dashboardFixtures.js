/** Keep approved strategic labels separate from absent domain values. */
export const STRATEGIC_METRICS = Object.freeze([
  'Business Impact',
  'Risk',
  'Innovation',
].map((label) => Object.freeze({ label, value: null, trend: null, insight: null })));

/** Identify relative periods without inventing calendar dates. */
export const STRATEGIC_PERIODS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `Month ${index + 1}`),
);

/** Preserve missing signals as null, never a calculated or implied zero. */
export const STRATEGIC_SERIES = Object.freeze(
  STRATEGIC_METRICS.map(({ label }) => Object.freeze({
    label,
    data: Object.freeze(STRATEGIC_PERIODS.map(() => null)),
  })),
);

/** Keep exact operational labels while leaving all unsupplied domain data neutral. */
export const EXECUTIVE_METRICS = Object.freeze([
  'IT Health Score',
  'Availability',
  'Security Posture',
  'Transformation Index',
].map((label) => Object.freeze({ label, value: null, displayState: 'not-specified' })));

/** Supply no region identities, radar axes, statuses or numerical defaults. */
export const EXECUTIVE_FIXTURES = Object.freeze({
  metrics: EXECUTIVE_METRICS,
  axes: Object.freeze([]),
  regions: Object.freeze([]),
});

/** Keep chart indicators distinct from the three approved business value cards. */
export const BUSINESS_CHART_LABELS = Object.freeze(['Revenue', 'Cost Avoidance', 'ROI']);

/** Preserve absent financial values without attributing or calculating outcomes. */
export const BUSINESS_METRICS = Object.freeze([
  'Revenue Attribution',
  'Cost Savings',
  'Innovation ROI',
].map((label) => Object.freeze({ label, value: null, displayState: 'not-specified' })));

/** Supply no business categories, dates, units or numerical defaults. */
export const BUSINESS_FIXTURES = Object.freeze({
  metrics: BUSINESS_METRICS,
  labels: Object.freeze([]),
  charts: Object.freeze(BUSINESS_CHART_LABELS.map((label) => Object.freeze({
    label,
    displayState: 'not-specified',
    data: Object.freeze([]),
  }))),
});

/** Keep the two operational signals independent without assuming units or periods. */
export const OPERATIONS_CHART_LABELS = Object.freeze(['Incidents', 'Efficiency']);

/** Preserve the exact requested metrics and leave unsupplied values unavailable. */
export const OPERATIONS_METRICS = Object.freeze([
  'Total incidents (MTD)',
  'MTTR',
  'Efficiency metrics',
].map((label) => Object.freeze({ label, value: null, displayState: 'not-specified' })));

/** Supply no operational values, dates, units or calculated defaults. */
export const OPERATIONS_FIXTURES = Object.freeze({
  metrics: OPERATIONS_METRICS,
  labels: Object.freeze([]),
  charts: Object.freeze(OPERATIONS_CHART_LABELS.map((label) => Object.freeze({
    label,
    displayState: 'not-specified',
    data: Object.freeze([]),
  }))),
});

/** Preserve exact risk measures without inventing scores or their definitions. */
export const RISK_METRICS = Object.freeze([
  'Compliance Score',
  'Cybersecurity Maturity',
  'Data Governance Score',
].map((label) => Object.freeze({ label, value: null, displayState: 'not-specified' })));

/** Supply no risk values, framework, severity scale, source or calculation. */
export const RISK_FIXTURES = Object.freeze({ metrics: RISK_METRICS });

/** Preserve the three requested innovation measures without supplying values. */
export const INNOVATION_METRICS = Object.freeze([
  'AI models in production',
  'Innovation pipeline value',
  'Patents',
].map((label) => Object.freeze({ label, value: null, displayState: 'not-specified' })));

/** Leave portfolio taxonomy and distribution values absent, not calculated. */
export const INNOVATION_FIXTURES = Object.freeze({
  metrics: INNOVATION_METRICS,
  labels: Object.freeze([]),
  distribution: Object.freeze({ displayState: 'not-specified', data: Object.freeze([]) }),
});
