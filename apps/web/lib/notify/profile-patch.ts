/**
 * Server-side partial update of the prep profile (unsubscribe link, league
 * opt-in). `putPrepProfile` replaces the whole `profile` object, so this reads
 * first and refuses to write when the read failed — otherwise a transient
 * read error would overwrite the stored profile with defaults.
 */
import { isDatabaseConfigured } from "@/lib/db/client"
import { getPrepProfile, putPrepProfile, type PrepProfile } from "@/lib/data/profile"

export class ProfileUnavailableError extends Error {
  readonly status = 503
  constructor(message: string) {
    super(message)
    this.name = "ProfileUnavailableError"
  }
}

export async function patchPrepProfile(options: {
  userId: string
  email?: string | null
  patch: Partial<Omit<PrepProfile, "updated_at">>
}): Promise<PrepProfile> {
  const current = await getPrepProfile(options.userId)
  const dbOn = isDatabaseConfigured()
  if (dbOn && current.source === "empty" && /fail/i.test(current.note ?? "")) {
    throw new ProfileUnavailableError("Profile could not be read; not overwriting it.")
  }
  const { updated_at: _updatedAt, ...rest } = current.profile
  void _updatedAt
  const changed = (Object.keys(options.patch) as Array<keyof typeof options.patch>).some(
    (key) => rest[key] !== options.patch[key],
  )
  if (!changed) return current.profile
  const result = await putPrepProfile({
    userId: options.userId,
    email: options.email,
    input: { ...rest, ...options.patch },
  })
  if (dbOn && result.source !== "published") {
    throw new ProfileUnavailableError("Profile could not be saved.")
  }
  return result.profile
}
