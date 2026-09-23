import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  normalizePracticeMode,
  PracticeSessionModeValues,
} from "@ibpe/contracts"
import { practiceModeToDb } from "./practice"

// Allowed by the study_sessions_mode_check constraint on app.study_sessions.mode.
const DB_ALLOWED_MODES = [
  "company_prep",
  "concept_learn",
  "company",
  "concept",
  "adaptive_weak",
  "pseudo_rag",
  "simulator",
]

describe("practiceModeToDb", () => {
  it("maps rag to the legacy pseudo_rag DB value", () => {
    assert.equal(practiceModeToDb("rag"), "pseudo_rag")
  })

  it("passes other modes through unchanged", () => {
    assert.equal(practiceModeToDb("company"), "company")
    assert.equal(practiceModeToDb("concept"), "concept")
    assert.equal(practiceModeToDb("adaptive_weak"), "adaptive_weak")
    assert.equal(practiceModeToDb("simulator"), "simulator")
  })

  it("only writes values the DB CHECK constraint allows and round-trips on read", () => {
    for (const mode of PracticeSessionModeValues) {
      const dbMode = practiceModeToDb(mode)
      assert.ok(DB_ALLOWED_MODES.includes(dbMode), `${mode} -> ${dbMode}`)
      assert.equal(normalizePracticeMode(dbMode), mode)
    }
  })
})
