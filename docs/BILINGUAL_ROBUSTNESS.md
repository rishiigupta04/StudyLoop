# Bilingual voice robustness pass (28 Sep 2026)

Three changes so that speaking Hindi or Hinglish gets the same result as speaking English. Found by
probing the live path end to end — real speech (Sarvam TTS) → both STT providers → `normalize()` →
classifier → live retrieval on the ingested 6.006 lecture — rather than from the test suite.

**What was already sound, and is untouched:** pure Devanagari, code-mixed and romanized Hinglish all
round-trip correctly through both STT providers; `normalize()` folds both scripts; the regex classifier
returned the right intent at 0.95 on every probe (REPLAY, SEMANTIC_SEEK, VOLUME, TAKE_NOTE); Sarvam
Bulbul speaks Hindi and code-mixed text fine. The fast path, the classifier, the slot parser and every
template string are unchanged.

## 1. Technical terms spoken in Hindi killed the lexical half of retrieval

STT writes a spoken English term in Devanagari ("बाइनरी सर्च") and `normalize()` romanizes it
phonetically ("baainri sarch") — a word no English transcript contains, so BM25 scored a flat **0.00**
and ranking fell to the embedding alone, landing in the 0.50–0.58 grey zone. Right only by luck.

`app/services/term_repair.py` folds a word to its **consonant skeleton** (phonetic romanization mangles
vowels but keeps consonants: "baainri" and "binary" are both `bnr`) and looks it up in the vocabulary of
*this video's own transcript* — the only evidence that a term is real. Nothing is invented: a word is
only rewritten to something the lecture actually says, and only when the skeleton has ≥3 consonants and
there is exactly one candidate (or one that dominates the runner-up 3:1 by document frequency).

`retrieval.Retriever.rank` **adds** the repaired variant as an extra query rather than substituting it,
so the original still reaches the cross-lingual embedder and a bad repair can only contribute an extra
ranking, never remove signal. The map is built once per video and cached on `VideoIndex`.

Measured on `HtSuA80QTyo`, with the new seek gate applied:

| query | before | after |
|---|---|---|
| EN "binary search" | sim 0.564 lex 5.94 → seek 42:55 | **identical** |
| EN "divide and conquer" | sim 0.586 lex 5.62 → seek 27:41 | **identical** |
| EN off-topic ("quantum field theory") | sim 0.385 → decline | **identical** |
| HI "बाइनरी सर्च" | sim 0.525 lex **0.00** → decline | sim 0.568 lex 3.80 → seek 24:38 |
| HI "एल्गोरिदम" | sim 0.579 lex **0.00** → decline | sim 0.607 lex 0.86 → seek 27:41 |
| HI "कॉम्प्लेक्सिटी" | sim 0.539 lex **0.00** → decline | sim 0.599 lex 1.47 → seek 01:31 |

English is bit-for-bit unchanged; all three Hindi topics go from no lexical corroboration at all to a
confident, corroborated seek.

## 2. Seek no longer jumps on an uncorroborated grey-zone match

`SEEK_MIN_SIM` is 0.5, but the calibration note in `graph.py` says relevant chunks score 0.58–0.65 and
an off-topic query tops out at 0.45 — so 0.50–0.58 with **zero word overlap** is a coin flip.
`seek_resolver` now needs `best.lex > 0` **or** `best.sim >= SEEK_STRONG_SIM` (0.58), otherwise it
returns the existing bilingual `TOPIC_NOT_FOUND` template. Honest miss over confident guess.

The two changes are complementary: repair supplies the corroboration, the gate insists on it.

## 3. Sarvam Saaras had never once run

Sarvam's `/speech-to-text` rejects `audio/webm;codecs=opus` (*"Only ['audio/mpeg', 'audio/mp3', …,
'audio/wav', …]"*), which is what MediaRecorder produces — so `/api/stt` silently fell through to the
Groq fallback on **every turn since D14 shipped**, in the app and in the Collect page, and
`sarvam_text` could never be collected. The provider-order design in the `speech.py` docstring had
never actually taken effect.

`frontend/src/lib/wav.ts` converts to 16 kHz mono WAV (Web Audio decodes Opus natively — no dependency,
no server transcode) inside `speechService.transcribeAudio`; if a browser can't decode, the original
blob is posted and Groq takes it. Recorded clips are still **stored** as Opus.

Two follow-ons in `app/services/speech.py`: the upload filename now tracks the content type (providers
sniff both), and the "nothing was said" floor is codec-aware — 800 bytes is ~200 ms of Opus but only
~25 ms of PCM, so WAV needed its own threshold or a stray keypress would still buy an STT call.

### Switching provider: the Sarvam | Groq switch

Once Sarvam runs, every push-to-talk turn spends Sarvam credit, so the study page's top bar has a
**Sarvam | Groq** switch (`md` screens and up). `speechService` sends it as `prefer` on every
`/api/stt` call, so a flip applies to the very next turn with no redeploy. The chosen provider goes
first and the other stays behind it as the fallback, so an outage still gets a transcript.
`STT_PROVIDERS` on the server stays the kill switch: a provider missing from it (or without a key)
can't be reached from the switch. It is stored per browser (`studyloop.stt`, default Sarvam), and the
Collect page follows it. Spoken answers (TTS) still use Sarvam Bulbul either way.

## Verified

- 1149 backend tests (30 new in `test_term_repair.py`, 4 in `test_rag.py`), ruff, ruff format, tsc,
  scratch vite build. The two behavioural tests were confirmed to **fail** with the repair disabled.
- Live retrieval probe: the table above.
- WAV: a genuine MediaRecorder Opus clip (4,707 B) converts to a well-formed 38,444 B WAV — RIFF/WAVE,
  PCM, mono, 16 000 Hz, 16-bit, declared length matching actual.
- `POST /api/stt` through the shipped `transcribeAudio`: three clips, **all served by `sarvam`** in
  255–728 ms, zero fallbacks in the server log.
- Collect page end to end: `sarvam_text` populated in the exported JSONL for the first time, with
  `audio_type` still `audio/webm;codecs=opus`.
- The switch, with real clicks in the top bar: a recorded WebM clip through the shipped
  `transcribeAudio` was served by `groq` (378 ms) in Groq mode and by `sarvam` (264 ms) in Sarvam
  mode, and the server log showed only the chosen provider's STT endpoint each time.

**Not verified:** a real microphone and real human speech (the browser pane blocks device capture) —
that needs Rishi's spoken pass. Whether Sarvam or Groq should lead `STT_PROVIDERS` is now a question the
Collect corpus can answer, since both columns finally populate.
