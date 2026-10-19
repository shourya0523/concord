"""Keyword topic rules + heuristic taxonomy classifier for teaching questions.

``RULES`` mirrors migration 038 (``keyword_rules_v3``) and
``packages/search/src/topics.ts`` — same slugs, same first-match precedence —
extended with v4 patterns that close gaps on the teaching corpus (behavioural
prompts, ECM, portfolio operations, industry analysis). Slugs stay inside the
038 vocabulary so DB heat views and product filters keep working.

The heuristic classifier combines independent signals (source category label,
wording rules, source-answer rules) and reports a confidence. Enrichment
auto-approves only when the heuristic winner *agrees* with the rule topic at
confidence >= 0.8 (plan P2.2); everything else stays a pending proposal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

RULES_VERSION = "keyword_rules_v4"
UNTAGGED = "untagged"

TOPIC_SLUGS: tuple[str, ...] = (
    "lbo",
    "valuation",
    "enterprise_value",
    "working_capital",
    "accounting",
    "merger_models",
    "credit",
    "capital_structure",
    "investment_thesis",
    "due_diligence",
    "restructuring",
    "returns",
    "value_creation",
    "industry_coverage",
    "markets",
    "brainteasers",
    "behavioral",
)

# Migration 038 §3: teaching domain inferred from topic.
TOPIC_DOMAIN: dict[str, str] = {
    "lbo": "pe",
    "returns": "pe",
    "value_creation": "pe",
    "investment_thesis": "pe",
    "due_diligence": "pe",
    "credit": "pe",
    "merger_models": "ib",
    "accounting": "ib",
    "valuation": "ib",
    "enterprise_value": "ib",
    "working_capital": "ib",
    "capital_structure": "ib",
    "restructuring": "ib",
    "industry_coverage": "ib",
    "markets": "ib",
    "behavioral": "both",
    "brainteasers": "both",
}


def _c(*patterns: str) -> list[re.Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


# 038 §2 puts these gap rules ahead of the ordered v3 list for teaching rows.
_PRE_RULES: list[tuple[str, list[re.Pattern[str]]]] = [
    # v4: distress context outranks the generic valuation / M&A terms it co-occurs
    # with ("How would a DCF differ for a distressed company?" is restructuring).
    ("restructuring", _c(r"\bdistress", r"bankrupt", r"chapter (7|11)", r"\binsolven",
                         r"liquidation (valuation|analysis|value)")),
    ("valuation", _c(r"levered fcf", r"unlevered fcf", r"how do i get to (levered |unlevered )?fcf",
                     r"free cash flow")),
    ("investment_thesis", _c(r"stock pitch", r"pitch (me )?(a |an )?(stock|company|investment)",
                             r"recent deal")),
    ("markets", _c(r"recent (news|market|transaction)", r"market (news|conditions?)", r"in the news")),
    (
        "behavioral",
        _c(
            r"walk me through your (resume|cv)",
            r"tell me about your (resume|cv)",
            r"why .{0,40}(goldman|morgan stanley|jpmorgan|jp morgan|blackstone|kkr|evercore|lazard|"
            r"barclays|ubs|deutsche|bank of america|jefferies|wells fargo|citi|hsbc|rbc)",
            r"why (did you choose|would you (like to )?work|do you want to (work|join|apply|move))",
            r"where .{0,20}(see yourself|in 5 years|in five years)",
            r"hobbies",
            r"strengths? and weaknesses?",
            r"tell me about yourself",
            r"why (ib|investment banking|private equity|banking|our firm|this (firm|role|position|company))",
            # v4: fit prompts that never mention a technical term
            r"why (are|is) (we|us|our)\b",
            r"first choice",
            r"where else (are you|did you)",
            r"\binterviewing\b",
            r"tell me about a time",
            r"describe a (situation|time)",
            r"a time when you",
            r"return offer",
            r"why should (i|we) hire",
            r"\bgpa\b|\bgrades?\b|\ba [a-f] in\b",
            r"greatest fear|\bfear\b",
            r"(looking|want|decide[ds]?) to switch",
            r"\bhire you\b",
            r"what (do|did) you (think|know) (about|of) (the )?(lifestyle|culture|hours)",
        ),
    ),
]

# Ordered v3 rules (packages/search/src/topics.ts) + v4 additions per topic.
_ORDERED_RULES: list[tuple[str, list[re.Pattern[str]]]] = [
    ("lbo", _c(r"\blbo\b", r"leveraged buyout", r"paper lbo", r"\bmoic\b", r"\birr\b", r"debt paydown",
               r"cash sweep", r"sources? and uses?", r"entry multiple", r"exit multiple",
               r"sponsor returns?", r"dividend recap", r"management rollover",
               # v4
               r"\bbuyouts?\b", r"financial (buyer|sponsor)", r"\bpik toggle\b")),
    ("valuation", _c(r"\bdcf\b", r"discounted cash flow", r"\bwacc\b", r"\bcapm\b", r"comparable compan",
                     r"\bcomps\b", r"trading multipl", r"transaction multipl", r"precedent transaction",
                     r"\bvaluation\b", r"terminal value", r"gordon growth", r"perpetuity growth",
                     r"free cash flow", r"\bfcf\b", r"unlevered", r"\bddm\b", r"dividend discount model",
                     # v4
                     r"\bvalu(e|ing) (a|the|this) (company|business|firm)", r"\bev\s*/\s*ebitda\b",
                     r"\bp\s*/\s*e\b", r"price.to.earnings", r"\bmultiples?\b", r"sum.of.the.parts",
                     r"football field", r"\bbeta\b", r"discount rate", r"intrinsic value",
                     r"cost of equity", r"how (would|do|should) you value\b", r"\bcomparables\b")),
    ("enterprise_value", _c(r"enterprise value", r"equity value", r"\bev\b.*\bequity\b",
                            r"\bequity\b.*\bev\b", r"net debt", r"minority interest", r"preferred stock",
                            r"treasury stock method", r"fully diluted shares?",
                            # v4
                            r"non-?controlling interest", r"market cap(italization)?", r"diluted share",
                            r"share count")),
    ("working_capital", _c(r"working capital", r"\bnwc\b", r"accounts? receivable", r"accounts? payable",
                           r"cash conversion cycle", r"inventory turnover",
                           # v4
                           r"days sales outstanding", r"\bdso\b", r"\bdpo\b", r"payable terms",
                           r"\binventory\b", r"accrued expenses")),
    ("accounting", _c(r"three (financial )?statements", r"income statement", r"balance sheet",
                      r"cash flow statement", r"depreciation", r"amortization", r"\bgaap\b", r"goodwill",
                      r"impairment", r"write-?down", r"deferred tax", r"revenue recognition",
                      r"net income", r"\bcogs\b", r"capital expenditure", r"\bcapex\b",
                      # v4
                      r"financial statements?", r"retained earnings", r"shareholders.? equity",
                      r"deferred revenue", r"\blifo\b", r"\bfifo\b", r"\bleases?\b", r"stock.based comp",
                      r"\bpp&e\b", r"\baccru", r"\bifrs\b", r"\bebitda\b", r"operating income",
                      r"write-?off", r"\bdtl\b|\bdta\b",
                      r"\b(1|2|3|one|two|three)[- ](financial )?statements?\b",
                      r"(expense|revenue|cost) (model|projection)s?\b", r"\bcapitali[sz]",
                      r"expens(e|ing) (them|it|costs)")),
    ("merger_models", _c(r"\bmerger\b", r"\baccretion\b", r"\bdilution\b", r"\bm\s*&\s*a\b",
                         r"mergers? and acquisitions?", r"merger model", r"accretive", r"dilutive",
                         r"purchase accounting", r"pro forma eps", r"deal synergies",
                         r"stock (deal|consideration)", r"cash (deal|consideration)", r"exchange ratio",
                         # v4
                         r"\bsynerg", r"(stock|asset) purchase", r"\b338\(h\)", r"sell-?side",
                         r"buy-?side", r"\bauction\b", r"fairness opinion", r"\bacquir(er|ing|ed|e)\b",
                         r"\btakeover\b", r"strategic buyer",
                         r"(?<!add-on )(?<!add on )(?<!tuck-in )(?<!platform )\bacquisitions?\b",
                         r"purchase price", r"\boverpa(y|ys|id|ying)\b", r"\bmac\b|material adverse",
                         r"signing and closing", r"deal protections?", r"break(-?up)? fee",
                         r"buy ?out the minority", r"squeeze-?out", r"take-?private|going private",
                         r"\bdivestiture")),
    ("credit", _c(r"credit analysis", r"credit agreement", r"credit facility", r"credit metrics?",
                  r"credit risk", r"credit spread", r"credit rating", r"debt capacity", r"\bcovenants?\b",
                  r"interest coverage", r"leverage ratio", r"loan-?to-?value", r"\bltv\b",
                  r"private credit", r"leveraged finance", r"high yield", r"default risk",
                  # v4
                  r"\bbonds?\b", r"\blenders?\b", r"yield to maturity", r"\bytm\b", r"refinanc",
                  r"high-yield", r"\bpik\b", r"mezzanine", r"unitranche", r"direct lending",
                  r"(senior|junior) (secured|unsecured|notes|lender)", r"syndicated loan",
                  r"\bdcm\b", r"debt capital markets", r"credit ratios?", r"committed financing",
                  r"flex provisions?", r"acquisition financing", r"debt buy-?backs?")),
    ("capital_structure", _c(r"capital structure", r"cost of (debt|equity|capital)", r"\bleverage\b",
                             r"debt (vs\.?|versus) equity", r"debt financing", r"equity financing",
                             r"convertible debt", r"preferred equity", r"\brevolver\b", r"term loan",
                             r"senior debt", r"subordinated debt",
                             # v4 (ECM / financing strategy)
                             r"\bipo\b", r"initial public offering", r"follow-?on offering", r"\bconvertible",
                             r"bookbuild", r"greenshoe", r"block trade", r"\bspac\b", r"direct listing",
                             r"(equity|debt) (issuance|offering|raise)", r"share (buyback|repurchase)",
                             r"capital allocation", r"raise capital", r"dividend policy", r"\becm\b",
                             r"primary (and|vs\.?|versus) secondary shares",
                             r"debt (is )?cheaper|cheaper than equity", r"\bbuybacks?\b",
                             r"return(ing)? capital")),
    ("investment_thesis", _c(r"investment thesis", r"underwrite", r"why (this|that) (deal|investment)",
                             r"why (this|that) company as (an? )?investment",
                             r"would you (invest in|acquire|buy)", r"attractive investment",
                             r"good investment", r"pitch me (a|an) (stock|investment|company)",
                             r"stock pitch", r"recent deal", r"deal (you|i) (was |have )?follow",
                             r"investment idea", r"long pitch", r"short pitch", r"buy or sell",
                             r"growth drivers?",
                             # v4
                             r"\binvest (it|in|\$)", r"company you admire", r"start (a|any type of|an?) .{0,20}business",
                             r"\bviable\b", r"\bmoat\b", r"investment committee", r"\bic memo\b",
                             r"deal (evaluation|screening)", r"\bthesis\b")),
    ("due_diligence", _c(r"due diligence", r"\bdd\b", r"quality of earnings", r"\bqoe\b",
                         r"commercial diligence", r"customer calls?", r"\bcim\b", r"data room",
                         r"management presentation",
                         # v4
                         r"\bdiligence\b")),
    ("restructuring", _c(r"restructur", r"bankrupt", r"distressed", r"chapter 11", r"liquidation",
                         r"recovery value", r"waterfall", r"debtor-?in-?possession", r"\bdip financing\b",
                         # v4
                         r"\binsolven", r"\bcreditors?\b", r"chapter 7", r"\b363 sale\b", r"fulcrum",
                         r"uptier", r"drop-?down", r"liability management")),
    ("returns", _c(r"\breturns?\b", r"\bmoic\b", r"\birr\b", r"cash-?on-?cash",
                   r"multiple of (invested )?money", r"\broic\b", r"return on invested capital",
                   r"hurdle rate",
                   # v4
                   r"carried interest", r"\bcarry\b", r"management fee", r"\bdpi\b", r"\btvpi\b",
                   r"\blps?\b", r"limited partners?", r"general partners?", r"fund (life|structure|economics)",
                   r"\bvintage\b")),
    ("value_creation", _c(r"value creation", r"operational improve", r"add-?on acquisition",
                          r"tuck-?in acquisition", r"platform acquisition", r"portfolio company",
                          r"margin expansion", r"cost cuts?", r"revenue growth", r"100-?day plan",
                          # v4 (portfolio operations)
                          r"\blean\b", r"kaizen", r"\boee\b", r"takt", r"\bsmed\b", r"\b5s\b",
                          r"supply chain", r"procurement", r"pricing (strategy|power|excellence)",
                          r"\bkpis?\b", r"scorecard", r"\bbudget", r"13-week", r"cash (forecast|management)",
                          r"zero-?based", r"\berp\b", r"exit (timeline|readiness|planning)", r"bottleneck",
                          r"safety stock", r"logistics", r"\b3pl\b", r"headcount", r"operating model",
                          r"operational (excellence|improvement|scorecard)", r"value creation plan",
                          r"operational levers?", r"pricing realization", r"discount leakage",
                          r"100-?day", r"\bcapacity\b")),
    ("industry_coverage", _c(r"industry coverage", r"coverage group", r"sector trends?", r"industry trends?",
                             r"which (industry|sector).*(follow|interested)",
                             r"what (industry|sector).*(follow|interested)",
                             r"(healthcare|technology|fig|industrials|consumer|retail|energy) (group|coverage|sector)",
                             # v4
                             r"market (share|structure)", r"\bfragmented\b", r"barriers? to entry",
                             r"porter", r"competitive (landscape|dynamics|position)", r"substitutes",
                             r"cyclical", r"secular", r"\btam\b", r"industry (analysis|health|segment)",
                             r"disruption")),
    ("markets", _c(r"current markets?", r"market conditions?", r"market news", r"recent market",
                   r"recent (news|transaction)", r"in the news", r"stock market",
                   r"view (the )?(real estate |equity )?market", r"yield curve", r"interest rates?",
                   r"\bfed\b", r"federal reserve", r"inflation", r"macroeconomic", r"\bmacro\b",
                   r"\bs\s*&\s*p\s*500\b",
                   # v4
                   r"\beconomy\b", r"recession", r"\bgdp\b", r"\bdow\b", r"nasdaq", r"\bvix\b",
                   r"oil price", r"currenc", r"rate (hike|cut)s?", r"higher.for.longer",
                   r"market today", r"where.?s the market", r"\bfx\b", r"foreign exchange")),
    ("brainteasers", _c(r"brain ?teasers?", r"mental math", r"market sizing", r"how many .* (fit|are in|in a)\b",
                        r"(tennis|golf|ping pong) balls?", r"manhole covers?",
                        r"probability (question|problem|puzzle)", r"coin flips?", r"\bdice\b",
                        # v4
                        r"\bpuzzle\b", r"square root", r"what('?s| is) \d+\s*(times|x|\*|divided)",
                        r"\bhow many\b", r"\bprobability\b", r"clock", r"average speed",
                        r"miles per hour", r"\bdimes?\b|\bnickels?\b|\bpennies\b", r"\bliters?\b",
                        r"\bbuckets?\b")),
    ("behavioral", _c(r"tell me about yourself", r"walk me through your (resume|cv)",
                      r"tell me about your (resume|cv)",
                      r"why (ib|investment banking|private equity|banking|our firm)",
                      r"why (do you )?(want to )?(work|join|apply).*(firm|bank|company|team|position)",
                      r"why (did you choose|would you (like to )?work)",
                      r"why .{0,40}(goldman|morgan stanley|jpmorgan|blackstone|kkr|evercore|lazard|barclays|ubs)",
                      r"where .{0,20}(see yourself|in 5 years)", r"hobbies", r"strengths? and weaknesses?",
                      r"\bfit\b", r"behavioral", r"tell me about a time", r"teamwork", r"\bconflict\b",
                      r"\bfailure\b", r"leadership",
                      # v4
                      r"\bweakness(es)?\b", r"\bstrengths?\b", r"\bmistakes?\b", r"\bfailed\b",
                      r"\bteam\b", r"\blifestyle\b", r"\bhours\b", r"career (goal|plan|path)",
                      r"long.term plans?", r"\bmotivat", r"\bethic", r"under pressure", r"\bstress",
                      r"deadlines?", r"\boffer\b", r"\bjoke\b", r"\briskiest\b", r"\bmajor\b",
                      r"\binternships?\b", r"extracurricular", r"your (background|experience|resume)",
                      r"why (do|did|would|should) (you|we)", r"what would you do if",
                      r"how (would|do) you (handle|deal|manage|deliver|make the case|structure)",
                      r"disagree", r"feedback", r"\bboard\b", r"\b(ceo|cfo)\b", r"succession",
                      r"\btoxic\b", r"\bculture\b", r"\bcommitment\b", r"(your|the) (university|school|degree)",
                      r"quantitative skills", r"\bpersonal\b",
                      r"(what|how).{0,40}\bbankers?\b", r"(product|industry) groups",
                      r"for fun", r"free time", r"favou?rite (class|course|subject)",
                      r"stud(y|ied) abroad", r"switched jobs", r"here to stay", r"\binitiative\b",
                      r"have you (ever )?worked on", r"headline|newspaper", r"hour weeks",
                      r"on call", r"\berror\b", r"still be an? (investment )?banker")),
]

RULES: list[tuple[str, list[re.Pattern[str]]]] = _PRE_RULES + _ORDERED_RULES


def infer_topic(text: str | None) -> str:
    """First-match topic slug for ``text`` (``untagged`` when nothing matches)."""
    blob = text or ""
    if not blob.strip():
        return UNTAGGED
    for topic, patterns in RULES:
        if any(p.search(blob) for p in patterns):
            return topic
    return UNTAGGED


def domain_for_topic(topic: str | None) -> str | None:
    return TOPIC_DOMAIN.get(topic or "")


# --------------------------------------------------------------------------- #
# Source category → topic maps (deterministic; source's own labels)           #
# --------------------------------------------------------------------------- #

_CATEGORY_TOPIC: dict[str, str] = {
    # ddeng5/Capital-Markets-Question-Bank-App firebase categories
    "understanding-banking": "behavioral",
    "warren-buffett": "investment_thesis",
    "why-banking": "behavioral",
    "failure": "behavioral",
    "outside-the-box": "behavioral",
    "restruct-distress": "restructuring",
    "accounting": "accounting",
    "accounting-advanced": "accounting",
    "enterprise-ev": "enterprise_value",
    "advanced-enterprise-ev": "enterprise_value",
    "valuation": "valuation",
    "advanced-valuation": "valuation",
    "dcf": "valuation",
    "adv-dcf": "valuation",
    "merger": "merger_models",
    "adv-merger": "merger_models",
    "lbo": "lbo",
    "adv-lbo": "lbo",
    "brainteaser": "brainteasers",
    "analytical": "behavioral",
    "background": "behavioral",
    "career": "behavioral",
    "commitment": "behavioral",
    "culture": "behavioral",
    "future": "behavioral",
    "strength-weakness": "behavioral",
    "team": "behavioral",
    # coryjburk/intv-playbook-ib_vc
    "accounting & financial statements": "accounting",
    "valuation & dcf": "valuation",
    "merger models (accretion / dilution)": "merger_models",
    "debt capital markets & leveraged finance": "credit",
    "behavioral & fit": "behavioral",
    "enterprise & equity value": "enterprise_value",
    "m&a process & deal judgment": "merger_models",
    "equity capital markets (ecm)": "capital_structure",
    "capital structure & financing strategy": "capital_structure",
    "markets & macro awareness": "markets",
    "restructuring & special situations": "restructuring",
    "lbo fundamentals": "lbo",
    # coryjburk/intv-playbook-pe_vc
    "leveraged buyouts": "lbo",
    "value creation": "value_creation",
    "accounting & financial statement analysis": "accounting",
    "investment thesis & deal evaluation": "investment_thesis",
    "operational excellence": "value_creation",
    "due diligence": "due_diligence",
    "strategic finance": "value_creation",
    "leadership & change management": "behavioral",
    "valuation & modeling": "valuation",
    "board & executive communication": "behavioral",
    "pe-backed leadership scenarios": "behavioral",
    "market & industry analysis": "industry_coverage",
    # offergenieai title labels ("M&A: …", "Accounting: …")
    "m&a": "merger_models",
    "behavioral": "behavioral",
    "behavioural": "behavioral",
    "lbo modeling": "lbo",
    "lbo modelling": "lbo",
    "ethical judgment": "behavioral",
    "accretion/dilution analysis": "merger_models",
}

# Source-declared tracks → domain (playbooks, seed).
_TRACK_DOMAIN: dict[str, str] = {
    "m&a / coverage": "ib",
    "capital markets": "ib",
    "investment": "pe",
    "portfolio operations": "pe",
    "ib": "ib",
    "pe": "pe",
    "both": "both",
    # HireAbo role files
    "investment banker": "ib",
    "mergers and acquisitions ma analyst": "ib",
    "private equity analyst": "pe",
    # ddeng5 export file (investment-banking question bank)
    "investment banking": "ib",
}

_DIFFICULTY_MAP: dict[str, str] = {
    "easy": "easy",
    "foundational": "easy",
    "basic": "easy",
    "beginner": "easy",
    "medium": "medium",
    "core": "medium",
    "intermediate": "medium",
    "hard": "hard",
    "advanced": "hard",
    "expert": "hard",
}


def category_topic(category: str | None) -> str | None:
    return _CATEGORY_TOPIC.get((category or "").strip().lower())


def track_domain(track: str | None) -> str | None:
    return _TRACK_DOMAIN.get((track or "").strip().lower())


def normalise_difficulty(raw: str | None) -> str | None:
    """Map source difficulty labels onto easy | medium | hard (None if unknown)."""
    if raw is None:
        return None
    return _DIFFICULTY_MAP.get(str(raw).strip().lower())


def category_difficulty(category: str | None) -> str | None:
    """Derive difficulty from source category names such as ``adv-dcf``."""
    c = (category or "").strip().lower()
    if not c:
        return None
    if c.startswith(("adv-", "advanced-")) or c.endswith("-advanced"):
        return "hard"
    return None


_HARD_CUES = re.compile(
    r"\b(walk me through .*(and|then)|how would .* change if|what if|explain why|derive|"
    r"stock-for-stock|pik|dtl|step-?up|nol|circular|convertible|waterfall|recap)\b",
    re.IGNORECASE,
)
_EASY_CUES = re.compile(
    r"^(what is|what are|what's|define|name|list|what does .* stand for)\b",
    re.IGNORECASE,
)


def cue_difficulty(wording: str) -> str:
    """Low-confidence difficulty guess from wording cues (never auto-approved)."""
    text = (wording or "").strip()
    if _EASY_CUES.search(text) and len(text) < 90:
        return "easy"
    if _HARD_CUES.search(text) or len(text) > 220:
        return "hard"
    return "medium"


# --------------------------------------------------------------------------- #
# Heuristic classifier                                                        #
# --------------------------------------------------------------------------- #

SIGNAL_WEIGHTS: dict[str, float] = {"category": 0.5, "wording": 0.3, "answer": 0.2}

# Source categories are coarse buckets; these rule topics nest inside them
# (e.g. ddeng5 "accounting" holds the working-capital questions, "merger" holds
# purchase-accounting ones). When the rule topic nests in the category topic,
# CATEGORY_NESTING_SHARE of the category's vote supports the more specific rule
# topic instead of opposing it.
CATEGORY_NESTING: dict[str, frozenset[str]] = {
    "accounting": frozenset({"working_capital"}),
    "merger_models": frozenset({"accounting", "valuation"}),
    "valuation": frozenset({"enterprise_value", "lbo", "restructuring"}),
    "enterprise_value": frozenset({"valuation"}),
    "restructuring": frozenset({"merger_models", "credit", "valuation"}),
    "lbo": frozenset({"credit", "capital_structure", "returns"}),
    "value_creation": frozenset({"working_capital"}),
    "capital_structure": frozenset({"credit"}),
    "investment_thesis": frozenset({"markets", "industry_coverage"}),
}
CATEGORY_NESTING_SHARE = 0.6
AUTO_APPROVE_CONFIDENCE = 0.8
SINGLE_SIGNAL_CONFIDENCE = 0.6


@dataclass
class TaxonomyGuess:
    """Heuristic topic/domain/difficulty with the signals that produced it."""

    topic: str | None
    topic_confidence: float
    rule_topic: str
    domain: str | None
    domain_confidence: float
    difficulty: str | None
    difficulty_confidence: float
    signals: dict[str, str | None] = field(default_factory=dict)

    @property
    def topic_agrees(self) -> bool:
        return bool(self.topic) and self.topic == self.rule_topic

    @property
    def topic_auto_approvable(self) -> bool:
        return self.topic_agrees and self.topic_confidence >= AUTO_APPROVE_CONFIDENCE


def _vote(signals: dict[str, str | None], prefer: str | None = None) -> tuple[str | None, float]:
    fired = {k: v for k, v in signals.items() if v and v != UNTAGGED}
    if not fired:
        return None, 0.0
    scores: dict[str, float] = {}
    for name, topic in fired.items():
        scores[topic] = scores.get(topic, 0.0) + SIGNAL_WEIGHTS.get(name, 0.1)
    category = fired.get("category")
    if category and prefer and prefer != category and prefer in CATEGORY_NESTING.get(category, ()):
        moved = SIGNAL_WEIGHTS["category"] * CATEGORY_NESTING_SHARE
        scores[category] -= moved
        scores[prefer] = scores.get(prefer, 0.0) + moved
    # Ties go to the keyword-rule topic (wording + answer agreeing outweighs a
    # coarse source category of equal weight), then alphabetical for stability.
    winner = max(sorted(scores), key=lambda t: (round(scores[t], 6), t == prefer))
    if len(fired) == 1:
        return winner, SINGLE_SIGNAL_CONFIDENCE
    total = sum(SIGNAL_WEIGHTS.get(name, 0.1) for name in fired)
    return winner, round(scores[winner] / total, 4)


def classify_taxonomy(
    wording: str,
    *,
    source_category: str | None = None,
    source_track: str | None = None,
    source_domain: str | None = None,
    source_difficulty: str | None = None,
    source_answer_text: str | None = None,
) -> TaxonomyGuess:
    """Heuristic taxonomy guess for one teaching question.

    ``source_answer_text`` must be a *source-provided* answer (never a
    synthesised one — that would make the agreement check circular).
    """
    wording_topic = infer_topic(wording)
    answer_topic = infer_topic(source_answer_text) if source_answer_text else UNTAGGED
    signals: dict[str, str | None] = {
        "category": category_topic(source_category),
        "wording": wording_topic,
        "answer": answer_topic,
    }
    rule_topic = wording_topic if wording_topic != UNTAGGED else answer_topic
    topic, topic_conf = _vote(signals, prefer=rule_topic)

    # Domain: source-declared track vs topic→domain (038). Disagreement between
    # ib and pe means a cross-track question (e.g. accounting asked in PE) → both.
    declared = (source_domain or "").lower() or track_domain(source_track)
    if declared not in {"ib", "pe", "both"}:
        declared = None
    mapped = domain_for_topic(topic) if topic else None
    if declared and mapped:
        if declared == mapped or mapped == "both" or declared == "both":
            domain, domain_conf = declared, 0.95
        else:
            domain, domain_conf = "both", 0.8
    elif declared:
        domain, domain_conf = declared, 0.9
    elif mapped:
        domain, domain_conf = mapped, topic_conf if topic == rule_topic else min(topic_conf, 0.6)
    else:
        domain, domain_conf = None, 0.0

    difficulty = normalise_difficulty(source_difficulty)
    if difficulty:
        difficulty_conf = 0.95
    else:
        difficulty = category_difficulty(source_category)
        if difficulty:
            difficulty_conf = 0.85
        else:
            difficulty = cue_difficulty(wording)
            difficulty_conf = 0.5

    return TaxonomyGuess(
        topic=topic,
        topic_confidence=topic_conf,
        rule_topic=rule_topic,
        domain=domain,
        domain_confidence=round(domain_conf, 4),
        difficulty=difficulty,
        difficulty_confidence=difficulty_conf,
        signals={**signals, "declared_domain": declared, "rule_topic": rule_topic},
    )


def topic_coverage(topics: Iterable[str | None]) -> float:
    items = list(topics)
    if not items:
        return 0.0
    return sum(1 for t in items if t and t != UNTAGGED) / len(items)
