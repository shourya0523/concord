# Pricing and unit economics

Plans live in `apps/web/lib/billing/plans.ts` and are enforced by
`apps/web/lib/billing/meter.ts` (DESIGN.md §17.4); the numbers below come from
`scripts/unit_economics.py` (rerun it after any price or usage change).
Prices checked 2026-10-19. Labour and founder time are not included.

## Plans

| Plan | Price | AI allowance |
|------|-------|--------------|
| Individual · Free | $0 | Daily limits: 10 graded answers, 1 coaching report, 3 voice answers |
| Individual · Credits | $10 / month | 1,500 credits a month (grade 1, coaching 2, voice 3) |
| Your own key | $0 | No caps: AI runs on the user's OpenRouter key |
| Team | $5 / seat / month, 3-seat minimum | 1,000 credits per seat |
| Custom | Contact sohumbalsara@gmail.com | Negotiated |

Practice (question bank, firm heat, daily sets, drills, leagues) is never
metered. Credits only gate model calls.

## Cost per AI action

From `docs/deployment/llm-stack.md` (OpenRouter list prices) plus Whisper
turbo at $0.04/hour. "Loaded" adds OpenRouter's 5.5% credit fee and a 2×
safety factor for longer answers, retries and price moves.

| Action | Model calls | Raw | Loaded |
|--------|-------------|-----|--------|
| Grade (1 credit) | Jev ~1k tokens, 20% escalate to small model | $0.00008 | $0.00016 |
| Coaching / brief (2 credits) | small draft + Jev verify | $0.00034 | $0.00071 |
| Voice answer (3 credits) | 2 min Whisper turbo + grade | $0.0014 | $0.0030 |

The most expensive credit is a voice credit, about $0.001 loaded.

## Per-user margin

| | Revenue | Stripe | AI (loaded) | Infra | Contribution |
|---|---|---|---|---|---|
| Free, typical | $0 | — | $0.02 | $0.05 | −$0.07 |
| Free, maxes every daily limit | $0 | — | $0.29 | $0.05 | −$0.34 |
| Your own key, any usage | $0 | — | $0 (they pay OpenRouter) | $0.05 | −$0.05 |
| Individual, typical | $10 | $0.59 | $0.09 | $0.05 | **$9.27** |
| Individual, burns all 1,500 credits on voice | $10 | $0.59 | $1.49 | $0.05 | **$7.87** |
| Team seat, 3 seats, typical | $5 | $0.24 | $0.09 | $0.05 | **$4.61** |
| Team seat, burns all 1,000 credits on voice | $5 | $0.18–0.24 | $0.99 | $0.05 | **$3.71–3.78** |

Typical = active prepper: 160 grades, 8 coaching reports, 20 voice answers a month.

## Fixed costs

| Item | $/month |
|------|---------|
| Vercel Pro (one seat, includes $20 usage credit) | 20 |
| Neon Launch (usage based, autosuspend) | ~30 |
| Resend Pro (email) | 20 |
| Domain + misc | 5 |
| **Total** | **~75** |

## Break-even

Each paid Individual also carries the free users behind it. At 5%
free→paid conversion that is 19 free users at $0.07 each, so net
contribution is **$7.94** per paid Individual.

| Scenario | Break-even |
|----------|-----------|
| Individuals only | **10 paid** (~200 sign-ups at 5% conversion) |
| Team seats only (10-seat teams) | **17 seats** |
| Fixed costs double to $150 | 19 paid Individuals |

## What this means

- **AI is not the cost risk.** Even a user who burns every credit on voice
  costs under $1.50. Credits are a pricing fence, not cost control. The
  limits could be looser without hurting margin.
- **Fixed hosting and Stripe dominate.** Stripe's $0.30 per charge is 3% of
  a $10 plan and 6% of a single $5 seat, so Team needs a seat minimum (3).
  Annual billing would cut it further.
- **Team undercuts Individual.** Two friends could buy a 2-seat team for
  less than two Individuals. The 3-seat minimum ($15) closes most of that gap.
- **Your own key is cheaper for us than Free.** A key user costs about
  $0.05 a month (infra only), versus up to $0.34 for a free user who maxes
  the daily caps. The risk is cannibalising the $10 plan: heavy users can
  get unlimited AI for cents. Most candidates won't set up an API key, so
  it mainly serves power users and keeps them off the cost line. Revisit if
  more than ~20% of active users switch to their own key.
- **Watch Neon.** Always-on compute (0.5 CU, 100 GB) is ~$73/month on its
  own. Keep autosuspend on until revenue covers it.
