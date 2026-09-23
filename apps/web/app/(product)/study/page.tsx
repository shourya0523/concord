import { isFlagOn } from "@/lib/flags"

import { StudyClient } from "./study-client"

/**
 * Study — layered reveal. Server wrapper so feature flags (read from env on the
 * server) reach the client island as props.
 */
export default function StudyPage() {
  return <StudyClient voiceEnabled={isFlagOn("voice_answers")} />
}
