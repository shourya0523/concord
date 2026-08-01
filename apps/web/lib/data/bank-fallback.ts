/**
 * Local question_bank.json fallback when DATABASE_URL is unset.
 * Firm signals only — not teaching answers (ADR 0002 / 0006).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BankQuestionSchema,
  QuestionBankFileSchema,
  type BankQuestion,
  type CanonicalQuestion,
} from "@ibpe/contracts";

let cache: { mtimeMs: number; questions: BankQuestion[] } | null = null;

function bankPath(): string {
  return (
    process.env.QUESTION_BANK_PATH?.trim() ||
    path.resolve(process.cwd(), "../../data/question_bank.json")
  );
}

export async function loadBankQuestions(): Promise<BankQuestion[]> {
  const file = bankPath();
  try {
    const { stat } = await import("node:fs/promises");
    const st = await stat(file);
    if (cache && cache.mtimeMs === st.mtimeMs) return cache.questions;
    const raw = JSON.parse(await readFile(file, "utf8"));
    const parsed = QuestionBankFileSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn("[bank-fallback] invalid bank file", parsed.error.flatten());
      return [];
    }
    const questions = parsed.data.questions
      .map((q) => BankQuestionSchema.safeParse(q))
      .filter((r) => r.success)
      .map((r) => r.data);
    cache = { mtimeMs: st.mtimeMs, questions };
    return questions;
  } catch (err) {
    console.warn("[bank-fallback] could not load bank", err);
    return [];
  }
}

/** Map a Glassdoor bank row to CanonicalQuestion shape for list/detail stubs. */
export function bankRowToCanonical(q: BankQuestion): CanonicalQuestion {
  return {
    id: q.id,
    canonical_wording: q.question,
    question_type: "technical",
    topic: null,
    subtopic: null,
    domain: q.track === "PE" ? "pe" : q.track === "IB" ? "ib" : "other",
    pe_strategy: null,
    pe_relevance: null,
    seniority: null,
    difficulty: null,
    review_state: "bank_signal",
    normalised_hash: null,
  };
}

export async function listBankAsCanonical(options: {
  q?: string;
  track?: string;
  topic?: string;
  limit: number;
  offset: number;
}): Promise<{ items: CanonicalQuestion[]; total: number }> {
  const all = await loadBankQuestions();
  const needle = options.q?.trim().toLowerCase();
  const track = options.track?.trim().toUpperCase();
  const filtered = all.filter((row) => {
    if (options.topic) return false;
    if (track && String(row.track).toUpperCase() !== track) return false;
    if (!needle) return true;
    return (
      row.question.toLowerCase().includes(needle) ||
      row.company.toLowerCase().includes(needle) ||
      row.position.toLowerCase().includes(needle)
    );
  });
  const slice = filtered.slice(options.offset, options.offset + options.limit);
  return {
    items: slice.map(bankRowToCanonical),
    total: filtered.length,
  };
}

export async function getBankQuestion(
  id: string,
): Promise<{ question: CanonicalQuestion; bank: BankQuestion } | null> {
  const all = await loadBankQuestions();
  const row = all.find((q) => q.id === id);
  if (!row) return null;
  return { question: bankRowToCanonical(row), bank: row };
}
