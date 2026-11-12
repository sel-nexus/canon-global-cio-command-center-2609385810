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
