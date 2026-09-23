/**
 * Lesson bodies — DCF, LBO, M&A, PE fund mechanics, behavioural (P2.10).
 * Same markdown subset as lessons-core.ts. Keep "$$" out of bodies.
 */

export const LESSON_DCF = `## The idea

A discounted cash flow values a business as the **present value of the cash it will generate for all capital providers**. It is an intrinsic method: it depends on your forecast and discount rate, not on what peers trade at.

## Five steps

1. **Forecast unlevered free cash flow** for 5–10 years — long enough for the business to reach a steady state.
2. **Calculate WACC**, the blended return required by equity and debt investors.
3. **Estimate terminal value** for all years after the forecast.
4. **Discount** the forecast cash flows and terminal value to today and sum them to enterprise value.
5. **Bridge to equity value** and divide by diluted shares.

## Unlevered free cash flow

> UFCF = EBIT × (1 − tax rate) + D&A − capex − increase in net working capital

It is "unlevered" because it is before interest, so it belongs to both debt and equity holders — which is why it is discounted at WACC. **Levered** free cash flow (after interest and debt repayments) belongs to equity only, is discounted at the **cost of equity**, and produces equity value directly.

## WACC

> WACC = E/V × cost of equity + D/V × pre-tax cost of debt × (1 − t)

Cost of equity usually comes from CAPM: risk-free rate + levered beta × equity risk premium. Beta is taken from peers, **unlevered** to strip out their capital structures, then **relevered** at the target's structure. More debt raises the cost of equity (more financial risk) but can lower WACC at first because debt is cheaper and tax-deductible.

## Terminal value, with numbers

**Gordon growth:** TV = UFCF in year n × (1 + g) ÷ (WACC − g).

Year-5 UFCF 100, WACC 10%, g 2%: TV = 102 ÷ 0.08 = **1,275**. Discount factor for year 5 is 1 ÷ 1.10^5 = 0.621, so the PV of TV is about **792**.

**Exit multiple:** TV = year-n EBITDA × multiple. With year-5 EBITDA of 150 at 8.0x, TV = **1,200**. Cross-check the implied perpetual growth rate: g = (TV × WACC − UFCF) ÷ (TV + UFCF) = (120 − 100) ÷ 1,300 ≈ **1.5%**, which is sensible. If the implied growth were 6%, the multiple would be too high.

Terminal value is often 60–80% of total EV, which is why sensitivity tables matter.

## Sensitivities and judgement

- A 1% change in the discount rate usually moves value more than a 1% change in revenue, because it compounds through every year and the terminal value.
- Show WACC vs terminal growth (or exit multiple) tables, and revenue growth vs margin tables.
- The **mid-year convention** assumes cash arrives mid-year, discounting year 1 by 0.5 periods instead of 1, which raises value slightly.

## When not to use a DCF

When cash flows are unpredictable (early-stage companies), negative for a long time, or when debt is operating raw material, as with **banks and insurers** — use a dividend discount model or P / TBV there instead.

## Interview answer template

"Project unlevered free cash flow for five to ten years, discount it at WACC, add the present value of a terminal value from either Gordon growth or an exit multiple, and that is enterprise value. Subtract net debt and other claims to get equity value and divide by diluted shares."`

export const LESSON_DDM = `## Why banks break the normal DCF

For an industrial company, debt is financing and interest sits below operating profit. For a **bank**, deposits and borrowings are the raw material: interest expense is a cost of goods sold. There is no meaningful EBITDA, capex or working capital, and regulators require the bank to hold a minimum level of equity capital. So we **value the equity directly** using a dividend discount model (DDM), discounting at the **cost of equity**, not WACC.

## Steps in a DDM

1. **Project the balance sheet** — loans and deposits drive interest income and expense.
2. **Project net income** — net interest income + fees − operating costs − loan loss provisions − taxes.
3. **Set the capital requirement** — e.g. keep CET1 capital at 11% of risk-weighted assets. Growing the balance sheet requires retaining earnings.
4. **Dividends = net income − capital required to support growth.** Excess capital above the target can be treated as distributable.
5. **Discount dividends and a terminal value at the cost of equity.** Terminal value comes from Gordon growth on dividends or a P / E or price to tangible book multiple.
6. The sum is **equity value**; divide by diluted shares. There is **no EV bridge**.

## Worked example: Gordon growth DDM

Next year's net income 120, return on equity (ROE) 12%, so beginning book equity is 1,000. The bank retains one third of earnings to fund growth, so sustainable growth g = ROE × retention = 12% × 1/3 = **4%**. Dividends next year = 120 × 2/3 = **80**. Cost of equity 10%.

- Equity value = 80 ÷ (10% − 4%) = **1,333**
- Implied price / book = 1,333 ÷ 1,000 = **1.33x**

This matches the justified P / B formula: (ROE − g) ÷ (Ke − g) = (12% − 4%) ÷ (10% − 4%) = 1.33x. The intuition interviewers want: **a bank trades above book only if its ROE exceeds its cost of equity.** At ROE of 10% the same bank would be worth exactly book value.

## What else differs for financial institutions

- **Multiples:** P / E, P / book and P / tangible book instead of EV / EBITDA.
- **Key metrics:** net interest margin, efficiency ratio, CET1 ratio, non-performing loans, ROE and ROTE.
- **Insurers:** DDM or embedded value; float and reserves play the role of deposits.

## Interview traps

1. Discounting dividends at WACC — dividends belong to equity, so use the cost of equity.
2. Adding debt or subtracting cash to get to equity value — the DDM already produces equity value.
3. Forgetting the capital constraint: a bank cannot pay out all its earnings if it wants to grow its loan book.

## One-line answer

"For a bank I'd use a dividend discount model: project net income, retain enough to meet capital requirements, treat the rest as dividends, and discount dividends plus a terminal value at the cost of equity to get equity value directly."`

export const LESSON_LBO = `## What an LBO is

In a leveraged buyout a financial sponsor (a private equity firm) buys a company using a **large amount of debt** — often 50–70% of the purchase price — and a smaller equity cheque. The company's own cash flow services and repays the debt, and the sponsor sells after 3–7 years. The target return is typically a **20–25% IRR** and a **2.0–3.0x MOIC**.

## Walk through a basic LBO model

1. **Transaction assumptions** — purchase multiple (e.g. 10.0x EBITDA), debt tranches and leverage (e.g. 6.0x EBITDA), interest rates, fees.
2. **Sources and uses** — uses are the equity purchase price, refinanced debt and fees; sources are the debt tranches, any rollover and the sponsor equity **plug**.
3. **Adjust the balance sheet** — new debt, new equity, write-ups and goodwill; eliminate the target's old equity.
4. **Project the income statement and cash flow** — EBITDA, interest on the new debt, taxes, capex and working capital to reach free cash flow.
5. **Debt schedule** — mandatory amortization, then optional repayment with excess cash; the revolver covers shortfalls.
6. **Exit** — EBITDA in the exit year × exit multiple = exit EV; subtract net debt for exit equity.
7. **Returns** — MOIC and IRR on the sponsor's equity, with sensitivities to entry and exit multiples and leverage.

## Why leverage boosts returns

- **Less equity** is needed for the same purchase price, so any value gain is spread over a smaller base.
- **Debt paydown** from operating cash flow accrues to the equity holders.
- **Interest is tax-deductible**, creating a tax shield.

Leverage cuts both ways: if the business underperforms, fixed interest and covenants can wipe out the equity.

## Can more leverage lower IRR?

Yes. Beyond a point, extra debt costs more (higher coupons, PIK, tighter covenants), interest absorbs the free cash flow that would otherwise repay debt, and the risk of breaching covenants or needing an equity cure rises. If the after-tax cost of the marginal debt exceeds the return the business earns on its capital, more leverage dilutes returns.

## What makes a good LBO candidate

- Stable, predictable cash flow to support debt.
- Low capex and working capital needs.
- Strong market position and pricing power.
- Opportunities to improve margins or grow (organically or via add-ons).
- A realistic exit route — strategic sale, secondary buyout or IPO.
- Assets that can serve as collateral, and a capable management team.

## Variables that matter most

Purchase and exit multiples and EBITDA growth usually move returns the most; leverage and interest rates come next. Always ask how the deal performs if the exit multiple is 1–2 turns lower than entry.

## Interview answer template

"A sponsor buys a company with mostly debt, uses the company's cash flow to pay interest and reduce debt over five years or so, then sells it. In the model we set assumptions, build sources and uses, project cash flow and a debt schedule, calculate exit equity, and measure IRR and MOIC."`

export const LESSON_PAPER_LBO = `## The paper LBO format

A paper LBO is a mental-maths LBO you do with a pen in five to ten minutes. The interviewer wants a structured process and sensible rounding, not decimals.

## Step by step with numbers

**Assumptions:** EBITDA 100, purchase at 10.0x, leverage 6.0x, 5-year hold, exit at 10.0x, ignore fees and minimum cash.

1. **Entry:** EV = 100 × 10.0x = **1,000**. Debt = 6.0 × 100 = **600**. Sponsor equity = 1,000 − 600 = **400**.
2. **Operations:** EBITDA grows to **150** by year 5. Free cash flow after interest and taxes totals **300** over the hold and is used to repay debt, so debt falls to **300**.
3. **Exit:** EV = 150 × 10.0x = **1,500**. Exit equity = 1,500 − 300 = **1,200**.
4. **Returns:** MOIC = 1,200 ÷ 400 = **3.0x**. IRR ≈ **25%** (3.0x over five years is about 24.6%).

## IRR shortcuts to memorise

| MOIC | 3 years | 5 years |
| --- | --- | --- |
| 1.5x | ≈ 14% | ≈ 8% |
| 2.0x | ≈ 26% | ≈ 15% |
| 2.5x | ≈ 36% | ≈ 20% |
| 3.0x | ≈ 44% | ≈ 25% |

Doubling in five years is roughly 15%; tripling is roughly 25%.

## Attribute the gain

The equity grew by 800 (from 400 to 1,200). Split it:

- **EBITDA growth:** 50 of new EBITDA × 10.0x entry multiple = **500**
- **Multiple expansion:** exit multiple equals entry, so **0**
- **Deleveraging:** debt repaid 600 − 300 = **300**

500 + 0 + 300 = 800. Interviewers love this split because it shows where value came from.

## Sensitivity: exit one turn lower

At a 9.0x exit, EV = 1,350 and exit equity = 1,050. MOIC = 2.6x and IRR falls to about **21%**. Multiple contraction of one turn cost 150 of equity, which is why sponsors underwrite a flat or lower exit multiple.

## Back-solving the price for a target IRR

"What can we pay for a 20% IRR?" 20% for five years ≈ **2.5x**. Exit equity 1,200 ÷ 2.5 ≈ 480 of equity today. Holding debt at 600, the maximum EV is about **1,080**, or roughly **10.8x** EBITDA.

## Common mistakes

1. Forgetting to subtract remaining debt at exit.
2. Using EV instead of equity for MOIC.
3. Applying free cash flow before interest — cash available to repay debt is after interest and taxes.
4. Ignoring fees in a real deal; they add to uses and increase the equity cheque.

Use the sources and uses quiz and the returns diagrams in this module to rehearse each step.`

export const LESSON_MERGER = `## What a merger model answers

A merger (accretion / dilution) model asks: **after buying the target, will the acquirer's earnings per share go up or down?** Public acquirers care because investors track EPS, and the model also shows ownership, credit metrics and how much synergy the deal needs.

## Walk through a merger model

1. **Project both companies' income statements** and standalone EPS.
2. **Set the purchase price** — offer price per share (current price + premium) × target diluted shares, plus any target debt refinanced and fees.
3. **Sources and uses** — fund the price with cash on hand, new debt, new acquirer stock, or a mix.
4. **Purchase price allocation** — write target assets up to fair value, create new intangibles, record a deferred tax liability on the write-ups, and plug the remainder as **goodwill**.
5. **Combine the income statements** and adjust: forgone interest on cash, new interest on debt, extra D&A on write-ups and intangibles, and synergies — all tax-effected.
6. **Pro forma EPS** = pro forma net income ÷ (acquirer shares + new shares issued). Compare with the acquirer's standalone EPS.
7. **Sensitivities** — purchase premium, cash / stock mix, synergies, interest rates.

## Goodwill with numbers

Purchase equity price 500. Target book equity 300. PP&E written up by 50; at a 25% tax rate this creates a deferred tax liability of 12.5.

> Goodwill = 500 − (300 + 50 − 12.5) = **162.5**

Goodwill is not amortised under US GAAP or IFRS; it is tested for **impairment**. An impairment signals the buyer overpaid.

## Why acquire?

- Growth that the buyer cannot achieve organically.
- **Synergies** — cost (overlapping headcount, facilities, procurement) and revenue (cross-selling, pricing).
- Market share, new products, technology or talent.
- Diversification or vertical integration.

Cost synergies are more credible and are valued more by investors; revenue synergies are harder to achieve and usually phased in.

## Cash, stock or debt?

From the acquirer's view, **cash** is usually cheapest (low interest income forgone), then **debt** (after-tax interest), then **stock** (earnings yield of the acquirer, 1 ÷ P / E, often the most expensive and dilutes ownership). Stock makes sense when the acquirer's shares are richly valued, the balance sheet cannot take more debt, or the seller wants to share in the upside.

## Why strategics can pay more than PE

Strategic buyers can count on synergies and often have a lower cost of capital and a longer horizon, so they can justify a higher price than a sponsor constrained by a target IRR.

## Interview answer template

"Project both companies, set the purchase price and how it is funded, allocate the price to assets and goodwill, combine the income statements adjusting for interest, new D&A and synergies after tax, and divide pro forma net income by the new share count. If pro forma EPS is above the acquirer's standalone EPS, the deal is accretive."`

export const LESSON_ACCRETION = `## The shortcut every interviewer expects

Compare the **after-tax cost of each funding source** with the **target's earnings yield** at the purchase price.

| Funding | After-tax cost |
| --- | --- |
| Cash | interest rate earned on cash × (1 − t) |
| Debt | interest rate on new debt × (1 − t) |
| Stock | acquirer earnings yield = 1 ÷ acquirer P / E |

Target yield = 1 ÷ purchase P / E (the P / E the acquirer is paying, including the premium).

If the **weighted cost of funding is below the target yield, the deal is accretive** (before synergies and new D&A).

For an **all-stock** deal this collapses to a simple rule: accretive if the acquirer's P / E is higher than the purchase P / E of the target.

## Worked example

Acquirer: net income 100, 100 shares, EPS 1.00, share price 20.00 → P / E 20x (stock cost 5%).
Target: net income 40, purchase price 600 → purchase P / E 15x (yield 6.7%).
Funding: 50% stock, 50% new debt at 8%, tax rate 25% (debt cost 6%).

**Shortcut:** weighted cost = 0.5 × 5% + 0.5 × 6% = 5.5% < 6.7% → accretive.

**Check with numbers:**

- New shares: 300 ÷ 20.00 = 15
- After-tax interest: 300 × 8% × (1 − 25%) = 18
- Pro forma net income = 100 + 40 − 18 = 122
- Pro forma shares = 115
- Pro forma EPS = 122 ÷ 115 = **1.061**, about **6% accretive**

## Break-even synergies

If a deal is dilutive, how much pre-tax synergy is needed to break even?

> Break-even pre-tax synergies = (standalone EPS × pro forma shares − pro forma net income) ÷ (1 − t)

Suppose instead pro forma net income were 110 with 115 shares. Required net income = 1.00 × 115 = 115; shortfall 5; pre-tax synergies = 5 ÷ 0.75 ≈ **6.7**.

## Other things that make a deal dilutive

- Paying a high premium (low target yield).
- **New D&A** on written-up assets and amortisation of new intangibles.
- Transaction fees financed with debt, and higher interest rates.
- Issuing stock when the acquirer's P / E is low.

## Accretion is not value creation

An accretive deal can still destroy value if the buyer overpays relative to the target's intrinsic value, and a dilutive deal can create value if synergies arrive later. Say this unprompted — it shows judgement.

## Interview checklist

1. State the cost of each funding source after tax.
2. Compare with the target's yield at the offer price.
3. Mention synergies and new D&A as adjustments.
4. Offer to verify with a quick pro forma EPS calculation.`

export const LESSON_PE_FUND = `## Who is in a fund

A private equity fund is usually a limited partnership. **Limited partners (LPs)** — pension funds, endowments, sovereign wealth funds, insurers, family offices — commit capital. The **general partner (GP)**, the PE firm, makes and manages the investments and usually commits 1–5% itself.

## Life of a fund

- **Fundraising** — LPs sign commitments; nothing is paid up front.
- **Investment period** (about 5 years) — the GP makes **capital calls** as deals close.
- **Harvest period** — portfolio companies are improved and exited; proceeds are distributed.
- **Fund life** — typically 10 years plus extensions.

Early on, fees and write-downs make returns negative before exits arrive — the **J-curve**.

## Fees and carry: "2 and 20"

- **Management fee** — roughly 1.5–2% a year of committed capital during the investment period, often stepping down to invested capital afterwards. It pays for the GP's team and operations.
- **Carried interest** — the GP's share of profits, typically **20%**, earned only after LPs get their capital back plus a **preferred return (hurdle)**, commonly **8%** a year.

## The distribution waterfall

1. Return of capital to LPs.
2. Preferred return to LPs (the hurdle).
3. **GP catch-up** until the GP has received 20% of profits so far.
4. 80 / 20 split thereafter.

A **European (whole-fund)** waterfall applies this to the fund as a whole; an **American (deal-by-deal)** waterfall pays carry deal by deal and usually has a **clawback** in case later deals lose money.

### Worked example

LPs contribute 1,000 and the fund returns 1,800 in total. Profit = 800. The hurdle is cleared and there is a full catch-up, so the GP's carry = 20% × 800 = **160** and LPs receive **1,640** — a net multiple of 1.64x before fees versus a gross 1.8x.

## Measuring performance

| Metric | Meaning |
| --- | --- |
| IRR | time-weighted annual return on cash flows |
| MOIC / TVPI | total value (distributed + remaining) ÷ paid-in capital |
| DPI | distributions ÷ paid-in capital — cash actually returned |
| RVPI | remaining value ÷ paid-in capital |

**MOIC vs IRR:** MOIC measures how much money you made; IRR measures how fast. A quick flip can have a high IRR but a low MOIC; a long hold can have a high MOIC but a modest IRR. LPs want both, and increasingly care about DPI.

## Why dividend recaps and quick exits matter

A **dividend recap** borrows at the portfolio company to pay the fund a dividend. It returns cash early, which raises IRR and DPI without an exit, at the cost of more leverage on the company.

## Interview angles

1. "How does a PE firm make money?" Fees plus carry, and carry depends on beating the hurdle.
2. "Why might a GP prefer IRR over MOIC?" Carry and fundraising track IRR, but a very short hold may not return enough absolute dollars.
3. "Gross vs net returns?" Net returns are after fees and carry — what LPs actually earn.`

export const LESSON_PE_DILIGENCE = `## From idea to investment committee

Before a sponsor bids, the deal team writes an **investment thesis** and tests it through diligence. The memo that goes to the investment committee answers four questions: **why this business, why now, why us, and what could go wrong.**

## A thesis framework

1. **Market** — size, growth, cyclicality, competitive dynamics.
2. **Business quality** — recurring revenue, customer retention, pricing power, margins, cash conversion.
3. **Value creation plan** — the specific levers: organic growth, pricing, cost programme, add-on acquisitions, working capital, professionalising management.
4. **Returns** — base, upside and downside cases, with the deal still clearing a minimum return in the downside.
5. **Key risks and mitigants** — customer concentration, technology disruption, leverage, key-person risk.
6. **Exit** — who buys it in five years, and at what multiple.

A strong interview answer is specific: "Three reasons: 85% recurring revenue with 95% gross retention, a fragmented market where we can buy add-ons at 6–7x versus our 11x entry, and a pricing gap versus the market leader."

## Quality of earnings (QoE)

A **QoE report**, usually by an accounting firm, tests whether reported EBITDA is real, recurring and cash-backed. Because the purchase price is a **multiple of adjusted EBITDA**, every adjustment is worth that multiple in value.

### Worked example

Management presents EBITDA of 50. Diligence finds:

- A one-off gain on an asset sale of 5 included in EBITDA → remove, **−5**
- A genuine one-time litigation cost of 3 → add back, **+3**
- The founder is paid 1 but a market-rate CEO costs 3 → normalise, **−2**

Diligence-adjusted EBITDA = 50 − 5 + 3 − 2 = **46**. At 10.0x, that is **40 less value** than the headline number — enough to change the bid.

QoE also looks at revenue recognition, normalised working capital (to set the **working capital peg** in the purchase agreement), capex needs and customer concentration.

## Other diligence workstreams

| Workstream | Key question |
| --- | --- |
| Commercial | Is the market and competitive position as good as claimed? |
| Financial / QoE | Is EBITDA real and recurring? |
| Legal | Contracts, litigation, change-of-control clauses |
| Tax | Exposures and structuring |
| IT / cyber | Scalability and risk |
| Management | Can this team execute the plan? |
| ESG | Regulatory and reputational risk |

## Red flags interviewers expect you to spot

- Revenue growth driven by one customer or aggressive recognition.
- Rising receivables or inventory relative to revenue (earnings not converting to cash).
- Large, repeated "one-off" adjustments.
- Capex below depreciation for years (underinvestment).

## Why buy a company in a "risky" industry?

Sponsors buy technology and other volatile sectors when revenue is recurring (subscriptions), switching costs are high, and growth offsets lower leverage. They adapt the structure — less debt, more equity, sometimes growth or minority deals.

## Interview answer template

"I'd underwrite the thesis on market, business quality, a specific value creation plan and the downside case, then test it in diligence — commercial work on the market and a QoE on EBITDA, since every dollar of EBITDA is worth the purchase multiple."`

export const LESSON_BEHAVIOURAL = `## What fit interviews test

Behavioural questions check three things: **can you communicate clearly, do you really want this job, and will people want to work with you at 2 a.m.** Technical answers get you to the next round; fit answers often decide the offer.

## "Walk me through your resume"

Aim for **60–90 seconds** with a clear arc:

1. **Beginning** — where you grew up or studied, and one detail that explains your interests.
2. **Middle** — two or three experiences, each with a **turning point**: what you did, what you learned, and why it pulled you towards finance.
3. **End** — why this role, why now, and why you are ready.

Do not recite every bullet. The interviewer has the CV; they want the **story that connects it**.

### Example skeleton

"I studied economics at State, where I joined the investment club and pitched a consumer stock that taught me how much I enjoy digging into a business. That led to a summer at a mid-market advisory firm, where I built a comps set for a sell-side deal and saw how the analysis shaped the client's decision. This year I've focused on deepening my modelling skills, which is why I'm excited about your M&A group — the deal flow in industrials matches what I've enjoyed most."

## "Why banking?" / "Why private equity?"

Give **two or three concrete reasons** tied to your experience: steep learning curve, exposure to transactions and senior decision makers, the analytical work you already enjoyed. For PE: thinking like an owner, long-term value creation, and evaluating businesses as investments. Avoid "money" and avoid generic "fast-paced environment" lines without evidence.

## "Why our firm?"

Show research you could only have done by engaging: a recent deal and why it interested you, the group's sector focus, conversations with people there (name them if appropriate), culture or training. Tie at least one point back to your own story.

## Strengths, weaknesses and "why should we hire you?"

- **Strength:** one clear strength plus a short piece of evidence.
- **Weakness:** a real but manageable weakness, what you did about it, and the result. Not "I work too hard".
- **Why hire you:** three sentences — skills, evidence, motivation.

## Delivery

- Answer the question first, then support it.
- Keep answers to one or two minutes; pause and let the interviewer follow up.
- Be consistent: your "why banking" must match your resume story.
- Prepare questions for the interviewer that show genuine interest.

## Practise like a technical

Write bullet outlines, not scripts, and rehearse out loud. Record yourself once and cut filler. Then build the story bank in the next checkpoint so you can answer any "tell me about a time" question.`

export const LESSON_STAR = `## Why a story bank

"Tell me about a time when…" questions are unpredictable in wording but predictable in theme. Instead of memorising answers, prepare **five or six stories** that each cover several themes, and use a consistent structure so you never ramble.

## The STAR (+R) structure

1. **Situation** — one or two sentences of context. Who, where, what was at stake.
2. **Task** — your specific responsibility or the problem you owned.
3. **Action** — what **you** did, step by step. This should be the longest part and use "I", not "we".
4. **Result** — the outcome, quantified where possible.
5. **Reflection** — what you learned or would do differently. This is what separates good answers from great ones.

Aim for about 90 seconds: roughly 15% situation and task, 60% action, 25% result and reflection.

## Themes to cover

| Theme | Typical question |
| --- | --- |
| Teamwork | Tell me about a team project. |
| Conflict | Describe a situation where a team did not work as intended. |
| Leadership | What was the most difficult situation you faced as a leader? |
| Failure / mistake | What was your greatest failure? |
| Ethics | Tell me about an ethical challenge. |
| Attention to detail | Tell me about a time you made an error in your work. |
| Pressure / time management | Describe juggling competing deadlines. |

Map each of your stories to two or three themes so a small bank covers the whole list.

## Worked example: a mistake in your work

- **Situation:** "During my internship I was building a comps table for a client presentation due the next morning."
- **Task:** "I owned the multiples and the summary page."
- **Action:** "Late that evening I noticed one peer's EBITDA was on a different fiscal year end, which inflated its multiple. I told my associate straight away, recalendarised the peer, re-ran the medians, and added a check column to flag fiscal year mismatches."
- **Result:** "The median moved from 9.4x to 8.9x, the deck went out on time with the corrected range, and the team adopted the check column on the next two deals."
- **Reflection:** "I learned to build checks in from the start and to raise problems early rather than try to hide them."

Notice what it shows: ownership, attention to detail, honesty under pressure and a lasting fix — exactly what a banker wants from an analyst.

## Common mistakes

1. Too much situation, too little action.
2. "We" throughout, so the interviewer cannot tell what you did.
3. No result, or a result with no numbers.
4. A "failure" that is not really a failure, or one that blames others.
5. Stories that contradict your resume walk-through.

## How to practise

Write each story as five bullets (S, T, A, R, R). Say it aloud against a 90-second timer. Then answer three random questions from the table using only your bank — if a question does not fit any story, add one.`
