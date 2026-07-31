# Concord — Design Language & Technical Specification

**Status:** Phase 1 mockups ready for approval — journeys at `/mockups` (do not start Phase 2 until approved)

---

## 1. Foundation & Context

### What We're Building On

This is a **monorepo** containing:
- **Existing Python scraper** (`main.py`, `scrapers/`) — Glassdoor interview question collection (**firm signals only**)
- **Next.js web app** (`apps/web`) — product UI (company rooms, concept labs, heat, pseudo-RAG stubs already scaffolded)
- **Package ecosystem** — `@ibpe/ui` (shadcn DS + `TopicHeatmap` + `DiagramCanvas`), `@ibpe/contracts`, `@ibpe/database`, `@ibpe/search`, `@ibpe/ai`
- **Data pipeline** (`src/ibpe_corpus/`) — GitHub Q/A import (teaching truth), Glassdoor occurrence signals, Gemini enrichment
- **Existing design tokens** — "Editorial Finance Terminal" theme (warm paper / ink / acid-lime) — **to be evolved** into the pastel paper system in this document

### Product Thesis (Two Equal Modes)

| Mode | Focus | Primary inputs | Flagship surfaces |
|------|-------|----------------|-------------------|
| **A — Company prep** | What Firm X actually asks | Glassdoor topic **heat** (occurrence signals) × teaching Q/A ranked by heat ∩ weakness | Company room, multi-firm heat compare, **pseudo-RAG prep session** |
| **B — Learn (modules + concept labs)** | Master finance concepts via structured curriculum | GitHub corpus + Gemini-enriched **learning modules** + **interactive JS diagrams** + resource rails | Module catalog, module hub (lessons → labs → quiz), concept lab pages, roadmap |

**Data rules (binding):**
- GitHub / curated Q/A = **teaching truth** (answers, explanations)
- Glassdoor = **firm directional signals only** (topic heat, frequency) — never answer text
- Gemini = **enrichment + session AI** (tags, diagrams drafts, “why this question,” follow-ups) — never uncited firm quotes, never laundered as “reported”

### Competitive Framing — IB Vine vs Concord

[IB Vine](https://ibvine.io/) is the closest comparable product. Concord is **not a clone**; the design must express our differentiation.

| Capability | IB Vine | Concord |
|------------|---------|---------|
| Question bank | 2,500+ curated Qs; 2,000+ “reported in interviews” across 50+ firms | Teaching corpus (GitHub + validated answers) + Glassdoor as **heat signals**, not answer source |
| Firm prep | Filter practice by bank; bank-specific reported Qs | **Company prep rooms** with **visible topic-heat matrix**, multi-firm compare, weakness overlay |
| Learning modules | 40 Learn modules (lessons, flashcards, quizzes, podcasts) | **Yes — first-class Learn modules** (lessons → concept labs → drills → quiz), differentiated by **interactive JS diagrams**, firm-heat bridges, and apply-to-company-prep CTAs (not podcast-first) |
| Adaptive practice | Mastery tracking, saved Qs, flashcards | **Pseudo-RAG sessions** (heat ∩ weakness ∩ prompt), explainable “why this,” spaced review |
| Mocks | Audio mock library + separate IB Mock (voice AI) | Firm-templated **interview simulator** + Warren coach + interviewer cast; AI assists scoring/feedback with citations |
| AI role | IB Mock voice delivery practice | Gemini for enrichment graphs, session briefs, retrieval reasons, follow-ups — **corpus-grounded**, not open web chat |
| Notes / roadmap | Personal notes on questions | Notes + bookmarks + **interview-date study plan** mixing company drills + concept checkpoints |

**Design implication:** Screens must center **company heat**, **pseudo-RAG packs with citations**, **Learn modules → concept labs (diagram-first)**, and **roadmap/plan urgency**. Active-recall drills live *inside* modules — the product must not *feel* like a bare flashcard app.

---

## 2. Creative Direction

**Imagine Notion, Khan Academy, and Duolingo had a child:**

- **Notion's monochrome editorial discipline** as the resting state (true black/white/grayscale for ~80% of the interface)
- **Notion's information architecture** as the layout base: **left sidebar + single document page**, page title as the only H1, nested pages for flow steps, callouts for Warren — not dashboards, not journey marketing chrome
- **Khan Academy's tactile hand-drawn warmth** as the illustration texture (rough.js hand-drawn primitives) — used **sparingly** inside content, never as full-page chrome
- **Duolingo's reward-driven gamification energy** as the emotional engine (streaks, XP, celebrations) — but restrained into a **pastel palette** rather than saturated primaries, so it reads **premium and calm** rather than toy-like

**Layout resting rules (Notion base):**
1. Sidebar = workspace navigation (Company / Learn / Plan + step pages). Main = white document.
2. One page title. Breadcrumb optional and quiet. No stacked marketing headers.
3. Warren lives in a **callout block**, not a competing hero column.
4. Lists and databases = simple bordered rows. Cards/rough frames only when the interaction needs a paper moment.
5. Meta (“hard parts”, Phase labels) stays out of the reading path — sidebar footer at most.

This is a **banking interview prep platform** — trust reads through precision, not energy. Numbers stay visually calm. No bounce on financial figures. Hand-drawn aesthetic adds **warmth and approachability** to a high-stakes domain without compromising **editorial rigor**.

---

## 3. Color System

### Base — Monochrome Editorial Discipline

~80% of the interface uses true monochrome (Notion's discipline):

```css
/* Light mode */
--paper: oklch(0.975 0.012 92);    /* Warm off-white background */
--ink: oklch(0.18 0.014 55);        /* Near-black text */
--graphite: oklch(0.42 0.016 60);   /* Secondary text */
--stone: oklch(0.91 0.014 88);      /* Borders/dividers */

/* Dark mode */
--paper: oklch(0.16 0.012 55);
--ink: oklch(0.94 0.01 92);
--graphite: oklch(0.68 0.015 80);
--stone: oklch(0.26 0.012 60);
```

**One functional accent color** reserved strictly for primary actions/links:

```css
--lime: oklch(0.86 0.21 128);             /* Light mode */
--lime-foreground: oklch(0.2 0.04 130);   
--lime: oklch(0.88 0.22 128);             /* Dark mode */
```

### Semantic Pastel System

Used deliberately (not everywhere, but more generously than "two zones only") for:
- Data visualizations (heatmaps, charts)
- Reward/feedback micro-interactions (streaks, XP, correctness)
- All color-coded states (weak topics, mastery levels)

**Soft sage** (success/correct/gain):
```css
--success: oklch(0.82 0.08 145);
--success-foreground: oklch(0.25 0.04 148);
```

**Soft coral** (error/incorrect/loss):
```css
--error: oklch(0.78 0.12 25);
--error-foreground: oklch(0.28 0.04 28);
```

**Soft amber** (streaks/XP):
```css
--streak: oklch(0.84 0.11 75);
--streak-foreground: oklch(0.32 0.04 72);
```

**Soft lavender** (tier/milestone):
```css
--milestone: oklch(0.80 0.10 290);
--milestone-foreground: oklch(0.30 0.04 285);
```

**Heat scale** (topic intensity, 0-4):
```css
/* Light mode */
--heat-0: oklch(0.96 0.008 90);   /* No heat / no data */
--heat-1: oklch(0.9 0.05 128);    /* Low */
--heat-2: oklch(0.84 0.1 128);    /* Medium */
--heat-3: oklch(0.78 0.15 128);   /* High */
--heat-4: oklch(0.72 0.2 128);    /* Very high */

/* Dark mode versions adjust lightness */
```

**Weak topic overlay**:
```css
--weak: oklch(0.62 0.14 35);  /* Coral-leaning for "needs work" */
```

### Accessibility Rule (Binding Constraint)

**Pastel hue is never the sole signal.** Every color-coded state pairs with a redundant non-color cue:

- **Icon** (checkmark/X for correct/incorrect)
- **Shape** (circle vs square for different categories)
- **Pattern** (hatch/diagonal lines for weak topics)

Heatmap cells display numeric intensity **in addition to** background color. Colorblind users can read the product fully.

### Number Calm Rule (Binding Constraint)

Numbers stay visually calm regardless of context:
- **No bounce animation** on financial figures, scores, or percentages
- **No saturation spikes** when values change
- Use **calm linear/ease-out** transitions only (see Animation Logic)
- Trust reads through **precision and stability**, not energy

---

## 4. Typography System

### Fonts

```css
--font-display: "Instrument Serif", "Instrument Serif Fallback", ui-serif, Georgia, serif;
--font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;
--font-mono: "Geist Mono", "Geist Mono Fallback", ui-monospace, monospace;
```

**Role mapping:**
- **Display** (Instrument Serif) — page headlines, section titles, metric numbers
- **Sans** (Geist) — body text, UI controls, labels
- **Mono** (Geist Mono) — code, technical labels, data tables, small-caps eyebrows

### Scale

```css
/* Headings */
h1: 2.25rem / 3.75rem (text-4xl / md:text-6xl)
h2: 1.875rem / 3rem (text-3xl / md:text-5xl)
h3: 1.5rem / 1.875rem (text-2xl / md:text-3xl)
h4: 1.25rem / 1.5rem (text-xl / md:text-2xl)

/* Body */
body: 1rem (text-base)
small: 0.875rem (text-sm)
micro: 0.75rem (text-xs)

/* Eyebrows (mono, all-caps, wide tracking) */
eyebrow: 0.6875rem / 11px (text-[11px], tracking-[0.14em], uppercase)
```

### Hierarchy Pattern

Eyebrow (mono, muted) → Display headline (Instrument Serif, foreground) → Body (Geist sans).

Example:
```
COMPANY PREP [mono, 11px, muted]
Goldman Sachs [Instrument Serif, 3rem, ink]
72 questions • 8 topics [Geist, 0.875rem, graphite]
```

---

## 5. Spacing, Radii, Shadows

### Spacing Scale (8px base)

```css
--spacing-0: 0px;
--spacing-1: 0.25rem;  /* 4px */
--spacing-2: 0.5rem;   /* 8px */
--spacing-3: 0.75rem;  /* 12px */
--spacing-4: 1rem;     /* 16px */
--spacing-5: 1.5rem;   /* 24px */
--spacing-6: 2rem;     /* 32px */
--spacing-8: 3rem;     /* 48px */
--spacing-10: 4rem;    /* 64px */
--spacing-12: 6rem;    /* 96px */
```

### Border Radii

```css
--radius: 0.625rem;              /* Base (10px) */
--radius-control: 0.625rem;      /* Buttons, inputs (10px) */
--radius-panel: 0.875rem;        /* Cards (14px) */
--radius-study: 1.5rem;          /* Drill cards, major content blocks (24px) */
--radius-editorial: 0.25rem;     /* Minimal accent (4px) */
--radius-pill: 9999px;           /* Fully rounded pills */
```

**Paper-textured cards** (drill cards, major panels) use `--radius-study` (1.5rem) to give breathing room to the hand-drawn edges.

### Shadows

Minimal, never heavy:

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
```

Use sparingly. Most elevation comes from **borders** and **paper texture**, not shadow depth.

---

## 6. Characters

### Warren — Fixed-Identity Coach

**Role:** Persistent companion through prep mode (study plan, drills, progress, Learn). **Not** present as the speaking face in mock interviews (interviewer cast takes over; Warren may return after score).

**Identity:** Fixed, hand-illustrated character — **never** DiceBear, never procedural seeds, never stock avatar kits. One canonical design owned by Concord.

#### Character brief (locked)

| Trait | Decision | Why |
|-------|----------|-----|
| Form | Human mentor (bust) | Finance seriousness; warmth from illustration, not animal mascot |
| Archetype | Older coach (~60s), calm authority | Name nods to wise-investor mentor energy; **original character**, not a likeness of any real person |
| Hair | Balding crown + soft white/grey side hair | Strong silhouette; reads at 40px |
| Eyes / glasses | Round wire frames **on the eyes** at UI sizes | Forehead-perched glasses only in large hero art — too noisy below 64px |
| Attire | Navy cardigan over cream collared shirt, **no tie** | Coach ≠ interviewer. Interviewers wear firm attire via DiceBear cast |
| Outline | Stable ink stroke, editorial flat fills | Matches rough.js paper system without wobbling face geometry |
| Accent | Lime / streak marks **only** on Celebrating | Never lime skin, never lime cardigan |

**Voice (copy):** Short, specific, explainable. Never hype. Examples: “GS over-indexes LBO — start there.” / “I’ll wait while you write.”

**Emotional range (layer-swapped, same silhouette):**

| Mood | Face | Prop | When |
|------|------|------|------|
| **Idle** | Soft smile, open eyes | — | Ambient; breathing loop |
| **Thinking** | Flat mouth, slight brow lift | Small thought circle | Ranking / packing / analyzing |
| **Encouraging** | Warm smile, lifted brows | — | Nudge when stuck |
| **Celebrating** | Wide smile | Tiny spark marks | State-confirmed milestone only |
| **Concerned** | Soft frown, inward brows | — | Weak topic / consecutive misses |
| **Paused** | Neutral, attentive | — | User focused (typing/reading) — **breathing off** |

**Animation:**
- Idle breathing: subtle scale/translate; **must pause** while `userFocused`
- Mood changes: instant layer swap (or ≤200ms calm ease) — no morphing that wobbles identity
- Celebrating: short pop (bounce easing) only after confirmed score

**Construction (Phase 1 decision — locked):**
- **SVG layer tree** in `apps/web/components/mockups/warren.tsx` (later `@ibpe/ui`)
- Layers: `body` (cardigan + shirt) → `head` → `hair` → `glasses` → `eyes` → `brows-{mood}` → `mouth-{mood}` → `prop-{mood}`
- Only eyes/brows/mouth/prop swap per mood; body/head/glasses/hair stay fixed
- Raster concept sheets live in `apps/web/public/mockups/warren/` for art direction reference — **runtime uses SVG**, not PNG sprites
- Lottie reserved as future upgrade if motion needs exceed CSS

**Placement:**
- Compact bust (64–88px) beside asides in prep flows
- Inline with `bracket` annotations
- Larger (96–120px) only on welcome / milestone moments

**Contrast with interviewer cast:**
| | Warren | Interviewers |
|--|--------|----------------|
| Art | Hand SVG, one identity | DiceBear seeded |
| Role | Coach / meta | In-scene professionals |
| Emotion | Full mood set | listening / speaking / evaluating |
| Attire | Cardigan coach | Firm-coded personas |

**Anti-patterns (reject in review):**
- Bootstrap / Heroicon / “user circle” placeholders
- DiceBear or any seeded avatar for Warren
- Photoreal or 3D head
- Lime-filled body
- Competing motion while the user types

Concept sheets (art direction): `/mockups/warren/warren-portrait-idle.png`, `warren-expression-sheet.png`, `warren-silhouette-scale.png`.

### Interviewer Cast — 3-5 Fixed Named Personas


**Role:** Mock interview mode only. Each interviewer has a distinct personality/background (e.g. "Morgan — VP at Goldman Sachs," "Alex — PE Associate at KKR").

**Identity:** Fixed named personas, **never procedurally regenerated per session**. User sees the same interviewer face/name if they repeat the same mock type.

**Construction method:** **DiceBear-style modular/seeded avatar system**
- Library: `@dicebear/core` + `@dicebear/styles` (e.g. `adventurer`, `lorelei`, `notionists`)
- **Fixed seeds** per interviewer (e.g. `seed: "morgan-vp-gs"`)
- **Deterministic** — same seed = same avatar every time, no wobble

**Behavioral states (deliberately simpler than Warren):**
- **Listening** — neutral, attentive pose
- **Speaking** — subtle mouth/eye animation or static "speaking" pose
- **Evaluating** — brief pause before feedback reveal

Warren carries the emotional depth of the product; interviewers stay **visually distinct but behaviorally restrained**. They are **professional personas**, not cartoon sidekicks.

**Placement:**
- **Top of mock interview screen** (interviewer card: avatar + name + title + firm)
- Static or subtle looping animation (not distracting)

---

## 7. Hand-Drawn / Paper System

### rough.js — Core Rendering Engine

**Library:** `rough-js` (npm: `roughjs`, ~9kB gzipped)

**Primitives:** line, rectangle, ellipse, circle, polygon, arc, curve, path

**SVG generator pattern:**
```javascript
import rough from 'roughjs';
const rc = rough.svg(svgElement);
const node = rc.rectangle(10, 10, 200, 200, {
  fill: 'var(--lime)',
  fillStyle: 'hachure',
  roughness: 1.2,
  bowing: 1,
  seed: 42 // CRITICAL: fixed seed for memoization
});
svgElement.appendChild(node);
```

**Binding constraint (memoization):**
Every rough.js element **must use a locked/fixed seed** and be **memoized** (React.useMemo, or cached during SSR) so re-renders don't cause the linework to visibly shift or wobble between renders. The hand-drawn look must feel **stable, not glitchy**.

**Fill styles available:**
- `hachure` (default, parallel hatching)
- `solid` (filled but with rough edges)
- `zigzag`, `cross-hatch`, `dots`, `dashed`, `zigzag-line`

Use `hachure` or `cross-hatch` for shaded areas (drill card backgrounds, emphasis boxes). Use `solid` sparingly (only for Warren's key visual elements if needed).

### rough-notation — Annotation Semantic Map (Binding Constraint)

**Library:** `rough-notation` (npm: `rough-notation`, 3.8kB gzipped, built on rough.js)

**Annotation types:** `underline`, `box`, `circle`, `highlight`, `strike-through`, `crossed-off`, `bracket`

**Strict semantic map — the same mark must mean the same thing everywhere in the app:**

| Mark | Meaning | Example usage |
|------|---------|---------------|
| **Circle** | Results and numbers (scores, key stats) | Final score reveal, milestone count |
| **Underline** | A specific phrase within feedback text worth noticing | "Your DCF assumption was strong" |
| **Highlight** | The strong/correct part of the user's own answer during review | User wrote "WACC = rD(1-T)(D/V) + rE(E/V)" — highlight this during feedback |
| **Strike-through** | A wrong assumption, or a completed study-plan item | "~~You forgot tax shield~~" or checked-off drill |
| **Box** | A self-contained unit (formula, definition, callout) | Formula card, concept definition box |
| **Bracket** | Warren's aside commentary next to a block of content | Sidebar note from Warren |

**API usage pattern:**
```javascript
import { annotate, annotationGroup } from 'rough-notation';

const annotation = annotate(element, {
  type: 'circle',
  color: 'var(--lime)',
  strokeWidth: 2,
  padding: 8,
  animationDuration: 600
});

annotation.show(); // Triggers draw animation
```

**Animation sequencing:**
```javascript
const group = annotationGroup([annotation1, annotation2, annotation3]);
group.show(); // Animates in order
```

**When to animate:**
- **On feedback reveal** (after answer is scored, not on submit tap)
- **On milestone unlock** (celebration moment)
- **On hover/focus** for interactive elements (optional, not default)

**When NOT to animate:**
- On page load (instant final state, or brief delay before animating key callouts)
- On list items scrolling in (too expensive, dilutes impact)

**`prefers-reduced-motion` handling (binding constraint):**
rough-notation already respects this via `animate: false` config. Ensure all annotation calls check media query:
```javascript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
annotate(element, { type: 'circle', animate: !prefersReducedMotion });
```

### Torn-Paper Edges — SVG Filters

**Effect:** `feTurbulence` + `feDisplacementMap` for organic, torn-paper edge distortion

**Implementation:**
```svg
<svg style="position: absolute; width: 0; height: 0;">
  <defs>
    <filter id="torn-paper-static" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence
        type="turbulence"
        baseFrequency="0.05"
        numOctaves="2"
        seed="1"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="10"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    <filter id="torn-paper-hero" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence
        type="turbulence"
        baseFrequency="0.05"
        numOctaves="2"
        result="noise"
      >
        <animate
          attributeName="baseFrequency"
          values="0.05;0.052;0.05"
          dur="10s"
          repeatCount="indefinite"
        />
      </feTurbulence>
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="15"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </defs>
</svg>
```

**CSS application:**
```css
.drill-card {
  filter: url(#torn-paper-static);
}

.score-reveal-hero {
  filter: url(#torn-paper-hero);
}
```

**Binding constraint (performance):**
- **Bake the effect into static pre-rendered assets** for routine, repeated cards (list items, drill cards). Use a **single shared filter with a fixed seed** applied via CSS.
- **Reserve the live, dynamically recalculated filter** (`torn-paper-hero` with animated baseFrequency) for **one or two hero moments only** (e.g. final score reveal modal).
- **Recalculating this live across a scrolling list is a real mobile performance risk.** Test on low-end Android before applying broadly.

**`prefers-reduced-motion` handling:**
Disable animated turbulence, fall back to static filter or no filter.

### Handwriting Text Streaming — Vivus.js Path Draw

**Library:** `vivus` (npm: `vivus`, dependency-free, uses stroke-dashoffset)

**Use case:** Reserved for **rare, ceremonial, short phrases only**:
- Warren's key one-liners ("Great work!" after milestone)
- Milestone callout headline ("10-day streak!")
- Final score reveal headline ("You scored 87%")

**Never applied to:**
- Routine per-question feedback text (too expensive per character, dilutes impact)
- Body text, labels, or UI controls

**Pattern:**
1. Convert handwriting typeface text to **SVG path outlines** (Illustrator / Figma / online converter)
2. Ensure paths have `stroke` and `fill: none` (Vivus animates strokes only)
3. Embed SVG inline or load via `<object>`/`<img>` (inline preferred for scripting)
4. Initialize Vivus:
```javascript
import Vivus from 'vivus';

new Vivus('svg-element-id', {
  type: 'oneByOne',       // Sequential drawing
  duration: 120,          // Frames (~2 seconds at 60fps)
  animTimingFunction: Vivus.EASE_OUT
});
```

**Fallback for routine feedback:**
Simple fade/slide-up paired with a rough-notation underline. Much cheaper, still on-brand.

**`prefers-reduced-motion` handling:**
Skip Vivus animation, show final state instantly.

---

## 8. Animation Logic — Three Easing "Voices"

Applied consistently, **never mixed within the same element type**.

### 1. Settling Ease (Slight Overshoot)

**Use:** Cards, panels, paper-textured elements arriving on screen

**Easing:** `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring-like, slight overshoot)

**Duration:** 280ms (--duration-panel)

**Example:**
```css
.drill-card-enter {
  animation: slideUp 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### 2. Bouncy Spring

**Use:** Warren's reactions, celebrations, streaks, XP gains

**Easing:** `cubic-bezier(0.68, -0.55, 0.27, 1.55)` (elastic bounce)

**Duration:** 400ms (--duration-milestone for big celebrations, --duration-control for smaller)

**Example:**
```css
.warren-celebrate {
  animation: bounce 400ms cubic-bezier(0.68, -0.55, 0.27, 1.55);
}
```

### 3. Calm Linear/Ease-Out

**Use:** All numeric and financial data updates

**Easing:** `ease-out` or `linear` (no bounce, no overshoot)

**Duration:** 200ms (--duration-control)

**Binding constraint:** Numbers **never bounce**, regardless of how positive the change is. Trust reads through precision.

**Example:**
```css
.score-number {
  transition: transform 200ms ease-out;
}
```

### Animation Rules (Binding Constraints)

1. **Reactions are state-confirmed, never optimistic.** Warren, confetti, and glow effects fire **only after a result is actually confirmed** (e.g. after an answer is scored), never on tap/submit itself.

2. **Expensive effects are budgeted to meaningful moments:**
   - rough.js redraws → only on state change, memoized otherwise
   - Live paper filters → 1-2 hero moments max
   - Handwriting draw-ons → rare ceremonial phrases only
   - Ambient glow → reserved for specific cells/moments, not always-on

3. **Heatmap/data glow:**
   - Reserved for the **1-3 cells that matter most** (strongest/weakest topic)
   - OR triggered on **hover/focus**
   - Never always-on across a full grid

4. **Celebration mechanism varies by context:**
   - **Hand-drawn paper-burst** (rough.js polygons scattering) for most milestones
   - **Warren reacting himself** (pose/animation) as alternative payoff
   - **Never one global confetti effect for everything** — varies by moment

5. **`prefers-reduced-motion` is a hard requirement:**
   - Draw-on, bounce, and paper-texture animations collapse to **instant, final-state appearance**
   - rough-notation already handles this via `animate: false`
   - Check media query for Vivus, Warren animations, all transitions

---

## 9. Asset / Library Stack

### Core Libraries (Required)

| Library | Version | Role | Notes |
|---------|---------|------|-------|
| `roughjs` | ^4.6.6 | Hand-drawn SVG primitives | All rough.js calls use fixed seeds + memoization |
| `rough-notation` | ^0.5.1 | Annotation marks | Semantic map enforced (see §7) |
| `vivus` | ^0.4.6 | SVG path stroke animation | Rare ceremonial text only |
| `@dicebear/core` | ^10.3.0 | Avatar generation | Fixed seeds for interviewer cast |
| `@dicebear/styles` | ^10.3.0 | Avatar style definitions | Suggest `adventurer`, `lorelei`, or `notionists` |

### Supporting Libraries (Optional, To Be Confirmed in Phase 1)

| Library | Role | Notes |
|---------|------|-------|
| `mermaid` | Declarative concept diagrams | Primary host inside `DiagramCanvas` for statement links, WACC, etc. |
| Custom finance diagram components | EV bridge, sources & uses, paper LBO | When Mermaid is too weak; still versioned defs in contracts |
| `d3` or `visx` | Charts beyond heat matrices | Accuracy-over-time, optional; prefer rough.js overlay aesthetic |
| `framer-motion` / `motion` | React animation orchestration | Already in `@ibpe/ui` (`motion: ^12.23.12`) — Warren, panels |
| AI SDK (`ai` + Gemini) | Session brief, retrieval reasons, follow-ups | Corpus-grounded only; citations required |
| Lottie (`lottie-web`) | Warren (if AE export) | Fallback if SVG layer-swap insufficient |

### Fonts (Already Loaded)

- **Instrument Serif** (display)
- **Geist** (sans)
- **Geist Mono** (mono)

(Defined in `packages/ui/src/styles/globals.css`)

### Asset Workflow

1. **Rough.js elements** — generated client-side at runtime (SVG inline)
2. **Warren character** — SVG or Lottie asset, imported as React component or JSON
3. **Interviewer avatars** — generated client-side via DiceBear (deterministic from seed)
4. **Handwriting SVG paths** — pre-converted text, embedded inline
5. **SVG filters** — defined once in root SVG `<defs>`, referenced via CSS `filter: url(#id)`

---

## 10. Required Screens / Flows (Revised — Concord Product Shape)

Flows are organized around **Mode A (company prep)** and **Mode B (Learn: modules + concept labs)** — not a generic drill app. Every flow below must surface company heat, AI-grounded retrieval, diagrams, modules, and/or roadmap notes where they belong.

### 10.0 Journey Map (How Modes Connect)

```text
Onboarding → pick Mode A and/or B + target firms + interview date
     ↓
Dashboard (heat snapshot + weak topics + next session "why")
     ├─ Mode A ─► Company room ─► Heat compare ─► Pseudo-RAG session
     │                                              ↓
     │                                    Signature question study
     │                                    (layered reveal + diagram + resources)
     ├─ Mode B ─► Learn module catalog ─► Module hub
     │                 ↓                      ↓
     │            Lessons / notes      Concept lab (diagram)
     │                 ↓                      ↓
     │            Active-recall drill   Module quiz / checkpoint
     │                 └──────────┬───────────┘
     │                            ↓
     │                 "Apply at [Firm]" → Mode A
     ├─ Study plan (interview-date urgency × modules + heat ∩ weakness)
     ├─ Interview simulator (firm-templated)
     └─ Progress (firm readiness + module/concept mastery + heat∩weakness)
```

---

### 10.1 Onboarding

**Screens:**
1. Welcome (Warren intro — product promise: company rooms + concept labs)
2. Path select: **Company prep** / **Learn (modules)** / Both
3. Track + role (IB / PE / Both; Analyst / Associate / …)
4. **Multi-select target firms** (required for Mode A; empty set blocked)
5. Interview date + daily availability (feeds study plan urgency)
6. Optional focus prompt seed ("Superday — accounting + paper LBO")

**Visual opportunities:**
- Warren entrance (bouncy spring) + handwriting one-liner ("Let's build your prep studio")
- Firm multi-select as paper chips with rough.js borders (not a plain checkbox list)
- Selected-firm **preview heat strip** (aggregate intensity bars from Glassdoor signals) — first taste of Mode A signature visual
- Interview-date urgency meter (calm linear; days remaining circled)

**Data:** track, role, target firm IDs, interview date, availability, optional focus prompt → seeds dashboard + study plan + RAG defaults

---

### 10.2 Dashboard / Home

**Asymmetric editorial composition** (not a card grid). Mode toggle: Company prep ↔ Learn.

**Sections:**
1. Target-company switcher (persisted multi-select)
2. **Topic-heat snapshot** for selected set (click → full heat compare)
3. Weak-topic spotlight (heat ∩ weakness) with **explainable "why"**
4. Auto-suggested next session (prefer **pseudo-RAG**, **continue Learn module**, or weak-topic drill; show reasons)
5. Days until interview + study streak
6. Today's plan peek (company drill + **module checkpoint** mix)
7. Shortcuts: company room, heat compare, **Learn catalog**, module roadmap, simulator

**Visual opportunities:**
- **Heat snapshot** — mini firm×topic matrix (`TopicHeatmap`); glow on 1 weakest cell; hatch = user weakness
- **"Why this session" callout** — rough-notation `bracket` + Warren aside ("High Goldman LBO heat + your low mastery")
- Streak number — rough-notation `circle` + soft amber (calm number motion)
- Firm readiness pills — soft lavender for milestone tiers; numeric score always visible
- Next-session CTA — torn-paper-static on hover

**Key data:** target firm set, heat matrix (firm×topic intensity + sample size N), weak topic IDs + reasons, days-to-interview, streak, suggested session type + explanation string

---

### 10.3 Mode A — Company Prep Room (`/companies/[firm]`)

**Flagship surface.** Hero firm identity; topic heat above the fold.

**Sections:**
1. Firm hero (name, track, role filter)
2. **Dominant topic-heat panel** (this firm) + weakness overlay toggle
3. CTAs: **Start pseudo-RAG** / Adaptive firm session
4. Concepts this firm over-indexes (deep links into Mode B)
5. Reported-signal browser (occurrence explorer — **not** answer bible)
6. Firm-style resource rail (curated primers)

**Visual opportunities:**
- Full-width heat matrix as the **signature visual** (numeric intensity + hatch for weak; sample-size caption)
- Click cell → concept lab + scoped RAG start (annotated "focus from heat")
- Firm-over-index concept strip — rough.js boxes around top 3 concepts
- Warren bracket: "Evercore over-indexes merger models — drill those first"

**Key data:** firm id, role filter, topic intensities + N signals, weak overlay flags, concept relevance scores, resource links

---

### 10.4 Mode A — Multi-Firm Heat Compare (`/prep/heat`)

**Sections:**
1. Selected firm chips (add/remove)
2. Aligned topic×firm intensity matrix (compare mode)
3. Aggregate "shared heat" vs "firm-unique" callouts
4. Click cell → scoped pseudo-RAG / concept lab

**Visual opportunities:**
- Compare-mode heatmap (existing `compareMode` prop) with rough.js cell borders
- Shared-heat topics get soft sage underline annotation; firm-unique get bracket callouts
- Confidence / sparsity warning for low-N PE firms (pattern + mono caption — not color alone)

**Key data:** multi-firm heat cells, per-cell N, shared vs unique topic lists

---

### 10.5 Mode A — Pseudo-RAG Prep Session (`/prep/rag`) — AI-Grounded Flagship

**Not open chat.** Corpus retrieval pack frozen at session start.

**Screens / beats:**
1. Session brief (target firms + optional focus prompt) — Gemini may rewrite brief **with citations**
2. Pack preview: ranked Q/A cards each showing **why retrieved** (heat hit / weak topic / semantic match / source id)
3. Interactive study loop (signature layered reveal — see §10.7)
4. Mid-session peek rail: active concept diagram + resources + heat context
5. Session close: mastery update + refreshed heat∩weakness recommendations

**Visual opportunities:**
- Citation cards (`PseudoRagCitationCard`) with rough.js borders; provenance chips (GitHub / validated / synthesised — never Glassdoor-as-answer)
- "Why retrieved" reasons as rough-notation `underline` on the matching phrase
- Pack freeze indicator — rough-notation `box` around pack membership count
- Warren explains retrieval once at start (bracket), then pauses during focus
- AI follow-up chips after reveal — soft lavender; must cite pack item ids

**Key data:** frozen pack items `{ questionId, answerId, reasons[], citations[], heatScore, weaknessScore, similarity }`, session brief text, Gemini model/prompt version for audit

**AI rules (binding):** Gemini may rewrite brief, explain retrieval, generate follow-ups — always cite pack items; refuse uncited firm-specific claims.

---

### 10.6 Mode B — Learning Modules (`/learn`, `/learn/[module]`)

**First-class curriculum surface** (IB Vine Learn analogue). Modules package teaching into a path; **concept labs are the deep units inside**.

We are not skipping modules in favor of orphaned concept pages. Structure:

```text
Learn catalog → Module hub → Lesson → Concept lab (diagram) → Drill / flashcards → Module quiz
                              ↓
                     Firm-heat bridge / Apply at [Firm]
```

#### 10.6.1 Module catalog (`/learn`)

**Sections:** track filters (IB / PE / Behavioural / Verticals); module cards with progress %; recommended next module (prereqs + weak topics + firm heat).

**Visual opportunities:**
- Module cards — paper texture + rough.js border; progress as calm numeric % (circled when complete)
- Domain chips (Accounting, Valuation, DCF, M&A, LBO, Markets, Behavioural, …)
- Recommended module — Warren `bracket` with explainable why (prereq ready + heat∩weakness)

**Key data:** module id/slug, domain, lesson count, diagram count, user progress %, prereq module ids, recommendation reason

#### 10.6.2 Module hub (`/learn/[module]`)

**Sections:**
1. Module hero (title, estimated time, mastery)
2. **Module roadmap** — ordered checkpoints: lessons → concept labs → drills → quiz
3. Lesson list (structured content + lab notes)
4. Embedded / linked **concept labs** (diagram-first deep dives)
5. Active-recall set (flashcard-style Q&A *within* the module — not the whole product metaphor)
6. End-of-module quiz + diagram checkpoint
7. “Where firms ask this” heat strip for target companies
8. CTA: Start module session / Continue / Apply at [Firm]

**Visual opportunities:**
- Hand-drawn **module roadmap path** (rough.js): current = lime circle; done = strike-through / crossed-off; locked = dashed
- Lesson open state — progressive notes with `box` on formulae; Warren pitfall `bracket`
- Mini heat strip for module topics × user’s target firms
- Quiz score — rough-notation `circle`; calm number motion

**Key data:** ordered checkpoint graph, lesson bodies, linked concept slugs, drill item ids, quiz items, firm_relevance for module topics, completion state per checkpoint

**MVP module set (illustrative):** Accounting Foundations; Enterprise Value & Equity Value; DCF & WACC; M&A / Merger Models; LBO & Paper LBO; Behavioural Story Bank; plus PE-oriented variants as coverage allows.

---

### 10.7 Mode B — Concept Lab (`/concepts/[slug]`)

**Atomic deep-dive inside modules** (also reachable from company rooms / search). Diagram-first, not text dump.

**Sections:**
1. Concept hero (title, domain, parent module crumb, mastery label)
2. **Interactive diagram canvas** (Mermaid / finance diagram host) — first-class teaching medium
3. Progressive lab notes (prerequisites → core → advanced → apply-at-firm)
4. Resource rail (internal concepts + labelled external refs)
5. Linked questions + Start drill CTA
6. Parent module progress peek + next checkpoint
7. "Where this shows up" firm bridges (Glassdoor heat relevance)

**Visual opportunities:**
- **DiagramCanvas** as hero visual — step-highlight nodes; rough.js frame; reduced-motion → table/text fallback
- Parent-module roadmap mini-path (where this concept sits)
- Prerequisite graph mini-map (nodes = concepts; edges = depends-on)
- Formula/definition callouts — rough-notation `box`
- Firm bridge chips — heat intensity number + hatch if weak for user
- Warren bracket asides on common pitfalls

**Key data:** concept slug, parent module id, mermaid/diagram definition version, a11y fallback, prerequisite edges, mastery, firm_relevance map, resources[], linked question ids

**MVP diagrams:** three-statement linkages, EV→equity bridge, DCF/WACC build-up, sources & uses, paper-LBO IRR/MOIC sketch

---

### 10.8 Signature Question Study (Layered Reveal)

**Product-defining interaction** for both modes (adaptive study, RAG turns, concept drills).

**Before reveal:** large question typography; topic/difficulty; Mode A company context (firm chip, occurrence count, stage); thinking timer; confidence select; optional hint; weak-topic indicator.

**Layered reveal order (not a generic accordion):**
1. Direct answer
2. Interview-ready explanation
3. Step-by-step walkthrough
4. **Interactive diagram** (when concept has one)
5. Formulae / calculations
6. Assumptions
7. Common mistakes
8. Follow-up questions (AI-generated OK if cite pack/concept)
9. Related concepts (Mode B deep links)
10. Resource hyperlinks
11. Sources / provenance / validation label
12. CTAs: "Practise more on this weak topic" / "See how [Firm] asks this"

**Visual opportunities:**
- Each layer settles in with settling ease; annotations fire **after** layer confirmed visible
- Strong phrases — `highlight` (sage); pitfalls — `underline` (coral); formulae — `box`; Warren tip — `bracket`
- Diagram slot expands inline (never new tab)
- Provenance rail: mono chips (`source_provided` / `corpus_match` / `synthesised`) — never attribute Gemini to Glassdoor
- Keyboard: r reveal · n next · p prev · bookmark · note · confidence · open concept

**Key data:** layered answer payload, diagram id, resources, provenance, firm occurrence meta (Mode A), mastery/confidence ratings

---

### 10.9 Adaptive / Weak-Topic Drills & Concept Drills

**Modes:** adaptive weak-topic; company adaptive (firm heat ∩ weakness); module/concept drill; timed / spaced review.

**Visual opportunities:**
- Session header shows explainable ranking ("low mastery + high GS frequency + due for review") — bracket annotation
- Mid-session peek: diagram + parent module + heat context without leaving focus
- Drill summary: accuracy metrics (calm numbers), XP paper-burst, recommended next **module checkpoint**

**Key data:** session type, frozen question membership, per-item ratings (Again/Hard/Good/Easy), mastery deltas, explanation strings, parent module id when in Learn

---

### 10.10 Study Plan / Learning Roadmap

**Not a bare to-do list.** Mixes Mode A company work and Mode B **module lessons/labs** with interview-date urgency.

**Sections:**
1. Interview countdown + weekly goals
2. Daily assignments: company drills + **Learn module checkpoints** + concept labs + **diagram checkpoints**
3. Prerequisite-aware module ordering
4. Catch-up logic when behind
5. Mock interview slots

**Visual opportunities:**
- Roadmap timeline (rough.js path) mixing firm chips, **module nodes**, and concept nodes
- Completed items — `crossed-off` / strike-through
- Diagram checkpoints — small diagram thumbnails in plan cells
- Urgency band intensifies as date approaches (calm amber → coral pattern, not bounce)
- Warren encourages catch-up; pauses while user edits availability

**Key data:** interview date, daily availability, target firms, module progress, mastery, heat priorities, prerequisite graph, assignment status

---

### 10.11 Interview Simulator (Firm-Templated)

**Setup:** firm + role → IB or PE stage template (Why banking / Accounting / Paper LBO / …).

**During:** interviewer cast (DiceBear fixed seeds); timed responses; optional diagram prompts ("sketch sources & uses"); notes; self-rating.

**After:** readiness report biased to weaker stages; links into Concept lab + resources; heat∩weakness refresh.

**Visual opportunities:**
- Interviewer card in context (listening/speaking/evaluating)
- Stage progress as rough.js path checkpoints
- Diagram prompt panel reuses DiagramCanvas
- Score reveal hero (torn-paper-hero + circled score + rare handwriting headline)
- Feedback annotations per semantic map; AI summary must cite session turns / corpus ids

**Key data:** firm template stages, interviewer id/seed, turn transcripts, stage scores, recommended concept links

---

### 10.12 Notes, Bookmarks, Collections

**Screens:** note editor on question/concept; bookmark lists; custom collections; search saved items.

**Visual opportunities:**
- Notes on paper-textured surface; rough.js border; optional Warren bracket prompts ("Capture your own wording")
- Bookmarks with provenance + firm chips
- Collection covers — static torn-paper (baked), not live filter

**Key data:** note body, entity refs (question/concept/firm), tags, timestamps

---

### 10.13 Progress / Analytics

**Sections:**
1. Firm readiness (Mode A) for each target
2. **Learn module progress** + concept mastery map (Mode B) with weaker topics highlighted
3. **Heat ∩ weakness matrix** (full target set)
4. Accuracy / mastery over time (calm line)
5. Study frequency calendar
6. Mock / RAG / module-quiz session history
7. Diagram checkpoint completion

**Visual opportunities:**
- Dual-encoding heat∩weakness matrix (colour = firm heat, hatch = weakness)
- Mastery map as concept graph or matrix — glow 1–3 weakest only
- Accuracy line via rough.js linearPath (fixed seed)
- Readiness score circled; numbers never bounce

**Key data:** readiness by firm, mastery by concept, heat cells + weak flags, time series, session history, diagram completion flags

---

### 10.14 Profile / Settings

Target firms, role, interview date, notifications, theme, account. Utilitarian — no dashboard charts. Firm switcher here mirrors dashboard persistence.

---

## 11. Visual Opportunity Map (Revised)

Every place a heatmap, diagram, roadmap, or AI-citation moment becomes a signature visual — with named data.

| Screen | Visual | Data | Encoding |
|--------|--------|------|----------|
| **Onboarding** | Firm preview heat strip | Aggregate topic intensity for selected firms | Heat scale bars + N caption |
| **Dashboard** | Topic-heat snapshot | Firm×topic intensity for target set | Matrix; glow 1 weakest; hatch = weakness |
| **Dashboard** | "Why this session" | heatScore + weaknessScore + due flag + explanation string | Warren `bracket` + underline on reason phrases |
| **Company room** | Dominant topic heat | Per-firm topic intensity, sample size N | Full matrix; click → scoped RAG |
| **Heat compare** | Multi-firm matrix | Aligned intensities across 2–N firms | Compare mode; shared vs unique callouts |
| **Pseudo-RAG** | Citation / why-retrieved cards | reasons[], citations[], heat/weak/sim scores | Rough borders; underline on match phrase; provenance chips |
| **Learn catalog** | Module progress cards | module progress %, domain, lesson/diagram counts | Paper cards; circled % when complete |
| **Module hub** | Module roadmap path | Ordered checkpoints (lesson/lab/drill/quiz) + completion | Rough.js path; circle current; strike done |
| **Module hub** | Firm heat strip | Module topics × target firm intensities | Mini heat bars + N caption |
| **Concept lab** | Interactive diagram | Versioned Mermaid / finance diagram defs + a11y fallback | DiagramCanvas; step-highlight; rough frame |
| **Concept lab** | Parent-module mini-path | Position of concept inside module roadmap | Rough.js mini checkpoints |
| **Question study** | Layered reveal + diagram slot | Layer payloads, diagram id, provenance labels | Sequential settle; highlight/underline/box/bracket |
| **Question study** | Resource rail | Internal/external links with publisher + why | Labelled list, not bare URLs |
| **Study plan** | Mixed Mode A/B roadmap | Assignments × modules × interview date × heat∩weakness | Timeline path; module + diagram checkpoint thumbs |
| **Simulator** | Stage path + score hero | Stage scores, overall readiness | Checkpoints; torn-paper-hero; circled score |
| **Progress** | Heat ∩ weakness matrix | Full target firm×topic + weak flags | Dual encoding; glow ≤3 cells |
| **Progress** | Mastery / accuracy over time | date → mastery or accuracy | Rough.js line; calm ease-out |
| **Progress** | Study frequency calendar | date → activity 0–4 | Heat cells; circle current week |

**AI surface moments (must stay grounded):**
- Session brief rewrite (RAG) — show citations
- Retrieval reason blurbs — cite pack item
- Follow-up questions after reveal — cite concept/pack
- Simulator feedback summary — cite turns + teaching answers
- Never: unconstrained web chat, uncited "Goldman always asks…" claims, Glassdoor prose as model answers

---

## 12. High-Risk Components — Implementation Paths

### 12.1 Warren (Coach Character)

**Risk:** Fixed-identity, emotionally expressive, sprite-like animated character that scales well on mobile and doesn't wobble between renders.

**Resolved implementation paths (ranked by feasibility):**

1. **SVG-based illustration with layer swapping (RECOMMENDED)**
   - Designed in Figma/Illustrator as layered SVG (base body + swappable expression/pose layers)
   - Export as React component with state-driven layer visibility
   - Animation via CSS transitions or `framer-motion` for pose/expression changes
   - Breathing loop: CSS keyframe animation (subtle translate + scale)
   - **Pros:** Scalable, low file size, easy to version-control
   - **Cons:** Manual animation work, no complex skeletal rigging

2. **Lottie JSON (After Effects export)**
   - Designed/animated in After Effects, exported via Bodymovin plugin
   - Rendered via `lottie-web` in React
   - State-driven playback (play specific frame ranges per emotion)
   - **Pros:** Professional animation quality, complex motion possible
   - **Cons:** Larger file size (~50-100KB per animation), less flexible for state changes

3. **Sprite sheet**
   - Traditional frame-based animation (PNG/WebP sprite sheet)
   - CSS steps() animation or canvas rendering
   - **Pros:** Simple, predictable
   - **Cons:** Large file size (even with WebP), not scalable (raster), lower quality on retina

**Phase 1 decision:** **SVG layer-swap** locked (see §6 character brief + concept sheets under `/mockups/warren/`). Runtime component: `apps/web/components/mockups/warren.tsx`. Lottie only if later motion needs exceed CSS.

**Key constraint:** Warren must **pause breathing loop during user focus states** (typing, reading). Implement via React state: `isUserFocused` → pause CSS animation.

---

### 12.2 Interviewer Cast (DiceBear Avatars)

**Risk:** Modular, seeded avatar construction for 3-5 fixed named personas.

**Resolved implementation path:**

**Library:** `@dicebear/core` + `@dicebear/styles` (npm, current version 10.3.0)

**Example integration:**
```javascript
import { createAvatar } from '@dicebear/core';
import { adventurer } from '@dicebear/styles';

const interviewerSeeds = {
  'morgan-vp-gs': 'morgan-vp-gs',
  'alex-pe-kkr': 'alex-pe-kkr',
  'jordan-analyst-jpm': 'jordan-analyst-jpm',
  'taylor-associate-blackstone': 'taylor-associate-blackstone',
  'casey-md-evercore': 'casey-md-evercore',
};

function InterviewerAvatar({ interviewerId }) {
  const seed = interviewerSeeds[interviewerId];
  const avatar = createAvatar(adventurer, {
    seed,
    size: 128,
    backgroundColor: ['#f3f4f6'], // warm paper
  });

  return (
    <div dangerouslySetInnerHTML={{ __html: avatar.toString() }} />
  );
}
```

**Style recommendation:** `adventurer`, `lorelei`, or `notionists` (professional, not cartoonish)

**Behavioral states:** "Listening" / "Speaking" / "Evaluating"
- Implement as **CSS class toggles** (e.g. add slight scale or opacity shift)
- OR swap to different DiceBear options (e.g. change `mouth` option between states if style supports it)
- Keep it **subtle** — interviewers are professional personas, not animated sidekicks

**Binding constraint:** **Fixed seeds per interviewer.** Never randomize seed per session. Same interviewer = same face every time.

---

### 12.3 Hand-Drawn / Paper Aesthetic (rough.js + rough-notation + SVG filters)

**Risk:** Stable rendering without visual wobble, performance on mobile, torn-paper edge cost.

**Resolved implementation paths:**

#### rough.js (Core Rendering)

**Library:** `roughjs` (npm, 9kB gzipped)

**Critical rule:** **Every rough.js call uses a fixed seed + memoization.**

**React pattern:**
```javascript
import { useMemo, useRef, useEffect } from 'react';
import rough from 'roughjs';

function RoughCard({ children }) {
  const svgRef = useRef(null);

  const roughNode = useMemo(() => {
    if (!svgRef.current) return null;
    const rc = rough.svg(svgRef.current);
    return rc.rectangle(0, 0, 300, 200, {
      fill: 'var(--card)',
      fillStyle: 'hachure',
      roughness: 1.2,
      bowing: 1,
      seed: 42, // FIXED SEED
    });
  }, []);

  useEffect(() => {
    if (roughNode && svgRef.current) {
      svgRef.current.appendChild(roughNode);
    }
  }, [roughNode]);

  return (
    <div className="relative">
      <svg ref={svgRef} className="absolute inset-0 pointer-events-none" />
      <div className="relative z-10 p-6">{children}</div>
    </div>
  );
}
```

**Performance:** Memoization prevents re-render wobble. Test on mobile (target: <16ms render time per card).

#### rough-notation (Annotation System)

**Library:** `rough-notation` (npm, 3.8kB gzipped)

**React pattern:**
```javascript
import { useEffect, useRef } from 'react';
import { annotate } from 'rough-notation';

function AnnotatedScore({ score }) {
  const ref = useRef(null);

  useEffect(() => {
    const annotation = annotate(ref.current, {
      type: 'circle',
      color: 'var(--lime)',
      strokeWidth: 2,
      padding: 12,
      animationDuration: 600,
      animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });

    annotation.show();
    return () => annotation.hide();
  }, [score]);

  return <span ref={ref} className="font-display text-6xl">{score}%</span>;
}
```

**Binding constraint:** Enforce semantic map (see §7). Code review must check that `circle` = results/numbers, `underline` = key phrases, etc.

#### SVG Filters (Torn-Paper Edges)

**Implementation:** Define filters once in root layout, reference via CSS.

**File:** `apps/web/app/layout.tsx` or `packages/ui/src/components/svg-filters.tsx`

```tsx
export function SvgFilters() {
  return (
    <svg className="absolute w-0 h-0" aria-hidden="true">
      <defs>
        <filter id="torn-paper-static" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" seed="1" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        <filter id="torn-paper-hero" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="noise">
            <animate attributeName="baseFrequency" values="0.05;0.052;0.05" dur="10s" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="15" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
```

**CSS usage:**
```css
.drill-card {
  filter: url(#torn-paper-static);
}

.score-reveal-hero {
  filter: url(#torn-paper-hero);
}
```

**Binding constraint:** Use `torn-paper-static` (no animation) for all list items and repeated cards. Reserve `torn-paper-hero` (animated turbulence) for 1-2 hero moments max. Test on low-end Android before expanding use.

---

### 12.4 Handwriting Text Streaming (Vivus.js)

**Risk:** Converting text to SVG paths, animating stroke-dashoffset, ensuring it's worth the cost.

**Resolved implementation path:**

1. **Convert handwriting typeface text to SVG paths:**
   - Use Figma/Illustrator "Create Outlines" or online converter (e.g. `font-to-svg`)
   - Ensure paths have `stroke` and `fill: none`
   - Export as SVG, embed inline in React component

2. **Animate with Vivus.js:**
```javascript
import { useEffect, useRef } from 'react';
import Vivus from 'vivus';

function HandwrittenHeadline({ text }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      // Show final state instantly
      svgRef.current.querySelectorAll('path').forEach((path) => {
        path.style.strokeDasharray = 'none';
      });
    } else {
      new Vivus(svgRef.current, {
        type: 'oneByOne',
        duration: 120,
        animTimingFunction: Vivus.EASE_OUT,
      });
    }
  }, [text]);

  return <svg ref={svgRef}>{/* SVG paths here */}</svg>;
}
```

**Binding constraint:** Use **only for rare, ceremonial phrases** (3-8 words max):
- Warren's key one-liners ("Great work!")
- Milestone headlines ("10-day streak!")
- Final score reveal ("You scored 87%!")

**Never use for:** Routine feedback, body text, labels, UI controls. Too expensive, dilutes impact.

**Fallback for routine feedback:** Simple fade/slide-up + rough-notation underline.

---

### 12.5 Heatmaps & Data Visualizations

**Risk:** Custom hand-drawn heatmaps and charts that are performant on mobile and accessible.

**Resolved implementation paths:**

#### Topic Heatmap (Existing Component)

**File:** `packages/ui/src/components/topic-heatmap.tsx` (already exists)

**Current implementation:** HTML table with Tailwind classes, heat scale backgrounds (`--heat-0` to `--heat-4`)

**Enhancement plan for Phase 2:**
1. Add rough.js border to each cell (memoized, fixed seed per cell)
2. Add optional glow to weakest 1-3 cells (CSS `box-shadow`, triggered via data prop)
3. Add diagonal hatch pattern for weak topics (CSS `background-image` or rough.js overlay)

**Example:**
```tsx
function TopicHeatmapCell({ cell, isWeakest }) {
  const svgRef = useRef(null);

  const roughBorder = useMemo(() => {
    if (!svgRef.current) return null;
    const rc = rough.svg(svgRef.current);
    return rc.rectangle(0, 0, cellWidth, cellHeight, {
      stroke: 'var(--border)',
      roughness: 1.2,
      seed: hashCode(cell.firmId + cell.topicId), // deterministic seed
    });
  }, [cell]);

  return (
    <td className={cn('relative', isWeakest && 'shadow-lg shadow-weak/50')}>
      <svg ref={svgRef} className="absolute inset-0 pointer-events-none" />
      <div className={cn('relative z-10', heatClassName[cell.intensity])}>
        {cell.intensity}
      </div>
      {cell.weak && <div className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,var(--weak)/35%_3px,var(--weak)/35%_6px)]" />}
    </td>
  );
}
```

**Binding constraint:** Glow on **1-3 weakest cells only**, not always-on across full grid (performance).

#### Line Chart (Accuracy Over Time)

**Library:** `rough.js` for hand-drawn line, or `visx` + rough.js hybrid

**Pattern:**
```javascript
import rough from 'roughjs';

function AccuracyChart({ data }) {
  const svgRef = useRef(null);

  const roughLine = useMemo(() => {
    const points = data.map((d, i) => [i * 50, 200 - d.accuracy * 2]);
    const rc = rough.svg(svgRef.current);
    return rc.linearPath(points, {
      stroke: 'var(--lime)',
      strokeWidth: 2,
      roughness: 0.8,
      seed: 100,
    });
  }, [data]);

  return (
    <svg ref={svgRef} width={data.length * 50} height={200}>
      {/* Axes, data points, etc. */}
    </svg>
  );
}
```

**Alternative:** Use `visx` for axis/scale logic, overlay rough.js line on top of clean SVG structure.

**Binding constraint:** Fixed seed, memoized. No animation on line draw (instant appearance or single draw-on at page load, not per data point).

#### Calendar Heatmap (Study Frequency)

**Pattern:** 52-week grid (365 cells), each cell as rough.js rectangle with heat-scale fill

**Library:** rough.js or hybrid (HTML grid + rough.js borders)

**Performance consideration:** 365 rough.js rectangles = potentially expensive. Test on mobile. Fallback: HTML grid with CSS borders, apply rough.js only to hovered/focused cell.

---

## 13. Guardrails — Binding Constraints (Summary)

These are **not suggestions** — they are **hard rules** that every implementation, mockup, and PR must satisfy.

1. **Pastel hue is never the sole signal.** Every color-coded state pairs with icon, shape, or pattern (accessibility).

2. **Numbers never bounce.** All numeric and financial data updates use calm linear/ease-out, never bouncy spring (trust through precision).

3. **Every rough.js element uses a fixed seed + memoization** so re-renders don't cause visible wobble (stability).

4. **rough-notation semantic map is enforced.** Circle = results/numbers, underline = key phrases, highlight = correct parts of user's answer, strike-through = wrong/completed, box = self-contained unit, bracket = Warren's aside. Code review must check.

5. **Torn-paper filters: static for lists, hero for 1-2 moments max.** Recalculating live filter across scrolling list = mobile performance risk.

6. **Handwriting text streaming (Vivus.js) = rare ceremonial phrases only** (3-8 words). Never routine feedback, body text, or UI labels.

7. **Warren pauses breathing loop during user focus states** (typing, reading). Never competes for attention during concentration.

8. **Reactions are state-confirmed, never optimistic.** Celebrations fire only after result is confirmed (answer scored), not on tap/submit.

9. **Heatmap glow: 1-3 cells max, not always-on across full grid** (performance).

10. **`prefers-reduced-motion` is a hard requirement.** Draw-on, bounce, and paper-texture animations collapse to instant final-state appearance.

11. **Interviewer cast uses fixed seeds.** Same interviewer = same face every time (deterministic).

12. **Warren idle animation resumes at transitions and reward moments**, not during user interaction.

13. **Glassdoor never supplies answer text.** Heat/occurrence signals only. Teaching answers come from GitHub corpus + validated enrichment.

14. **AI outputs must cite corpus/pack items.** No unconstrained web chat; no uncited firm claims; never attribute Gemini to Glassdoor or to a GitHub path that did not contain the text.

15. **Mode A empty firm set is blocked.** Do not silently default to “all firms.”

16. **Diagrams are first-class teaching media.** Concept labs and layered reveals embed interactive JS diagrams (with a11y/table fallback) — not PNG screenshots as the primary experience.

17. **Study plan mixes Mode A + Mode B** with interview-date urgency, **Learn module checkpoints**, and diagram checkpoints — not a generic drill checklist.

18. **Learning modules are first-class.** Mode B is not orphaned concept pages alone — catalog → module hub (lessons → concept labs → drills → quiz) with firm-heat bridges.

---

## 14. Testing & Validation Checklist (Phase 2+)

Before any implementation is considered complete:

- [ ] **Accessibility audit:** All color-coded states pass WCAG AA without color alone (icon/shape/pattern redundancy)
- [ ] **Mobile performance:** rough.js cards render <16ms, scrolling lists maintain 60fps (test on low-end Android)
- [ ] **Wobble test:** Refresh page 10 times — rough.js elements never shift position or line texture (fixed seeds verified)
- [ ] **Reduced motion:** All animations collapse to instant final state when `prefers-reduced-motion: reduce` is enabled
- [ ] **Semantic map audit:** All rough-notation annotations match DESIGN.md semantic map (code review)
- [ ] **Number calm:** No numeric animations use bouncy spring — all use ease-out or linear (code review)
- [ ] **Warren focus pause:** Warren breathing loop pauses when user interacts with text input, resumes on blur (behavioral test)
- [ ] **Filter performance:** Torn-paper filters tested on low-end Android — hero filter limited to 1-2 moments (performance test)

---

## 15. Next Steps — Phase 1 Approval Gate

**DO NOT PROCEED PAST THIS GATE WITHOUT APPROVAL.**

Once this DESIGN.md is approved:

**Phase 1 — Full-Journey Mockups** (not isolated component demos):
1. **Mode A company journey** — company room heat → multi-firm compare → pseudo-RAG pack (citations + why-retrieved) → layered question study with diagram peek + AI follow-up chips
2. **Mode B Learn journey** — module catalog → module hub roadmap → lesson → concept lab diagram → module drill/quiz → “Apply at [Firm]” bridge into Mode A
3. **Plan → simulator journey** — interview-date study plan (company + **module** + diagram checkpoints) → firm-templated mock → score reveal + annotated feedback → recommended modules/labs

Each journey must show hard parts in real context: topic heat dual-encoding, Learn module roadmap, rough.js/notation semantic map, DiagramCanvas, citation/provenance chips, Warren focus-pause, DiceBear interviewer in sim, torn-paper hero only on score reveal.

Present each journey. Explain technique used for each hard part. **STOP. Wait for approval before Phase 2 build.**

---

**END OF DESIGN.md — PHASE 0**
