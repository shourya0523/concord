/**
 * Lesson bodies — accounting, EV, valuation (P2.10). Markdown subset rendered
 * by lib/learn/markdown.ts: ## / ### headings, paragraphs, **bold**, *italic*,
 * `code`, lists, pipe tables and > quotes. Keep "$$" out of bodies (the
 * migration runner uses $$ quoting).
 */

export const LESSON_ACCOUNTING = `## Why interviewers start here

Almost every technical interview opens with "walk me through the three statements". The interviewer is not testing memory of line items — they want to hear that you understand **how the statements link**, because every model you will build (DCF, LBO, merger) is a three-statement model underneath.

## The three statements in one breath

- **Income statement** — revenue and expenses over a period, on an **accrual** basis, ending at net income.
- **Balance sheet** — assets = liabilities + shareholders' equity at a point in time.
- **Cash flow statement** — starts at net income, adjusts for non-cash items and changes in working capital, then adds investing and financing cash flows to reach the net change in cash.

A strong 30-second answer: "The income statement shows profitability. Net income flows to the top of the cash flow statement, which adds back non-cash charges like D&A, adjusts for working capital, and adds investing and financing activity to get the change in cash. That change updates cash on the balance sheet, and net income less dividends flows into retained earnings, so the balance sheet balances."

## Accrual versus cash

Accrual accounting records revenue when it is **earned** and expenses when they are **incurred**, not when cash moves. That is why the cash flow statement exists: it reconciles accrual profit to actual cash. Credit sales raise revenue and accounts receivable without any cash; D&A spreads a past capex payment over the asset's life.

## Worked example: depreciation up by $10 (25% tax)

| Statement | Change |
| --- | --- |
| Income statement | Pre-tax income −10, taxes −2.5, net income −7.5 |
| Cash flow statement | Net income −7.5, add back D&A +10, cash +2.5 |
| Balance sheet | Cash +2.5, PP&E −10, so assets −7.5; retained earnings −7.5 |

Assets fall by 7.5 and equity falls by 7.5, so the balance sheet balances. The **+2.5 of cash is the tax shield**: depreciation is non-cash, but it lowers the tax bill.

## Worked example: inventory up by $10, paid in cash

- Income statement: **no change** — inventory is expensed through COGS only when it is sold.
- Cash flow statement: the increase in inventory is a use of cash, so cash from operations falls by 10.
- Balance sheet: cash −10, inventory +10. Total assets are unchanged.

## Common traps

1. Forgetting taxes when an expense changes (the answer is never "net income −10" for a pre-tax item).
2. Saying depreciation "creates cash". It reduces taxes; the add-back only reverses a non-cash expense.
3. Putting dividends on the income statement — they reduce retained earnings and appear in financing cash flow.
4. Mixing up the direction of working capital: an **increase** in an operating asset uses cash.

## How to practise

Say the linkage out loud, then run two or three single-line changes (D&A, inventory, accrued compensation, a debt-funded asset purchase) through all three statements and finish every answer with "and the balance sheet balances because…". Open the diagram checkpoints next to see the full set of linkages.`

export const LESSON_WORKING_CAPITAL = `## What working capital measures

Working capital is **current assets minus current liabilities**. In valuation and modelling we usually care about **operating** working capital, which excludes cash and debt:

> Operating NWC = accounts receivable + inventory + prepaid expenses − accounts payable − accrued expenses − deferred revenue

It measures how much cash is tied up in running the business day to day.

## The cash conversion cycle

Cash buys inventory, inventory is sold on credit, receivables are collected, and suppliers are paid on their own terms. Three day-count ratios describe the loop:

| Metric | Formula | Meaning |
| --- | --- | --- |
| DSO | AR ÷ revenue × 365 | days to collect from customers |
| DIO | inventory ÷ COGS × 365 | days inventory sits before sale |
| DPO | AP ÷ COGS × 365 | days taken to pay suppliers |

**Cash conversion cycle = DIO + DSO − DPO.**

### Worked example

Revenue 730, COGS 438, accounts receivable 80, inventory 60, accounts payable 36.

- DSO = 80 ÷ 730 × 365 = **40 days**
- DIO = 60 ÷ 438 × 365 = **50 days**
- DPO = 36 ÷ 438 × 365 = **30 days**
- Cash conversion cycle = 50 + 40 − 30 = **60 days**

If the company negotiated 45-day supplier terms, payables would rise to 54 (438 × 45 ÷ 365) and the cycle would shrink to 45 days, releasing 18 of cash.

## How changes hit the cash flow statement

The rule to memorise: **an increase in an operating asset uses cash; an increase in an operating liability frees cash.**

- Accounts receivable up 20 → cash from operations −20 (revenue was booked but not collected).
- Accrued compensation up 10 → the expense hits net income (−7.5 after 25% tax), but the accrual is added back (+10), so cash rises 2.5.
- Deferred revenue up 15 → cash collected before revenue is earned, so cash from operations +15.

## Is negative working capital bad?

Not necessarily. Retailers, restaurants and subscription software companies often have **negative working capital** because customers pay up front (cash or deferred revenue) while suppliers are paid later. That is a sign of bargaining power and funds growth. It is a warning sign only when it comes from stretching payables because the company cannot pay its bills.

## Interview angles

1. "Why does an increase in accounts receivable reduce cash flow?" Revenue was recognised on an accrual basis but the customer has not paid yet.
2. "What is the difference between accounts receivable and deferred revenue?" AR is revenue earned but not collected (an asset); deferred revenue is cash collected but not yet earned (a liability).
3. In a DCF, the **change** in NWC, not the level, enters unlevered free cash flow. Growing companies usually invest in working capital every year.

Use the working capital cycle diagram in this module to trace each arrow before you answer.`

export const LESSON_EV = `## Two values, two audiences

**Equity value** is what the company is worth to **common shareholders** only: diluted shares outstanding × share price for a public company. **Enterprise value** is the value of the **core operating business** to **all capital providers** — equity, debt, preferred stock and minority holders.

We look at both because they answer different questions. Equity value tells you what a share is worth; enterprise value lets you compare businesses regardless of how they are financed and is what an acquirer effectively pays for the operations.

## The bridge

> Enterprise value = equity value + debt + preferred stock + non-controlling interest − cash − non-operating assets (for example equity investments)

- **Add debt and preferred stock** — they are claims on the operating business from other investors.
- **Add non-controlling interest** — the parent consolidates 100% of a majority-owned subsidiary's EBITDA, so EV must include the minority owners' slice to stay consistent with the metric.
- **Subtract cash** — cash is not needed to run the core business, and an acquirer effectively gets it back.
- **Subtract equity investments / associates** — their income is not in consolidated EBITDA.

### Worked example

Share price 20, 50 million diluted shares → equity value **1,000**. Debt 400, preferred 50, NCI 30, cash 150, equity investments 30.

EV = 1,000 + 400 + 50 + 30 − 150 − 30 = **1,300**.

Going the other way, a DCF that produces an EV of 1,300 implies equity value of 1,000, or 20 per share.

## Capital structure and EV

If the company borrows 100 and holds it as cash, equity value does not change, debt rises by 100 and cash rises by 100, so **EV is unchanged**. EV changes when the operating business changes; equity value changes with both operations and financing. That is the logic interviewers are testing.

## Matching multiples to the right value

| Multiple | Numerator | Why |
| --- | --- | --- |
| EV / EBITDA, EV / revenue, EV / EBIT | EV | metric is before interest, available to all capital providers |
| P / E, equity value / levered FCF | equity value | metric is after interest, available to equity only |

Mixing them (equity value / EBITDA) is a classic red flag.

## Edge cases interviewers like

1. **Negative EV** — possible when cash exceeds market capitalisation plus debt, often a distressed or cash-rich company the market doubts.
2. **Negative equity value** — not possible for market value (share price cannot go below zero), but **shareholders' equity** (book value) can be negative after large losses or dividend recaps.
3. **Equity value vs shareholders' equity** — market value versus accounting book value.
4. **Market vs book** — use market values where they exist (share price, trading debt prices if very different from par).

Next, open the EV bridge diagram and then test yourself in the fill-in quiz.`

export const LESSON_DILUTION = `## Why diluted shares matter

Equity value per share is only as good as the share count. Options, warrants, restricted stock units and convertible securities can all turn into common shares, so interview answers and models use **fully diluted shares outstanding**, not basic shares.

## Treasury stock method (options and warrants)

1. Include only **in-the-money** instruments (strike price below the current share price).
2. Assume they are exercised and the company receives strike × number of options in cash.
3. Assume the company uses that cash to **buy back shares** at the current price.
4. Net new shares = options − buyback shares.

### Worked example

100 shares outstanding at 10.00. 10 options with a strike price of 5.00.

- Exercise proceeds = 10 × 5.00 = 50
- Shares repurchased = 50 ÷ 10.00 = 5
- Net new shares = 10 − 5 = **5**
- Diluted shares = **105**, diluted equity value = 105 × 10.00 = **1,050**

If the strike were 12.00 the options would be out of the money and ignored. RSUs have no strike price, so they are simply added in full.

## Convertible bonds (if-converted method)

Compare the share price with the **conversion price** (par value ÷ conversion ratio). If the share price is higher, the bond is in the money: count the new shares and remove the bond from debt in the EV bridge. If not, keep it as debt.

### Worked example

1 million shares at 100.00. 10 million of convertible bonds with 1,000 par and a conversion price of 50.00.

- Each bond converts into 1,000 ÷ 50 = 20 shares; there are 10,000 bonds
- New shares = 10,000 × 20 = **200,000**
- Share price 100 > conversion price 50, so convert: diluted shares = **1.2 million**
- Diluted equity value = 1.2 million × 100 = **120 million**, and the 10 million of converts is **not** also counted as debt

Counting the convert as both debt and equity is the most common mistake here.

## Other dilutive items

- **Preferred stock** that converts into common is treated like a convertible.
- **Earnouts and contingent shares** — include if the conditions are likely to be met.
- When a deal price rather than the market price is used (M&A), recompute dilution at the **offer price**, because more options are in the money.

## How much dilution is too high?

There is no fixed rule, but if diluted equity value is more than roughly 10–20% above basic equity value, investors and boards focus on it, and management incentive plans come under scrutiny.

## Interview checklist

- State the method (treasury stock or if-converted).
- Show the arithmetic in one line.
- Say where the item goes in the EV bridge.
- Mention that you recompute at the offer price in an acquisition.`

export const LESSON_COMPS = `## Relative valuation in one sentence

Comparable companies ("trading comps") and precedent transactions value a business by asking **what similar assets are worth today**, expressed as multiples of a financial metric.

## Trading comps step by step

1. **Screen** for peers on industry, business model, size, growth, margins and geography.
2. **Spread** the comps: equity value, EV, and LTM and forward revenue, EBITDA, EBIT and EPS. Calendarise fiscal years and use consensus estimates for forward numbers.
3. **Compute multiples** — EV / revenue, EV / EBITDA, EV / EBIT, P / E.
4. **Pick a range**, usually around the median (25th–75th percentile), and justify premiums or discounts.
5. **Apply** the range to the target's metric and bridge from EV to equity value per share.

### Worked example

Peer EV / EBITDA multiples: 7.5x, 8.0x, 9.0x, 10.0x, 11.5x. Median 9.0x, interquartile range about 8.0x–10.0x.

Target EBITDA 50 → implied EV **400–500**. Net debt 100 → equity value **300–400**. 20 million diluted shares → **15.00–20.00 per share**.

## Precedent transactions

Same mechanics, but the multiples are what acquirers **paid** for similar companies, usually EV / LTM EBITDA at announcement. Precedents typically come out **higher** than trading comps because they include a **control premium** (often 20–40%) and expected synergies.

Weaknesses to mention:

- Data is stale — market conditions and interest rates change.
- Few truly comparable deals, and deal terms (earnouts, stock vs cash) muddy the multiple.
- Disclosure is thin for private targets.

## Choosing the right multiple

| Situation | Useful multiple |
| --- | --- |
| Mature, profitable | EV / EBITDA, P / E |
| Capital intensive (D&A differs across peers) | EV / EBIT or EV / (EBITDA − capex) |
| Unprofitable, high growth | EV / revenue, EV / gross profit |
| Banks and insurers | P / E, P / tangible book |
| Industry specific | EV / subscribers, EV / reserves, price / FFO for REITs |

Always pair EV with pre-interest metrics and equity value with post-interest metrics.

## Why would a company trade at a premium to peers?

Faster growth, higher margins or returns on capital, more recurring revenue, a stronger competitive position, or scarcity value. If growth and profitability are similar, look for differences in risk (customer concentration, leverage), liquidity and market sentiment.

## Interview answer template

"I'd pick 5–10 peers on industry, size and growth, compute EV / EBITDA and P / E on LTM and forward numbers, and take a range around the median. For precedents I'd use deals from the last few years in the sector; those multiples are usually higher because of the control premium. I'd apply both ranges to the target's EBITDA, subtract net debt, and divide by diluted shares."`

export const LESSON_FOOTBALL_FIELD = `## What a football field is for

A football field is a horizontal bar chart that shows the **implied value range from each methodology side by side** — usually per share, sometimes as enterprise value. Bankers use it in fairness opinions, pitch books and board presentations to show where a valuation or an offer price sits.

## Typical rows

| Methodology | What drives the range | Where it usually sits |
| --- | --- | --- |
| 52-week trading range | market prices | anchor for public companies |
| Analyst price targets | broker research | similar to trading |
| Trading comps | peer multiple range × metric | minority, no premium |
| Precedent transactions | deal multiple range × metric | often highest (control premium) |
| DCF | WACC and terminal value sensitivities | widest range |
| LBO | purchase price for a 20–25% IRR | often the floor |

### Worked example

Implied share price ranges: 52-week range 38–52, trading comps 40–55, precedents 48–63, DCF 45–70, LBO at a 20–25% IRR 36–50. The current price is 42.

Most methods overlap between roughly **48 and 55**, so an offer in that zone is defensible: it is a premium of about 14–31% to the current price and inside the precedent range. An offer of 45 would look light because it sits below the precedent range.

## Why the LBO is often the floor

A financial sponsor can pay only what still earns its target return using leverage and no strategic synergies. A strategic buyer with synergies can usually outbid that price, so the LBO range marks a level a seller should not go below.

## Ranking the methodologies

A common interview question is "rank the methods from highest to lowest". A good answer avoids a rigid rule: **precedents are usually highest** because of the control premium; the **DCF is the most variable** because it depends on assumptions; **trading comps** are typically below precedents. Market conditions can flip this — in a sell-off, precedents from a hotter market look expensive and trading comps look cheap.

## How to build a sensible range

- Use the **interquartile range** of multiples, not the minimum and maximum.
- For the DCF, sensitise WACC (±0.5–1%) and terminal growth (±0.5%) or the exit multiple (±1.0x).
- Keep the same metric definition (LTM vs forward, adjusted vs reported) across rows.
- Show the offer price and current price as vertical lines so the reader can see premiums instantly.

## Interview framing

"I wouldn't average the methods. I'd look at where the ranges overlap and weight the most reliable ones for this company — for a stable, cash-generative business I'd lean on the DCF and precedents; for a volatile one, trading comps and the LBO floor."`
