/**
 * Question → diagram keyword rules (P2.9). Used by
 * scripts/curriculum/build-migrations.ts to generate canonical.question_diagrams
 * rows from exports/questions.jsonl wording, and at runtime as the no-DB
 * fallback in listDiagramsForQuestion().
 *
 * Each pattern is matched case-insensitively against the question wording.
 * Relevance = strongest matching weight + 0.05 per extra matching pattern
 * (capped at 1.0). Links below MIN_RELEVANCE are dropped.
 */

export const MIN_RELEVANCE = 0.5
export const MAX_DIAGRAMS_PER_QUESTION = 3

export type DiagramRule = {
  diagram_id: string
  patterns: Array<{ re: RegExp; weight: number }>
  /** Wording that disqualifies the rule (e.g. restructuring-specific DCF). */
  exclude?: RegExp
}

const w = (re: RegExp, weight: number) => ({ re, weight })

export const QUESTION_DIAGRAM_RULES: DiagramRule[] = [
  {
    diagram_id: "diag_three_statement",
    patterns: [
      w(/\b(3|three) (financial )?statements\b/i, 0.95),
      w(/\blink(s|ed)? together\b/i, 0.7),
      w(/\bwalk me through how .* (affect|flow)/i, 0.6),
    ],
  },
  {
    diagram_id: "diag_three_statement_linkages",
    patterns: [
      w(/\b(3|three) (financial )?statements\b/i, 0.85),
      w(/\bretained earnings\b/i, 0.75),
      w(/\bcash flow statement\b/i, 0.7),
      w(/\bdepreciation\b/i, 0.65),
      w(/\bcapital expenditures?\b|\bcapex\b/i, 0.6),
      w(/\bbalance sheet\b/i, 0.55),
    ],
    exclude: /\blbo\b|distressed/i,
  },
  {
    diagram_id: "diag_quiz_da_flow",
    patterns: [
      w(/\bdepreciation\b.*\b(affect|flow|going up|non-cash)\b/i, 0.9),
      w(/\bdepreciation\b/i, 0.6),
    ],
  },
  {
    diagram_id: "diag_working_capital",
    patterns: [
      w(/\bworking capital\b/i, 0.95),
      w(/\baccounts receivable\b/i, 0.8),
      w(/\binventory\b/i, 0.7),
      w(/\baccounts payable\b/i, 0.75),
      w(/\bdeferred revenue\b/i, 0.7),
      w(/\baccrued (compensation|expenses)\b/i, 0.65),
    ],
  },
  {
    diagram_id: "diag_ev_bridge",
    patterns: [
      w(/\benterprise value\b/i, 0.9),
      w(/\bequity value\b/i, 0.7),
      w(/\b(minority|non-controlling) interest\b/i, 0.8),
      w(/\bpreferred stock\b/i, 0.65),
      w(/\bnet debt\b/i, 0.6),
    ],
    exclude: /\bmultiple\b|ebitda|\/ ?(scientists|subscribers)/i,
  },
  {
    diagram_id: "diag_quiz_ev_bridge",
    patterns: [
      w(/\bformula for enterprise value\b/i, 0.9),
      w(/\bbridg(e|ing)\b.*\bvalue\b/i, 0.85),
      w(/\bsubtract cash\b/i, 0.8),
      w(/\badd (debt|minority|preferred)\b/i, 0.75),
    ],
  },
  {
    diagram_id: "diag_comps_precedents",
    patterns: [
      w(/\bcompar(able|ables) compan(y|ies)\b|\bpublic company comparables?\b|\bcomps\b/i, 0.9),
      w(/\bprecedent transactions?\b/i, 0.9),
      w(/\bmultiples\b|\b(ebit|ebitda|p\/e|revenue|higher|median|industry-specific) multiples?\b/i, 0.6),
      w(/\bvaluation methodolog/i, 0.55),
    ],
    exclude: /\bexit multiple|lbo|terminal/i,
  },
  {
    diagram_id: "diag_football_field",
    patterns: [
      w(/\bpresent these valuation\b/i, 0.9),
      w(/\brank the (3|three) valuation\b/i, 0.85),
      w(/\b(3|three) (major )?valuation methodolog/i, 0.75),
      w(/\bvaluation methodolog(y|ies)\b/i, 0.6),
    ],
  },
  {
    diagram_id: "diag_dcf_wacc",
    patterns: [
      w(/\bdcf\b/i, 0.9),
      w(/\bterminal value\b/i, 0.9),
      w(/\bfree cash flow\b/i, 0.75),
      w(/\bdiscount rate\b/i, 0.7),
      w(/\bmid-year convention\b/i, 0.7),
      w(/\bgordon growth\b/i, 0.8),
    ],
    exclude: /\bbank or other financial|financial institutions?\b/i,
  },
  {
    diagram_id: "diag_wacc_build",
    patterns: [
      w(/\bwacc\b/i, 0.95),
      w(/\bcost of equity\b/i, 0.9),
      w(/\bbeta\b/i, 0.85),
      w(/\bcost of debt\b/i, 0.8),
      w(/\bcapm\b/i, 0.85),
    ],
    exclude: /personal beta/i,
  },
  {
    diagram_id: "diag_quiz_wacc_build",
    patterns: [
      w(/\bwacc\b/i, 0.8),
      w(/\bcost of equity\b/i, 0.7),
      w(/\bun-?lever and re-?lever\b/i, 0.7),
    ],
    exclude: /personal beta/i,
  },
  {
    diagram_id: "diag_ddm",
    patterns: [
      w(/\bdividend discount\b|\bddm\b/i, 0.95),
      w(/\bfinancial institutions?\b/i, 0.8),
      w(/\bbank or other financial\b/i, 0.8),
    ],
  },
  {
    diagram_id: "diag_lbo_sources_uses",
    patterns: [
      w(/\bsources and uses\b/i, 0.95),
      w(/\bbasic lbo\b/i, 0.85),
      w(/\bhow much debt\b/i, 0.7),
      w(/\bbalance sheet (is )?adjusted in an lbo\b/i, 0.6),
      w(/\blbo\b|\bleveraged buyout\b/i, 0.55),
    ],
    exclude: /distressed/i,
  },
  {
    diagram_id: "diag_quiz_lbo_sources_uses",
    patterns: [
      w(/\bsources and uses\b/i, 0.9),
      w(/\bwalk me through a basic lbo\b/i, 0.8),
      w(/\bhow much debt can be raised\b/i, 0.75),
    ],
  },
  {
    diagram_id: "diag_debt_schedule",
    patterns: [
      w(/\brevolver\b/i, 0.95),
      w(/\boptional repayments?\b|\bcash sweep\b/i, 0.95),
      w(/\bdebt schedule\b/i, 0.9),
      w(/\bpik\b|payment in kind/i, 0.8),
      w(/\btranches?\b/i, 0.7),
      w(/\bcovenants?\b/i, 0.65),
      w(/\bbank debt\b|\bhigh-yield debt\b/i, 0.6),
    ],
  },
  {
    diagram_id: "diag_moic_irr",
    patterns: [
      w(/\birr\b/i, 0.9),
      w(/\bmoic\b|\bmultiple of (money|invested capital)\b/i, 0.95),
      w(/\bboost its return\b/i, 0.6),
    ],
  },
  {
    diagram_id: "diag_paper_lbo_returns",
    patterns: [
      w(/\bpaper lbo\b/i, 0.95),
      w(/\bboost its return\b/i, 0.8),
      w(/\bvariables impact an lbo\b/i, 0.8),
      w(/\bincreas(ed|ing) (the )?leverage\b/i, 0.75),
      w(/\bpurchase multiples? and exit multiples?\b/i, 0.75),
    ],
  },
  {
    diagram_id: "diag_returns_attribution",
    patterns: [
      w(/\bvalue creation\b|\bcreate value\b/i, 0.9),
      w(/\bmultiple expansion\b|\bdeleverag/i, 0.9),
      w(/\bboost its return\b/i, 0.75),
      w(/\bbeyond leverage\b/i, 0.85),
    ],
  },
  {
    diagram_id: "diag_merger_model",
    patterns: [
      w(/\bmerger model\b/i, 0.95),
      w(/\bpurchase price\b/i, 0.7),
      w(/\bcash, stock,? (or|and) debt\b|\bpaying 100% in cash\b/i, 0.8),
      w(/\bsynerg(y|ies)\b/i, 0.7),
      w(/\bgoodwill\b.*\b(m&a|acquisition)\b/i, 0.7),
      w(/\bcomplete effects of an acquisition\b/i, 0.85),
    ],
  },
  {
    diagram_id: "diag_accretion_dilution",
    patterns: [
      w(/\baccreti(ve|on)\b/i, 0.95),
      w(/\bdiluti(ve|on)\b/i, 0.8),
      w(/\bp\/e\b.*\bacquires?\b|\bacquires?\b.*\bp\/e\b/i, 0.85),
      w(/\beps\b/i, 0.7),
      w(/\bbreak-even synergies\b/i, 0.85),
    ],
    exclude: /\bdilution in equity value\b|fully diluted/i,
  },
  {
    diagram_id: "diag_restructuring_waterfall",
    patterns: [
      w(/\border of claims\b/i, 0.95),
      w(/\bfulcrum\b/i, 0.95),
      w(/\bmost (to least )?senior\b|\bseniority\b/i, 0.85),
      w(/\bbankrupt(cy)?\b|\bchapter (7|11)\b/i, 0.7),
      w(/\brecover(y|ies)?\b/i, 0.65),
      w(/\bshareholders .* compensation\b/i, 0.7),
    ],
  },
  {
    diagram_id: "diag_pe_distribution_waterfall",
    patterns: [
      w(/\bcarried interest\b|\bcarry\b/i, 0.9),
      w(/\bhurdle\b|\bpreferred return\b/i, 0.9),
      w(/\blimited partners?\b|\bgeneral partners?\b/i, 0.85),
      w(/\bdividend recap/i, 0.55),
    ],
  },
]

export type QuestionDiagramLink = {
  question_id: string
  diagram_id: string
  relevance: number
}

/** Score one question's wording against every rule. */
export function matchDiagramsForWording(
  wording: string,
  rules: DiagramRule[] = QUESTION_DIAGRAM_RULES,
): Array<{ diagram_id: string; relevance: number }> {
  const text = wording.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  const scored: Array<{ diagram_id: string; relevance: number }> = []
  for (const rule of rules) {
    if (rule.exclude?.test(text)) continue
    const weights = rule.patterns.filter((p) => p.re.test(text)).map((p) => p.weight)
    if (weights.length === 0) continue
    const relevance = Math.min(1, Math.max(...weights) + 0.05 * (weights.length - 1))
    if (relevance >= MIN_RELEVANCE) {
      scored.push({ diagram_id: rule.diagram_id, relevance: Math.round(relevance * 100) / 100 })
    }
  }
  return scored
    .sort((a, b) => b.relevance - a.relevance || a.diagram_id.localeCompare(b.diagram_id))
    .slice(0, MAX_DIAGRAMS_PER_QUESTION)
}

/**
 * Topic → primary diagram, used when wording matches no rule but the question
 * carries a topic (export topic or published topic). Relevance TOPIC_RELEVANCE.
 */
export const TOPIC_RELEVANCE = 0.5

export const TOPIC_PRIMARY_DIAGRAMS: Record<string, string[]> = {
  accounting: ["diag_three_statement"],
  working_capital: ["diag_working_capital"],
  enterprise_value: ["diag_ev_bridge"],
  valuation: ["diag_comps_precedents", "diag_dcf_wacc"],
  merger_models: ["diag_merger_model", "diag_accretion_dilution"],
  lbo: ["diag_lbo_sources_uses", "diag_paper_lbo_returns"],
  returns: ["diag_moic_irr"],
  value_creation: ["diag_returns_attribution"],
  capital_structure: ["diag_debt_schedule"],
  credit: ["diag_debt_schedule"],
  restructuring: ["diag_restructuring_waterfall"],
}

/** Keyword links first, then topic links when the wording matches nothing. */
export function linkDiagramsForQuestion(options: {
  wording?: string | null
  topic?: string | null
}): Array<{ diagram_id: string; relevance: number }> {
  const links = options.wording ? matchDiagramsForWording(options.wording) : []
  if (links.length > 0 || !options.topic) return links
  return (TOPIC_PRIMARY_DIAGRAMS[options.topic] ?? []).map((diagram_id) => ({
    diagram_id,
    relevance: TOPIC_RELEVANCE,
  }))
}
