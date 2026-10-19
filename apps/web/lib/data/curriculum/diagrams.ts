import type { CurriculumDiagram } from "./types"

/**
 * Mermaid teaching diagrams (P2.9). The first eight upgrade the diagrams
 * seeded by migrations 032/035/040 (version "2"); the rest are new in 059.
 * Worked numbers are internally consistent — tests re-check the arithmetic
 * notes in the a11y text where it matters.
 */
export const MERMAID_DIAGRAMS: CurriculumDiagram[] = [
  {
    id: "diag_three_statement",
    slug: "three-statement-linkages",
    title: "Three-statement linkages",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["accounting"],
    concept_ids: ["concept_accounting_foundations"],
    body: `flowchart LR
  subgraph IS["Income statement"]
    NI["Net income"]
    DA["D&A expense"]
  end
  subgraph CFS["Cash flow statement"]
    CFO["Cash from operations"]
    CFI["Cash from investing"]
    CFF["Cash from financing"]
    NCC["Net change in cash"]
  end
  subgraph BS["Balance sheet"]
    Cash["Cash"]
    PPE["PP&E"]
    RE["Retained earnings"]
  end
  NI -->|"top line of CFO"| CFO
  DA -->|"added back, non-cash"| CFO
  DA -->|"reduces"| PPE
  NI -->|"less dividends"| RE
  CFO --> NCC
  CFI --> NCC
  CFF --> NCC
  NCC -->|"beginning cash + change"| Cash`,
    a11y:
      "Net income from the income statement is the first line of cash from operations and, after dividends, flows into retained earnings on the balance sheet. D&A is a non-cash expense: it is added back in cash from operations and reduces PP&E. Cash from operations, investing and financing sum to the net change in cash, which updates the balance sheet cash line.",
  },
  {
    id: "diag_ev_bridge",
    slug: "ev-equity-bridge",
    title: "EV to Equity Bridge",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["enterprise_value"],
    concept_ids: ["concept_ev_equity_value"],
    body: `flowchart LR
  EV["Enterprise value<br/>core operations, all capital providers"] --> D["− Total debt"]
  D --> P["− Preferred stock"]
  P --> N["− Non-controlling interest"]
  N --> C["+ Cash and equivalents"]
  C --> I["+ Equity investments and other non-operating assets"]
  I --> Eq["Equity value<br/>common shareholders only"]
  Eq --> PS["÷ Diluted shares = implied share price"]`,
    a11y:
      "Start from enterprise value, the value of the core operations to all capital providers. Subtract debt, preferred stock and non-controlling interest, which are claims of other investors. Add cash and non-operating assets such as equity investments. The result is equity value for common shareholders; dividing by diluted shares gives the implied share price. Running the steps in reverse takes you from equity value to enterprise value.",
  },
  {
    id: "diag_dcf_wacc",
    slug: "dcf-wacc-flow",
    title: "DCF and WACC Flow",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["valuation"],
    concept_ids: ["concept_dcf_wacc"],
    body: `flowchart LR
  Rev["Revenue forecast"] --> EBIT["EBIT"]
  EBIT --> NOPAT["NOPAT = EBIT × (1 − tax rate)"]
  NOPAT --> UFCF["Unlevered FCF = NOPAT + D&A − capex − increase in NWC"]
  UFCF --> PV["PV of forecast-period UFCF"]
  UFCF --> TV["Terminal value<br/>Gordon growth or exit multiple"]
  TV --> PVTV["PV of terminal value"]
  WACC["WACC"] -.->|"discount rate"| PV
  WACC -.->|"discount rate"| PVTV
  PV --> EV["Enterprise value"]
  PVTV --> EV
  EV --> Br["− net debt, preferred, NCI<br/>+ non-operating assets"]
  Br --> Eq["Equity value ÷ diluted shares = implied share price"]`,
    a11y:
      "Forecast revenue down to EBIT, tax it to NOPAT, then add back D&A and subtract capex and the increase in net working capital to get unlevered free cash flow. Discount each year's UFCF and a terminal value (Gordon growth or exit multiple) at WACC and sum them to enterprise value. Bridge to equity value by subtracting net debt, preferred stock and non-controlling interest and adding non-operating assets, then divide by diluted shares for an implied share price.",
  },
  {
    id: "diag_lbo_sources_uses",
    slug: "lbo-sources-uses",
    title: "LBO Sources and Uses",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["lbo"],
    concept_ids: ["concept_lbo_paper_lbo"],
    body: `flowchart LR
  subgraph Sources["Sources"]
    SD["Senior secured debt<br/>term loans, revolver draw"]
    JD["Junior debt<br/>high-yield notes, mezzanine"]
    RO["Management rollover equity"]
    SE["Sponsor equity, the plug"]
  end
  subgraph Uses["Uses"]
    EqP["Purchase target equity<br/>offer price × diluted shares"]
    Refi["Refinance existing debt"]
    Fees["Transaction and financing fees"]
    MC["Cash to balance sheet"]
  end
  SD --> T["Total sources = total uses"]
  JD --> T
  RO --> T
  SE --> T
  T --> EqP
  T --> Refi
  T --> Fees
  T --> MC`,
    a11y:
      "Uses are what the deal must pay for: the target's equity at the offer price times diluted shares, refinancing of existing debt, transaction and financing fees, and any cash left on the balance sheet. Sources fund those uses: senior secured debt, junior debt such as high-yield notes, management rollover and sponsor equity. Sponsor equity is the plug that makes total sources equal total uses.",
  },
  {
    id: "diag_wacc_build",
    slug: "wacc-build-up",
    title: "WACC build-up",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["valuation"],
    concept_ids: ["concept_dcf_wacc"],
    body: `flowchart LR
  Rf["Risk-free rate"] --> Ke["Cost of equity = Rf + levered beta × ERP"]
  B["Peer betas: unlever, take median,<br/>relever at target D/E"] --> Ke
  ERP["Equity risk premium"] --> Ke
  Kd["Pre-tax cost of debt<br/>yield on the company's debt"] --> AT["After-tax cost of debt = Kd × (1 − t)"]
  Ke --> W["WACC = E/V × Ke + D/V × Kd × (1 − t)"]
  AT --> W
  Wt["Target capital structure<br/>market-value weights E/V and D/V"] --> W
  W --> Use["Discount unlevered FCF and terminal value"]`,
    a11y:
      "Cost of equity comes from CAPM: the risk-free rate plus levered beta times the equity risk premium, where beta is unlevered from peers and relevered at the target capital structure. Cost of debt is the pre-tax yield times one minus the tax rate because interest is tax-deductible. WACC weights the two by market-value equity and debt proportions, and it is the rate used to discount unlevered free cash flow and terminal value.",
  },
  {
    id: "diag_accretion_dilution",
    slug: "accretion-dilution",
    title: "Accretion and dilution",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["merger_models"],
    concept_ids: ["concept_merger_model"],
    body: `flowchart TB
  A["Acquirer net income"] --> PF["Pro forma net income"]
  T["Target net income"] --> PF
  S["+ After-tax synergies"] --> PF
  C["− Forgone interest on cash × (1 − t)<br/>− New debt interest × (1 − t)<br/>− New D&A on write-ups × (1 − t)"] --> PF
  Sh["Acquirer shares + new shares issued"] --> EPS
  PF --> EPS["Pro forma EPS = pro forma net income ÷ pro forma shares"]
  EPS --> Cmp{"Compare with acquirer standalone EPS"}
  Cmp -->|"higher"| Acc["Accretive"]
  Cmp -->|"lower"| Dil["Dilutive"]`,
    a11y:
      "Add acquirer and target net income, add after-tax synergies, and subtract the after-tax costs of the deal: interest income lost on cash used, interest on new debt, and extra D&A from asset write-ups. Divide by the acquirer's shares plus any new shares issued to get pro forma EPS. If pro forma EPS is higher than the acquirer's standalone EPS the deal is accretive; if lower it is dilutive.",
  },
  {
    id: "diag_moic_irr",
    slug: "moic-irr",
    title: "MOIC and IRR",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["returns", "lbo"],
    concept_ids: ["concept_lbo_paper_lbo", "concept_pe_fund_mechanics"],
    body: `flowchart LR
  In["Equity invested at entry, year 0"] --> M["MOIC = total equity proceeds ÷ equity invested"]
  Out["Equity proceeds at exit, year n<br/>plus any interim dividends"] --> M
  M --> I["IRR = rate that sets NPV of equity cash flows to zero<br/>single exit: MOIC^(1/n) − 1"]
  I --> R["Rules of thumb<br/>2.0x in 3 yrs ≈ 26%, 2.0x in 5 yrs ≈ 15%<br/>3.0x in 5 yrs ≈ 25%"]
  I -.->|"time matters"| Tm["Same MOIC over a longer hold = lower IRR"]`,
    a11y:
      "MOIC is total equity proceeds divided by equity invested and ignores time. IRR is the discount rate that sets the net present value of the equity cash flows to zero; with a single exit it equals MOIC to the power of one over the holding period, minus one. Rules of thumb: 2.0x over 3 years is about 26%, 2.0x over 5 years about 15%, and 3.0x over 5 years about 25%. The same MOIC over a longer hold means a lower IRR.",
  },
  {
    id: "diag_paper_lbo_returns",
    slug: "paper-lbo-returns",
    title: "Paper LBO returns bridge",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "2",
    topics: ["lbo", "returns"],
    concept_ids: ["concept_lbo_paper_lbo"],
    body: `flowchart TB
  E["Entry: EBITDA 100 × 10.0x = EV 1,000"] --> F["Funding: debt 600 (6.0x), sponsor equity 400"]
  F --> O["5-year hold: EBITDA grows to 150<br/>cumulative FCF of 300 repays debt to 300"]
  O --> X["Exit: EBITDA 150 × 10.0x = EV 1,500"]
  X --> XE["Exit equity = 1,500 − 300 net debt = 1,200"]
  XE --> R["MOIC = 1,200 ÷ 400 = 3.0x, IRR ≈ 25%"]`,
    a11y:
      "Paper LBO: buy EBITDA of 100 at 10.0x for an enterprise value of 1,000, funded with 600 of debt and 400 of sponsor equity. Over five years EBITDA grows to 150 and 300 of cumulative free cash flow repays debt down to 300. Exiting at 10.0x gives an enterprise value of 1,500 and exit equity of 1,200, a 3.0x MOIC and roughly 25% IRR.",
  },
  {
    id: "diag_three_statement_linkages",
    slug: "three-statement-full-linkages",
    title: "Full three-statement linkages",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["accounting", "working_capital"],
    concept_ids: ["concept_accounting_foundations"],
    body: `flowchart LR
  subgraph IS["Income statement"]
    Rev["Revenue − COGS − OpEx = EBITDA"]
    DA["D&A"]
    Int["Interest expense"]
    NI["Net income = (EBITDA − D&A − interest) × (1 − t)"]
  end
  subgraph CFS["Cash flow statement"]
    CFO["CFO = NI + D&A − increase in NWC"]
    CFI["CFI = − capex"]
    CFF["CFF = debt issued − debt repaid − dividends"]
    Net["Net change in cash"]
  end
  subgraph BS["Balance sheet"]
    Cash["Cash"]
    NWC["AR + inventory − AP"]
    PPE["PP&E"]
    Debt["Debt"]
    RE["Retained earnings"]
  end
  Rev --> NI
  DA --> NI
  Int --> NI
  NI --> CFO
  DA -.->|"add back"| CFO
  NWC -.->|"increase uses cash"| CFO
  CFI -->|"capex adds"| PPE
  DA -.->|"depreciation reduces"| PPE
  CFF -->|"issuance or repayment"| Debt
  Debt -.->|"balance × rate"| Int
  NI -->|"NI − dividends"| RE
  CFO --> Net
  CFI --> Net
  CFF --> Net
  Net -->|"beginning + change = ending"| Cash`,
    a11y:
      "Full linkages: EBITDA less D&A and interest, after tax, is net income. Net income starts cash from operations, D&A is added back, and an increase in net working capital (receivables plus inventory minus payables) uses cash. Capex in investing cash flow increases PP&E while depreciation reduces it. Debt issuance or repayment in financing cash flow changes the debt balance, and the debt balance times the interest rate drives interest expense. Net income less dividends rolls into retained earnings, and the three cash flow sections sum to the change in cash on the balance sheet, which keeps assets equal to liabilities plus equity.",
  },
  {
    id: "diag_comps_precedents",
    slug: "comps-precedents",
    title: "Trading comps and precedent transactions",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["valuation"],
    concept_ids: ["concept_valuation_comps"],
    body: `flowchart LR
  Scr["Screen peers: industry, size,<br/>growth, margins, geography"] --> TC["Trading comps<br/>peers' current EV/EBITDA, EV/Revenue, P/E"]
  Scr --> PT["Precedent transactions<br/>EV paid ÷ LTM EBITDA in past deals"]
  TC --> St["Pick a range: 25th–75th percentile around the median"]
  PT -->|"includes control premium, usually higher"| St
  St --> Ap["Apply to target metric<br/>8.0x–10.0x × EBITDA of 50"]
  Ap --> IEV["Implied EV range: 400–500"]
  IEV --> IEq["− net debt of 100 = equity value 300–400<br/>÷ 20m diluted shares = 15.00–20.00 per share"]`,
    a11y:
      "Screen for comparable companies on industry, size, growth, margins and geography. Trading comps use public peers' current multiples such as EV/EBITDA and P/E; precedent transactions use the multiples paid in past acquisitions, which include a control premium and so are usually higher. Choose a range around the median, for example 8.0x to 10.0x, and apply it to the target's EBITDA of 50 for an implied enterprise value of 400 to 500. Subtract net debt of 100 for equity value of 300 to 400, or 15.00 to 20.00 per share on 20 million diluted shares.",
  },
  {
    id: "diag_debt_schedule",
    slug: "debt-schedule-revolver",
    title: "Debt schedule and revolver",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["lbo", "credit", "capital_structure"],
    concept_ids: ["concept_lbo_paper_lbo"],
    body: `flowchart TB
  FCF["Free cash flow after interest and taxes"] --> Av["Cash available for debt repayment<br/>= beginning cash − minimum cash + FCF"]
  Av --> Md["Mandatory amortization<br/>e.g. 1% a year on term loan B"]
  Md --> Q{"Cash left after mandatory payments?"}
  Q -->|"surplus"| Sw["Optional repayment / cash sweep<br/>revolver first, then prepayable term loans"]
  Q -->|"shortfall"| Rv["Draw on the revolver up to its commitment"]
  Sw --> End["Ending balance per tranche"]
  Rv --> End
  End --> In["Interest = rate × average or beginning balance"]
  In -.->|"back to the income statement, circular if average"| FCF`,
    a11y:
      "Start with free cash flow after interest and taxes and add beginning cash above the minimum cash balance to get cash available for debt repayment. Pay mandatory amortization first. If cash is left over, sweep it into optional repayments, paying down the revolver first and then prepayable term loans. If there is a shortfall, draw on the revolver up to its commitment. Ending balances drive interest expense, which feeds back into the income statement; using average balances creates a circular reference.",
  },
  {
    id: "diag_working_capital",
    slug: "working-capital-cycle",
    title: "Working capital cycle",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["working_capital", "accounting"],
    concept_ids: ["concept_accounting_foundations"],
    body: `flowchart LR
  Cash["Cash"] -->|"buy inventory"| Inv["Inventory<br/>days inventory outstanding, DIO"]
  Inv -->|"sell on credit"| AR["Accounts receivable<br/>days sales outstanding, DSO"]
  AR -->|"collect"| Cash
  AP["Accounts payable<br/>days payable outstanding, DPO"] -.->|"supplier credit delays cash out"| Cash
  CCC["Cash conversion cycle = DIO + DSO − DPO"]
  Rule["Operating NWC up → cash from operations down<br/>AR or inventory up uses cash, AP or deferred revenue up frees cash"]`,
    a11y:
      "Cash buys inventory, inventory is sold on credit and becomes accounts receivable, and receivables are collected back into cash. Accounts payable is supplier credit that delays cash going out. The cash conversion cycle is days inventory outstanding plus days sales outstanding minus days payable outstanding. When operating working capital increases, cash from operations falls: higher receivables or inventory use cash, while higher payables or deferred revenue free up cash.",
  },
  {
    id: "diag_merger_model",
    slug: "merger-model",
    title: "Merger model: sources and uses to pro forma EPS",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["merger_models"],
    concept_ids: ["concept_merger_model"],
    body: `flowchart TB
  Pr["Purchase price = offer price × target diluted shares<br/>+ refinanced target debt + fees"] --> SU["Sources and uses"]
  SU --> Ca["Cash on hand<br/>cost: forgone interest income"]
  SU --> ND["New debt<br/>cost: after-tax interest expense"]
  SU --> St["New acquirer stock<br/>cost: more shares, yield = 1 ÷ acquirer P/E"]
  Pr --> PPA["Purchase price allocation<br/>asset write-ups, then goodwill"]
  PPA --> DA["Extra D&A on written-up assets"]
  Cb["Acquirer net income + target net income"] --> NI["Pro forma net income"]
  Sy["After-tax synergies"] --> NI
  Ca --> NI
  ND --> NI
  DA --> NI
  St --> Sh["Pro forma shares"]
  NI --> EPS["Pro forma EPS vs acquirer standalone EPS"]
  Sh --> EPS
  EPS --> Out["Accretive or dilutive"]`,
    a11y:
      "Set the purchase price (offer price times target diluted shares, plus refinanced debt and fees) and fund it in sources and uses with cash, new debt or new acquirer stock. Cash costs forgone interest income, debt costs after-tax interest, and stock costs extra shares, with a cost equal to one over the acquirer's P/E. The purchase price allocation writes up assets and records goodwill, and write-ups create extra D&A. Pro forma net income is both companies' net income plus after-tax synergies minus these costs; divide by pro forma shares and compare with the acquirer's standalone EPS to see whether the deal is accretive or dilutive.",
  },
  {
    id: "diag_returns_attribution",
    slug: "returns-attribution",
    title: "Returns attribution: growth, multiple, deleveraging",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["returns", "value_creation", "lbo"],
    concept_ids: ["concept_pe_fund_mechanics", "concept_lbo_paper_lbo"],
    body: `flowchart LR
  En["Entry: EBITDA 100 × 10.0x = EV 1,000<br/>net debt 600, equity 400"] --> Ex["Exit: EBITDA 150 × 11.0x = EV 1,650<br/>net debt 300, equity 1,350"]
  Ex --> G["Equity gain 950, MOIC ≈ 3.4x"]
  G --> Gr["EBITDA growth: 50 × 10.0x = 500"]
  G --> Mu["Multiple expansion: 1.0x × 150 = 150"]
  G --> De["Deleveraging: 600 − 300 = 300"]`,
    a11y:
      "Returns attribution for a deal bought at 10.0x EBITDA of 100 (enterprise value 1,000, net debt 600, equity 400) and sold at 11.0x EBITDA of 150 (enterprise value 1,650, net debt 300, equity 1,350). The equity gain of 950, about a 3.4x MOIC, splits into EBITDA growth of 500 (50 of new EBITDA at the entry multiple), multiple expansion of 150 (1.0x on exit EBITDA of 150) and deleveraging of 300 (net debt falling from 600 to 300).",
  },
  {
    id: "diag_ddm",
    slug: "dividend-discount-model",
    title: "Dividend discount model for banks",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["valuation"],
    concept_ids: ["concept_dcf_wacc"],
    body: `flowchart LR
  NI["Projected net income"] --> Cap["Retain enough to hit target CET1 / equity ratio<br/>as the balance sheet grows"]
  Cap --> Dv["Dividends = net income − required capital build"]
  Dv --> PVD["PV of dividends at cost of equity"]
  Dv --> TV["Terminal value = next-year dividend ÷ (Ke − g)<br/>or P/TBV, P/E exit multiple"]
  TV --> PVT["PV of terminal value at cost of equity"]
  PVD --> EqV["Equity value directly, no EV bridge"]
  PVT --> EqV
  EqV --> PS["÷ diluted shares = value per share"]
  Why["Why: debt and deposits are a bank's raw material,<br/>so value equity, not enterprise value"] -.-> EqV`,
    a11y:
      "A dividend discount model values a bank's equity directly. Project net income, retain enough earnings to keep regulatory capital (for example CET1) at the target ratio as the balance sheet grows, and treat the rest as dividends. Discount the dividends and a terminal value, from Gordon growth on the next dividend or a price to tangible book or P/E multiple, at the cost of equity. The sum is equity value, with no enterprise value bridge, because debt and deposits are operating raw material for a bank. Divide by diluted shares for value per share.",
  },
  {
    id: "diag_football_field",
    slug: "football-field",
    title: "Valuation football field",
    diagram_type: "finance-chart",
    format: "mermaid",
    version: "1",
    topics: ["valuation"],
    concept_ids: ["concept_valuation_comps"],
    body: `flowchart TB
  subgraph FF["Implied share price ranges, $ per share"]
    direction TB
    W52["52-week trading range: 38 – 52"]
    TC["Trading comps: 40 – 55"]
    PT["Precedent transactions: 48 – 63"]
    DCF["DCF: 45 – 70"]
    LBO["LBO at 20–25% IRR: 36 – 50"]
  end
  FF --> Rec["Where ranges overlap guides the recommendation<br/>e.g. 48 – 55 vs current price 42"]`,
    a11y:
      "A football field lines up the implied share price range from each method: 52-week trading range 38 to 52, trading comps 40 to 55, precedent transactions 48 to 63, DCF 45 to 70, and an LBO at a 20 to 25 percent IRR 36 to 50. Precedents usually sit above trading comps because of the control premium, and the LBO often sets a floor. The overlap, here about 48 to 55 against a current price of 42, guides the recommended range.",
  },
  {
    id: "diag_restructuring_waterfall",
    slug: "restructuring-waterfall",
    title: "Restructuring recovery waterfall",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["restructuring", "capital_structure", "credit"],
    concept_ids: [],
    body: `flowchart TB
  V["Distributable value, reorganised EV: 800"] --> Ad["Administrative and priority claims 50: paid in full"]
  Ad --> Se["Senior secured debt 500: paid in full, 250 value remains"]
  Se --> Un["Senior unsecured notes 400: receive 250, 62.5% recovery<br/>fulcrum security, usually takes the new equity"]
  Un --> Sb["Subordinated notes 150: 0% recovery"]
  Sb --> Eq["Existing equity: wiped out"]`,
    a11y:
      "Absolute priority waterfall on 800 of distributable value: administrative and priority claims of 50 and senior secured debt of 500 are paid in full, leaving 250 for senior unsecured notes of 400, a 62.5 percent recovery. The unsecured notes are the fulcrum security, the first class that is not paid in full, and usually receive the reorganised company's equity. Subordinated notes and existing equity recover nothing.",
  },
  {
    id: "diag_pe_distribution_waterfall",
    slug: "pe-distribution-waterfall",
    title: "PE fund distribution waterfall",
    diagram_type: "finance-flow",
    format: "mermaid",
    version: "1",
    topics: ["returns"],
    concept_ids: ["concept_pe_fund_mechanics"],
    body: `flowchart TB
  D["Distributions from exits and recaps"] --> T1["1. Return of capital<br/>100% to LPs until contributed capital is returned"]
  T1 --> T2["2. Preferred return<br/>100% to LPs until an 8% annual hurdle"]
  T2 --> T3["3. GP catch-up<br/>mostly to the GP until it has 20% of profits"]
  T3 --> T4["4. Carried interest split<br/>80% LPs, 20% GP thereafter"]
  Fee["Management fee ≈ 1.5–2% of commitments a year<br/>funds the GP's operations, separate from carry"] -.-> D`,
    a11y:
      "A European, whole-fund distribution waterfall: exit proceeds first return all contributed capital to the limited partners, then pay them a preferred return, typically an 8 percent annual hurdle. A GP catch-up then sends most distributions to the general partner until it has received 20 percent of total profits, after which profits split 80 percent to LPs and 20 percent carried interest to the GP. The management fee of roughly 1.5 to 2 percent of commitments a year is separate and pays for the GP's operations.",
  },
]
