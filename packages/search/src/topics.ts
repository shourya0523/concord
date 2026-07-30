/**
 * Topic inference for Glassdoor occurrence → heat (signals only).
 * Aligns loosely with seed/teaching topics used in Mode A rooms.
 */

export type TopicRule = {
  topic_id: string;
  patterns: RegExp[];
};

/** Ordered rules — first match wins. */
export const TOPIC_RULES: TopicRule[] = [
  {
    topic_id: "lbo",
    patterns: [/\blbo\b/i, /leveraged buyout/i, /\bmoic\b/i, /\birr\b/i, /debt paydown/i],
  },
  {
    topic_id: "valuation",
    patterns: [
      /\bdcf\b/i,
      /discounted cash/i,
      /\bwacc\b/i,
      /comparable compan/i,
      /trading multipl/i,
      /precedent transaction/i,
      /\bvaluation\b/i,
    ],
  },
  {
    topic_id: "enterprise_value",
    patterns: [/enterprise value/i, /equity value/i, /\bev\b.*\bequity\b/i],
  },
  {
    topic_id: "accounting",
    patterns: [
      /three (financial )?statements/i,
      /income statement/i,
      /balance sheet/i,
      /cash flow statement/i,
      /depreciation/i,
      /working capital/i,
      /\bgaap\b/i,
    ],
  },
  {
    topic_id: "working_capital",
    patterns: [/working capital/i, /\bnwc\b/i],
  },
  {
    topic_id: "merger_models",
    patterns: [/\bmerger\b/i, /\baccretion\b/i, /\bdilution\b/i, /\bm\s*&\s*a\b/i, /accretive/i],
  },
  {
    topic_id: "capital_structure",
    patterns: [/capital structure/i, /cost of (debt|equity|capital)/i, /\bleverage\b/i],
  },
  {
    topic_id: "investment_thesis",
    patterns: [/investment thesis/i, /underwrite/i, /why (this|that) (deal|company|investment)/i],
  },
  {
    topic_id: "due_diligence",
    patterns: [/due diligence/i, /\bdd\b/i],
  },
  {
    topic_id: "restructuring",
    patterns: [/restructur/i, /bankrupt/i, /distressed/i],
  },
  {
    topic_id: "returns",
    patterns: [/\breturns?\b/i, /\bmoic\b/i, /\birr\b/i],
  },
  {
    topic_id: "value_creation",
    patterns: [/value creation/i, /operational improve/i, /add-?on acquisition/i],
  },
  {
    topic_id: "behavioral",
    patterns: [
      /tell me about yourself/i,
      /why (ib|investment banking|private equity|our firm)/i,
      /walk me through your resume/i,
      /strengths? and weaknesses?/i,
      /behavioral/i,
    ],
  },
];

export function inferTopic(text: string): string {
  for (const rule of TOPIC_RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.topic_id;
  }
  return "untagged";
}

/** Intensity formula mirrors published.v_firm_topic_heat: least(1, ln(n+1)/ln(50)). */
export function intensityFromCount(sampleSize: number): number {
  if (sampleSize <= 0) return 0;
  return Math.min(1, Math.log(sampleSize + 1) / Math.log(50));
}
