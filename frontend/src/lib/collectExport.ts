/**
 * Session export for the dev-only Collect page (Tier 1c).
 *
 * Two artefacts, on purpose:
 *  - a ZIP (`audio/<clip_id>.webm` + `labels.jsonl`) that goes to the private Drive folder;
 *  - the bare JSONL, which is the only half allowed in git (`ml/data/real_speech_*.jsonl`).
 * The audio is kept so every STT provider can be re-run later without re-recording anyone
 * (docs/TIER1C_DATA_PLAN.md §1).
 */

import type { ClipRecord } from './collectStore';
import { createZip, type ZipEntry } from './zip';

const EXT: Record<string, string> = { 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' };

export function audioExt(mime: string): string {
  const base = (mime || '').split(';')[0].trim();
  return EXT[base] || 'webm';
}

export function audioPath(clip: ClipRecord): string {
  return `audio/${clip.clip_id}.${audioExt(clip.audio_type)}`;
}

/** One JSONL row — the label schema of data plan §3, with a slot per STT provider. */
export function labelRow(clip: ClipRecord): Record<string, unknown> {
  return {
    clip_id: clip.clip_id,
    session_id: clip.session_id,
    speaker_id: clip.speaker_id,
    recorded_at: clip.recorded_at,
    scenario_id: clip.scenario_id,
    scenario: clip.scenario,
    intended_intent: clip.intended_intent,
    // the intent as recorded; an auditor overwrites this after listening (data plan §3)
    final_label: clip.intended_intent,
    labeler: '',
    lang_style: clip.lang_style,
    mic: clip.mic,
    noise: clip.noise,
    lecture_playing: clip.lecture_playing,
    audio_file: audioPath(clip),
    audio_type: clip.audio_type,
    duration_ms: Math.round(clip.duration_ms),
    browser_text: clip.browser_text,
    groq_text: clip.stt_provider === 'groq' ? clip.stt_text : '',
    sarvam_text: clip.stt_provider === 'sarvam' ? clip.stt_text : '',
    stt_provider: clip.stt_provider,
    stt_ms: clip.stt_ms,
    stt_status: clip.stt_status,
    notes: clip.notes,
  };
}

export function buildJsonl(clips: ClipRecord[]): string {
  return clips.map((c) => JSON.stringify(labelRow(c))).join('\n') + (clips.length ? '\n' : '');
}

export async function buildZip(clips: ClipRecord[]): Promise<Blob> {
  const entries: ZipEntry[] = [];
  for (const clip of clips) {
    entries.push({ name: audioPath(clip), data: new Uint8Array(await clip.audio.arrayBuffer()) });
  }
  entries.push({ name: 'labels.jsonl', data: new TextEncoder().encode(buildJsonl(clips)) });
  return createZip(entries);
}

export function slug(s: string): string {
  return (s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'speaker').toLowerCase();
}

/** `real_speech_<speaker>_<yyyymmdd>` — the naming `ml/data/real_speech_*.jsonl` expects. */
export function exportBasename(speakerId: string, startedAt: string): string {
  return `real_speech_${slug(speakerId)}_${startedAt.slice(0, 10).replace(/-/g, '')}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
