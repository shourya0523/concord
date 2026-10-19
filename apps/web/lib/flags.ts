/**
 * Server-side feature flags (env overrides via FLAG_*). Import only from
 * server code; client islands receive flag values as props.
 */
import { loadFeatureFlags, type FeatureFlags } from "@ibpe/config/flags"

export function featureFlags(): FeatureFlags {
  return loadFeatureFlags()
}

export function isFlagOn(flag: keyof FeatureFlags): boolean {
  return featureFlags()[flag]
}
