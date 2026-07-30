import { createHash } from "node:crypto";

export function sha1Hex(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex");
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

export function firmIdFromName(name: string): string {
  return `firm_${slugify(name)}`;
}

export function roleIdFromName(name: string): string {
  return `role_${slugify(name)}`;
}

export function wordingHash(text: string): string {
  const normalised = text.trim().toLowerCase().replace(/\s+/g, " ");
  return sha1Hex(normalised);
}

export function parseOptionalDate(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseOptionalTimestamptz(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
