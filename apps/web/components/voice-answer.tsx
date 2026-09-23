"use client"

/**
 * Voice answers (plan 2026-09-23-001 P7.1, behind the `voice_answers` flag).
 * Records with MediaRecorder (webm/opus where supported), max 3 minutes, shows
 * a timer + input level, uploads to POST /api/transcribe and hands back the
 * transcript plus a client-side delivery score. The transcript lands in the
 * caller's (editable) answer box; nothing is graded here.
 */
import * as React from "react"

import type { DeliveryScore } from "@ibpe/contracts"
import { cn } from "@ibpe/ui/lib/utils"

import { computeDelivery } from "@/lib/voice/delivery"

const MAX_MS = 3 * 60 * 1000
const MAX_BYTES = 5 * 1024 * 1024
const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]

type Phase = "idle" | "requesting" | "recording" | "uploading" | "done" | "error"

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined
  }
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

async function errorMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string }
  } | null
  if (response.status === 501) {
    return payload?.error?.message ?? "Voice transcription isn't configured here — type your answer instead."
  }
  if (response.status === 401) return "Sign in to use voice answers."
  if (response.status === 413) return "That recording is too large (5 MB max)."
  return payload?.error?.message ?? `Transcription failed (HTTP ${response.status}) — type your answer instead.`
}

export function VoiceAnswer({
  onTranscript,
  disabled = false,
  className,
  maxMs = MAX_MS,
}: {
  onTranscript: (transcript: string, delivery: DeliveryScore) => void
  disabled?: boolean
  className?: string
  maxMs?: number
}) {
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const [level, setLevel] = React.useState(0)
  const [message, setMessage] = React.useState<string | null>(null)
  const [supported, setSupported] = React.useState(true)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const startedAtRef = React.useRef(0)
  const tickRef = React.useRef<number | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const cancelledRef = React.useRef(false)

  React.useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia)
    window.queueMicrotask(() => setSupported(ok))
  }, [])

  const cleanup = React.useCallback(() => {
    if (tickRef.current != null) window.clearInterval(tickRef.current)
    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    tickRef.current = null
    rafRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    void audioCtxRef.current?.close().catch(() => undefined)
    audioCtxRef.current = null
    setLevel(0)
  }, [])

  React.useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
      cleanup()
    }
  }, [cleanup])

  const upload = React.useCallback(
    async (blob: Blob, durationMs: number) => {
      if (blob.size === 0) {
        setPhase("error")
        setMessage("Nothing was recorded — check your microphone and try again.")
        return
      }
      if (blob.size > MAX_BYTES) {
        setPhase("error")
        setMessage("That recording is too large (5 MB max) — try a shorter answer.")
        return
      }
      setPhase("uploading")
      setMessage("Transcribing your answer…")
      try {
        const form = new FormData()
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"
        form.append("audio", blob, `answer.${ext}`)
        const response = await fetch("/api/transcribe", { method: "POST", body: form })
        if (!response.ok) {
          setPhase("error")
          setMessage(await errorMessage(response))
          return
        }
        const payload = (await response.json()) as { transcript?: string }
        const transcript = (payload.transcript ?? "").trim()
        const delivery = computeDelivery({ durationMs, transcript })
        if (!transcript) {
          setPhase("error")
          setMessage("No speech was detected — try again or type your answer.")
          return
        }
        onTranscript(transcript, delivery)
        setPhase("done")
        setMessage(
          `Transcript added to your answer (${clock(durationMs)}) — edit it before you submit.`,
        )
      } catch {
        setPhase("error")
        setMessage("Transcription request failed — type your answer instead.")
      }
    },
    [onTranscript],
  )

  const stop = React.useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state === "recording") recorder.stop()
  }, [])

  const start = React.useCallback(async () => {
    if (disabled || phase === "recording" || phase === "requesting" || phase === "uploading") return
    setMessage(null)
    setPhase("requesting")
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setPhase("error")
      setMessage("Microphone access was blocked — allow it in the browser, or type your answer.")
      return
    }
    streamRef.current = stream
    const mimeType = pickMimeType()
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined)
    } catch {
      cleanup()
      setPhase("error")
      setMessage("This browser can't record audio — type your answer instead.")
      return
    }
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const durationMs = Math.min(maxMs, Date.now() - startedAtRef.current)
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
      cleanup()
      if (!cancelledRef.current) void upload(blob, durationMs)
    }

    // Input level meter (RMS of the analyser's time-domain signal).
    try {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        audioCtxRef.current = ctx
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        const draw = () => {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (const value of data) {
            const centred = (value - 128) / 128
            sum += centred * centred
          }
          setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3))
          rafRef.current = window.requestAnimationFrame(draw)
        }
        draw()
      }
    } catch {
      // Level meter is decorative — recording continues without it.
    }

    startedAtRef.current = Date.now()
    setElapsedMs(0)
    recorder.start(1000)
    setPhase("recording")
    tickRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current
      setElapsedMs(elapsed)
      if (elapsed >= maxMs) stop()
    }, 250)
  }, [cleanup, disabled, maxMs, phase, stop, upload])

  if (!supported) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        Voice answers need a browser with microphone recording — type your answer instead.
      </p>
    )
  }

  const recording = phase === "recording"
  const busy = phase === "requesting" || phase === "uploading"

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <button
        type="button"
        aria-pressed={recording}
        disabled={disabled || busy}
        onClick={() => (recording ? stop() : void start())}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
          recording ? "border-error-foreground bg-error/40 text-foreground" : "border-border hover:border-ink",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full",
            recording ? "bg-error-foreground motion-safe:animate-pulse" : "bg-ink",
          )}
        />
        {recording ? "Stop recording" : phase === "uploading" ? "Transcribing…" : "Answer by voice"}
      </button>
      {recording ? (
        <>
          <span className="font-mono text-sm tabular-nums" aria-label="Recording time">
            {clock(elapsedMs)} / {clock(maxMs)}
          </span>
          <span
            aria-hidden
            className="relative h-2 w-24 overflow-hidden rounded-full bg-secondary"
            title="Input level"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-success-foreground transition-[width] duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground">Aim for 60–90 seconds.</span>
        </>
      ) : null}
      <span
        className={cn(
          "text-xs",
          phase === "error" ? "text-error-foreground" : "text-muted-foreground",
        )}
        aria-live="polite"
        role={phase === "error" ? "alert" : undefined}
      >
        {message ?? (phase === "idle" ? "Speak your answer; the transcript fills the box." : "")}
      </span>
    </div>
  )
}
