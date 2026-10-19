"""Concord unit economics: break-even for Free / Individual ($10) / Team ($5 a seat).

Prices: docs/deployment/llm-stack.md (OpenRouter list, 2026-09-23) and vendor
pages checked 2026-10-19. Rerun after any price or usage change:
    python scripts/unit_economics.py
"""
import math

# --- AI cost per action (USD) -------------------------------------------------
JEV_IN = 0.042e-6                 # Jev: per input token, output free
SMALL_IN, SMALL_OUT = 0.082e-6, 0.165e-6   # deepseek-v4-flash
STT_PER_MIN = 0.04 / 60           # whisper-large-v3-turbo, $0.04/hour
OPENROUTER_FEE = 0.055            # platform fee on credit top-ups
SAFETY = 2.0                      # margin for longer answers / retries / price moves

grade = 1_000 * JEV_IN + 0.20 * (1_500 * SMALL_IN + 300 * SMALL_OUT)  # 20% escalate
coach = 2_000 * SMALL_IN + 400 * SMALL_OUT + 2_500 * JEV_IN           # draft + Jev verify
voice = 2 * STT_PER_MIN + grade                                       # 2-min answer, graded
ACTIONS = {"grade": grade, "coach": coach, "voice": voice}
CREDITS = {"grade": 1, "coach": 2, "voice": 3}  # credit price of each action

def loaded(usd):  # what we really pay
    return usd * (1 + OPENROUTER_FEE) * SAFETY

# --- Plans --------------------------------------------------------------------
FREE_DAILY = {"grade": 10, "coach": 1, "voice": 3}   # free daily limits
PAID_CREDITS = 1_500                                 # Individual, per month
SEAT_CREDITS = 1_000                                 # Team, per seat per month
INDIVIDUAL_PRICE, SEAT_PRICE, MIN_SEATS = 10.0, 5.0, 3

def stripe(amount):
    return amount * 0.029 + 0.30

# --- Usage --------------------------------------------------------------------
# Typical = active prepper, 8-card daily set on ~20 days, some coaching and voice.
TYPICAL = {"grade": 160, "coach": 8, "voice": 20}
FREE_TYPICAL = {"grade": 40, "coach": 2, "voice": 4}  # most free users dip in

def month_cost(usage):
    return sum(loaded(ACTIONS[k]) * n for k, n in usage.items())

worst_free = month_cost({k: v * 30 for k, v in FREE_DAILY.items()})
worst_paid = loaded(max(ACTIONS[k] / CREDITS[k] for k in ACTIONS)) * PAID_CREDITS
worst_seat = loaded(max(ACTIONS[k] / CREDITS[k] for k in ACTIONS)) * SEAT_CREDITS

MARGINAL_INFRA = 0.05  # Neon storage/compute + email per active user per month

# --- Fixed costs (monthly) ---------------------------------------------------
FIXED = {
    "Vercel Pro (1 seat, $20 incl. usage credit)": 20.0,
    "Neon Launch (usage, autosuspend)": 30.0,
    "Resend (email, Pro)": 20.0,
    "Domain + misc": 5.0,
}
fixed = sum(FIXED.values())

# --- Contribution -------------------------------------------------------------
CONVERSION = 0.05  # free -> paid
free_cost = month_cost(FREE_TYPICAL) + MARGINAL_INFRA
free_per_paid = (1 - CONVERSION) / CONVERSION

ind_typ = INDIVIDUAL_PRICE - stripe(INDIVIDUAL_PRICE) - month_cost(TYPICAL) - MARGINAL_INFRA
ind_worst = INDIVIDUAL_PRICE - stripe(INDIVIDUAL_PRICE) - worst_paid - MARGINAL_INFRA
ind_net = ind_typ - free_per_paid * free_cost

def seat_contrib(seats, worst=False):
    fee = stripe(SEAT_PRICE * seats) / seats
    ai = worst_seat if worst else month_cost(TYPICAL)
    return SEAT_PRICE - fee - ai - MARGINAL_INFRA

if __name__ == "__main__":
    print("Cost per action (raw / loaded):")
    for k, v in ACTIONS.items():
        print(f"  {k:6s} ${v:.6f} / ${loaded(v):.6f}")
    print(f"Typical paid user AI cost/month: ${month_cost(TYPICAL):.3f}")
    print(f"Typical free user cost/month (incl. infra): ${free_cost:.3f}")
    print(f"Worst-case free user (maxes daily limits): ${worst_free:.3f}")
    print(f"Worst-case Individual (burns {PAID_CREDITS} credits): ${worst_paid:.3f}")
    print(f"Worst-case seat (burns {SEAT_CREDITS} credits): ${worst_seat:.3f}")
    print(f"Fixed/month: ${fixed:.2f}")
    print(f"Individual contribution: typical ${ind_typ:.2f}, worst ${ind_worst:.2f}, "
          f"after carrying {free_per_paid:.0f} free users ${ind_net:.2f}")
    for s in (MIN_SEATS, 10, 25):
        print(f"Team seat contribution @{s} seats: typical ${seat_contrib(s):.2f}, worst ${seat_contrib(s, True):.2f}")
    be_ind = math.ceil(fixed / ind_net)
    print(f"Break-even, Individuals only: {be_ind} paid (~{math.ceil(be_ind / CONVERSION)} sign-ups)")
    print(f"Break-even, Team seats only (10-seat teams): {math.ceil(fixed / seat_contrib(10))} seats")
    print(f"Break-even at 2x fixed (${2*fixed:.0f}): {math.ceil(2*fixed / ind_net)} paid Individuals")
