/**
 * Tier 1c real-speech collection (dev only, `VITE_COLLECT=true` — never in a normal build, never in
 * the nav). Plan: docs/TIER1C_DATA_PLAN.md; how to run a session: docs/TIER1C_COLLECT.md.
 *
 * Outside RequireAuth on purpose: a recording session runs against a local backend with
 * REQUIRE_AUTH=false, and six speakers should not each have to sign in to hold down a key.
 */

import React, { useState } from 'react';
import CollectSession from '@/app/collect/CollectSession';
import CollectSetup from '@/app/collect/CollectSetup';
import type { SessionRecord } from '@/lib/collectStore';

export default function CollectPage() {
  const [session, setSession] = useState<SessionRecord | null>(null);

  if (!session) return <CollectSetup onStart={setSession} onResume={setSession} />;
  return <CollectSession session={session} onExit={() => setSession(null)} />;
}
