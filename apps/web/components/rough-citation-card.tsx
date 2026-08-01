"use client"

import * as React from "react"

import {
  PseudoRagCitationCard,
  type PseudoRagCitationCardProps,
} from "@ibpe/ui/components/pseudo-rag-citation-card"

import { RoughFrame } from "@/components/mockups/rough-frame"

/**
 * Teaching citation card with rough.js border (DESIGN.md §10.5 visual).
 * Provenance stays CSS chips; the frame is the paper moment.
 */
export function RoughCitationCard(props: PseudoRagCitationCardProps & { seedKey: string }) {
  const { seedKey, className, ...card } = props
  return (
    <RoughFrame
      seedKey={seedKey}
      padding={8}
      contentClassName="!p-0"
      className={className}
    >
      <PseudoRagCitationCard {...card} className="border-0 bg-transparent" />
    </RoughFrame>
  )
}
