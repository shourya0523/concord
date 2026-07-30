"use client";

/**
 * Browser auth client for Neon Auth.
 * Safe to import when env is missing — createAuthClient talks to /api/auth/*
 * which stubs with 503 until NEON_AUTH_* is set.
 */
import { createAuthClient } from "@neondatabase/auth/next";

export const authClient: ReturnType<typeof createAuthClient> = createAuthClient();
