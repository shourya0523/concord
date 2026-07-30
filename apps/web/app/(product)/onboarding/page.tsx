import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { OnboardingForm } from "@/components/onboarding-form"

export const metadata = {
  title: "Onboarding · IBPE",
  description: "Choose Mode A/B, target companies, role, and interview date",
}

export default function OnboardingPage() {
  return (
    <div className="space-y-8">
      <EditorialHeading eyebrow="Setup" as="h1">
        Orient the terminal
      </EditorialHeading>
      <p className="max-w-xl text-[15px] text-muted-foreground">
        Company prep weights Glassdoor topic heat as directional firm signals. Concept lab
        builds mastery from the teaching corpus. You can run both.
      </p>
      <OnboardingForm />
    </div>
  )
}
