import type { CurriculumDiagram } from "./types"

/**
 * Interactive fill-in-the-blank diagrams (P7.2, migration 061). Bodies are
 * JSON matching `InteractiveDiagramSchema` in packages/contracts/src/diagram.ts
 * and are rendered by `DiagramFillBlank` — never by Mermaid.
 *
 * Coordinates are node centres on an abstract canvas (roughly 0–900 × 0–520).
 */

const daFlow = {
  prompt:
    "Depreciation rises by $10 and the tax rate is 25%. Fill in how each line changes.",
  nodes: [
    { id: "da", label: "Income statement: D&A +10", x: 120, y: 60 },
    {
      id: "ebt",
      label: "Pre-tax income",
      x: 120,
      y: 200,
      blank: {
        answer: "−10",
        options: ["−10", "+10", "−7.5", "0"],
        explain: "Higher D&A is an expense, so pre-tax income falls by the full 10.",
      },
    },
    {
      id: "tax",
      label: "Taxes (25%)",
      x: 120,
      y: 340,
      blank: {
        answer: "−2.5",
        options: ["−2.5", "+2.5", "−10", "0"],
        explain: "Taxes fall by 10 × 25% = 2.5 — the D&A tax shield.",
      },
    },
    {
      id: "ni",
      label: "Net income",
      x: 380,
      y: 270,
      blank: {
        answer: "−7.5",
        options: ["−7.5", "−10", "−2.5", "+2.5"],
        explain: "Net income falls by 10 × (1 − 25%) = 7.5.",
      },
    },
    {
      id: "cfo",
      label: "Cash from operations",
      x: 620,
      y: 130,
      blank: {
        answer: "+2.5",
        options: ["+2.5", "−7.5", "+10", "0"],
        explain: "Start at −7.5 of net income and add back the 10 of non-cash D&A: +2.5.",
      },
    },
    {
      id: "ppe",
      label: "PP&E",
      x: 620,
      y: 270,
      blank: {
        answer: "−10",
        options: ["−10", "+10", "−7.5", "0"],
        explain: "Accumulated depreciation grows by 10, so net PP&E falls by 10.",
      },
    },
    {
      id: "re",
      label: "Retained earnings",
      x: 620,
      y: 410,
      blank: {
        answer: "−7.5",
        options: ["−7.5", "−10", "+2.5", "0"],
        explain: "Retained earnings move with net income: −7.5.",
      },
    },
    {
      id: "check",
      label: "Balance: assets +2.5 − 10 = −7.5 = equity −7.5",
      x: 840,
      y: 270,
    },
  ],
  edges: [
    { from: "da", to: "ebt", label: "expense" },
    { from: "ebt", to: "tax", label: "× 25%" },
    { from: "ebt", to: "ni" },
    { from: "tax", to: "ni" },
    { from: "ni", to: "cfo" },
    { from: "da", to: "cfo", label: "add back" },
    { from: "da", to: "ppe" },
    { from: "ni", to: "re" },
    { from: "cfo", to: "check", label: "cash" },
    { from: "ppe", to: "check" },
    { from: "re", to: "check" },
  ],
}

const evBridge = {
  prompt:
    "Enterprise value is 1,000. Debt is 300, preferred stock 50, non-controlling interest 30 and cash 100, with 36 diluted shares. Bridge to equity value and share price.",
  nodes: [
    { id: "ev", label: "Enterprise value: 1,000", x: 110, y: 240 },
    {
      id: "debt",
      label: "Debt 300",
      x: 330,
      y: 70,
      blank: {
        answer: "− 300",
        options: ["− 300", "+ 300"],
        explain: "Debt is a claim of lenders, so it is subtracted from EV.",
      },
    },
    {
      id: "pref",
      label: "Preferred stock 50",
      x: 330,
      y: 185,
      blank: {
        answer: "− 50",
        options: ["− 50", "+ 50"],
        explain: "Preferred holders rank ahead of common equity — subtract.",
      },
    },
    {
      id: "nci",
      label: "Non-controlling interest 30",
      x: 330,
      y: 300,
      blank: {
        answer: "− 30",
        options: ["− 30", "+ 30"],
        explain:
          "EV consolidates 100% of the subsidiary's EBITDA, so the minority owners' share is subtracted.",
      },
    },
    {
      id: "cash",
      label: "Cash 100",
      x: 330,
      y: 415,
      blank: {
        answer: "+ 100",
        options: ["+ 100", "− 100"],
        explain: "Cash is a non-operating asset that belongs to shareholders — add it back.",
      },
    },
    {
      id: "eq",
      label: "Equity value",
      x: 580,
      y: 240,
      blank: {
        answer: "720",
        options: ["720", "520", "880", "1,180"],
        explain: "1,000 − 300 − 50 − 30 + 100 = 720.",
      },
    },
    {
      id: "px",
      label: "Share price (÷ 36 diluted shares)",
      x: 850,
      y: 240,
      blank: {
        answer: "20.00",
        options: ["20.00", "27.78", "14.44", "24.44"],
        explain: "720 ÷ 36 = 20.00 per share.",
      },
    },
  ],
  edges: [
    { from: "ev", to: "debt" },
    { from: "ev", to: "pref" },
    { from: "ev", to: "nci" },
    { from: "ev", to: "cash" },
    { from: "debt", to: "eq" },
    { from: "pref", to: "eq" },
    { from: "nci", to: "eq" },
    { from: "cash", to: "eq" },
    { from: "eq", to: "px", label: "÷ shares" },
  ],
}

const lboSourcesUses = {
  prompt:
    "A sponsor buys a company with EBITDA of 100 at 10.0x enterprise value, raises debt of 5.0x EBITDA and pays 20 of fees. Complete sources and uses.",
  nodes: [
    {
      id: "price",
      label: "Use: purchase enterprise value",
      x: 140,
      y: 80,
      blank: {
        answer: "1,000",
        options: ["1,000", "500", "1,020", "100"],
        explain: "100 of EBITDA × 10.0x = 1,000.",
      },
    },
    { id: "fees", label: "Use: transaction fees 20", x: 140, y: 250 },
    {
      id: "uses",
      label: "Total uses",
      x: 400,
      y: 165,
      blank: {
        answer: "1,020",
        options: ["1,020", "1,000", "980", "520"],
        explain: "1,000 + 20 of fees = 1,020.",
      },
    },
    {
      id: "debt",
      label: "Source: debt at 5.0x EBITDA",
      x: 660,
      y: 80,
      blank: {
        answer: "500",
        options: ["500", "600", "1,000", "200"],
        explain: "5.0x × 100 of EBITDA = 500.",
      },
    },
    {
      id: "equity",
      label: "Source: sponsor equity (plug)",
      x: 660,
      y: 250,
      blank: {
        answer: "520",
        options: ["520", "500", "480", "1,020"],
        explain: "Equity plugs the gap: 1,020 − 500 = 520 (about 51% of uses).",
      },
    },
    { id: "check", label: "Total sources = total uses", x: 400, y: 400 },
  ],
  edges: [
    { from: "price", to: "uses" },
    { from: "fees", to: "uses" },
    { from: "debt", to: "check" },
    { from: "equity", to: "check" },
    { from: "uses", to: "check", label: "must equal" },
  ],
}

const waccBuild = {
  prompt:
    "Risk-free rate 4%, levered beta 1.2, equity risk premium 5%, pre-tax cost of debt 6%, tax rate 25%, target debt / total capital 30%. Build WACC.",
  nodes: [
    { id: "rf", label: "Risk-free 4%", x: 100, y: 50 },
    { id: "beta", label: "Levered beta 1.2", x: 100, y: 150 },
    { id: "erp", label: "Equity risk premium 5%", x: 100, y: 250 },
    { id: "kd", label: "Pre-tax cost of debt 6%, tax 25%", x: 100, y: 400 },
    {
      id: "ke",
      label: "Cost of equity (CAPM)",
      x: 360,
      y: 150,
      blank: {
        answer: "10.0%",
        options: ["10.0%", "9.0%", "6.0%", "11.0%"],
        explain: "4% + 1.2 × 5% = 10.0%.",
      },
    },
    {
      id: "atkd",
      label: "After-tax cost of debt",
      x: 360,
      y: 400,
      blank: {
        answer: "4.5%",
        options: ["4.5%", "6.0%", "1.5%", "7.5%"],
        explain: "6% × (1 − 25%) = 4.5% — interest is tax-deductible.",
      },
    },
    {
      id: "weights",
      label: "Capital structure weights",
      x: 600,
      y: 400,
      blank: {
        answer: "E/V 70%, D/V 30%",
        options: ["E/V 70%, D/V 30%", "E/V 30%, D/V 70%", "E/V 100%, D/V 0%"],
        explain: "Debt is 30% of total capital, so equity is 70%.",
      },
    },
    {
      id: "wacc",
      label: "WACC",
      x: 600,
      y: 150,
      blank: {
        answer: "8.35%",
        options: ["8.35%", "8.80%", "7.25%", "10.0%"],
        explain: "70% × 10.0% + 30% × 4.5% = 7.0% + 1.35% = 8.35%.",
      },
    },
    { id: "use", label: "Discount rate for unlevered FCF", x: 830, y: 150 },
  ],
  edges: [
    { from: "rf", to: "ke" },
    { from: "beta", to: "ke" },
    { from: "erp", to: "ke" },
    { from: "kd", to: "atkd", label: "× (1 − t)" },
    { from: "ke", to: "wacc" },
    { from: "atkd", to: "wacc" },
    { from: "weights", to: "wacc" },
    { from: "wacc", to: "use" },
  ],
}

export const INTERACTIVE_DIAGRAMS: CurriculumDiagram[] = [
  {
    id: "diag_quiz_da_flow",
    slug: "quiz-depreciation-three-statements",
    title: "Quiz: $10 of depreciation through the statements",
    diagram_type: "finance-quiz",
    format: "interactive-json",
    version: "1",
    topics: ["accounting"],
    concept_ids: ["concept_accounting_foundations"],
    body: JSON.stringify(daFlow),
    a11y:
      "Fill-in quiz. D&A up 10 at a 25% tax rate: pre-tax income −10, taxes −2.5, net income −7.5, cash from operations +2.5 after adding back D&A, PP&E −10, retained earnings −7.5. Assets change by +2.5 − 10 = −7.5, matching equity −7.5, so the balance sheet balances.",
  },
  {
    id: "diag_quiz_ev_bridge",
    slug: "quiz-ev-bridge",
    title: "Quiz: EV to equity value bridge",
    diagram_type: "finance-quiz",
    format: "interactive-json",
    version: "1",
    topics: ["enterprise_value"],
    concept_ids: ["concept_ev_equity_value"],
    body: JSON.stringify(evBridge),
    a11y:
      "Fill-in quiz. From enterprise value of 1,000 subtract debt 300, preferred stock 50 and non-controlling interest 30, and add cash 100: equity value is 720. Divided by 36 diluted shares the implied share price is 20.00.",
  },
  {
    id: "diag_quiz_lbo_sources_uses",
    slug: "quiz-lbo-sources-uses",
    title: "Quiz: LBO sources and uses",
    diagram_type: "finance-quiz",
    format: "interactive-json",
    version: "1",
    topics: ["lbo"],
    concept_ids: ["concept_lbo_paper_lbo"],
    body: JSON.stringify(lboSourcesUses),
    a11y:
      "Fill-in quiz. Purchase enterprise value is 100 × 10.0x = 1,000; with 20 of fees total uses are 1,020. Debt at 5.0x EBITDA is 500, so sponsor equity plugs 520 and total sources equal total uses.",
  },
  {
    id: "diag_quiz_wacc_build",
    slug: "quiz-wacc-build",
    title: "Quiz: WACC build-up",
    diagram_type: "finance-quiz",
    format: "interactive-json",
    version: "1",
    topics: ["valuation"],
    concept_ids: ["concept_dcf_wacc"],
    body: JSON.stringify(waccBuild),
    a11y:
      "Fill-in quiz. Cost of equity is 4% + 1.2 × 5% = 10.0%. After-tax cost of debt is 6% × (1 − 25%) = 4.5%. With 70% equity and 30% debt, WACC = 0.7 × 10.0% + 0.3 × 4.5% = 8.35%, the discount rate for unlevered free cash flow.",
  },
]
