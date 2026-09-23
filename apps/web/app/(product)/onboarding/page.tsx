import { OnboardingForm } from "@/components/onboarding-form"
import { isFlagOn } from "@/lib/flags"

export const metadata = {
  title: "Onboarding · Concord",
  description: "Choose your path, target firms, role, and interview date",
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const step = typeof params.step === "string" ? params.step : undefined
  return <OnboardingForm dailySet={isFlagOn("daily_set")} initialStep={step} />
}
