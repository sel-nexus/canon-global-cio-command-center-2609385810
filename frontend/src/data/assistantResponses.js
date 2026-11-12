/** Keep approved local narratives separate from presentation and resolution. */
export const ASSISTANT_RESPONSES = Object.freeze({
  q4: 'Focus on innovation acceleration, risk reduction, and board readiness initiatives.',
  tcs: 'TCS partnership expansion recommended based on ROI growth and delivery performance.',
  risk: 'Strengthen cybersecurity posture and compliance tracking across regions.',
  innovation: 'Increase investment in AI/ML and automation pipelines to drive long-term value.',
});

export const ASSISTANT_CHIPS = Object.freeze([
  Object.freeze({ keyword: 'q4', label: 'Q4 Board Presentation Ready' }),
  Object.freeze({ keyword: 'tcs', label: 'TCS Contract Expansion Analysis' }),
  Object.freeze({ keyword: 'risk', label: 'Risk Mitigation Plan' }),
  Object.freeze({ keyword: 'innovation', label: 'Innovation Investment Strategy' }),
]);

export const ASSISTANT_FALLBACK = 'Only the supported demo topics Q4, TCS, risk, and innovation are available.';
export const ASSISTANT_DISCLOSURE = 'Local rule-based simulation — not live or generative AI; not validated advice.';
