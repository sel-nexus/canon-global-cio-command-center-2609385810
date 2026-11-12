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
