# StudyLoop Tier 1c — label review brief

You are reviewing training/evaluation rows for StudyLoop's voice-command intent classifier. A student watching a long
lecture video on YouTube holds a key and talks to the app in English, Hindi or Hinglish; hosted speech-to-text writes
it down (Sarvam: Hindi in Devanagari with English words in Latin and digits; Groq Whisper: romanized Hindi; browser).
Each row is one utterance plus the label it currently carries ("was"). Decide, for EVERY row:

- `keep`    — the label is right and it is something a student would plausibly say to the app.
- `relabel` — it is clearly and unambiguously another intent (give `intent`).
- `drop`    — ambiguous even to a careful human (two intents equally plausible), garbled / not real Hindi or English,
              unnatural (no student would say it), not what speech-to-text would produce (emojis, markdown), or a
              meaning so different from the label that it is neither a clean keep nor a clean relabel.

Relabel only when you are sure; when unsure between relabel and drop, drop. When unsure between keep and drop for a
row that is fine but slightly odd, keep. Give a short `note` for every relabel/drop (why).

## The 14 intents

- PLAY: resume or start playing the lecture video (also "don't stop" / "mat roko").
- PAUSE: pause the video (a bare "stop", "wait", "ruko", "hold on").
- SEEK_BACK: jump backwards by a relative amount ("go back 10 seconds", "thoda peeche"); no topic named.
- SEEK_FORWARD: jump forwards by a relative amount ("skip 30 seconds", "aage karo", "skip this part"); no topic named.
- SEEK_ABSOLUTE: jump to a position: a timestamp ("go to 12:30"), the start/restart, the end, the middle, N percent, or
  undo the last jump ("back to where I was").
- REPLAY: hear the last bit again: "say that again", "what did he say", "I didn't catch/hear that", "I missed that",
  "replay the last 30 seconds" (no topic named).
- SPEED: change the playback rate: faster, slower, 1.5x, normal speed; complaints "too fast" mean slower.
- VOLUME: change loudness: louder, quieter, mute, unmute, set to N; "I can't hear" means louder, "too loud" quieter.
- SEMANTIC_SEEK: jump to the part of the lecture about a named topic ("take me to where he explains recursion",
  "binary search wala part", "skip the intro", "I missed the bit where he defined a peak", "where does he talk about X").
- ASK: a question about the lecture's content or asking for an explanation ("why is X", "I didn't understand",
  "explain X", "what did he say about X", "the professor's name was what").
- SUMMARIZE: a summary / recap of what has been covered ("summarize so far", "what did I miss", "what is this lecture
  about", "what's the main point of this lecture").
- TAKE_NOTE: save a note or bookmark, optionally with its content ("note that merge sort is stable", "bookmark this").
- STOP_SPEAKING: stop the assistant's spoken answer, or an acknowledgement / dismissal that ends the exchange ("stop
  talking", "enough", "thanks, got it", "theek hai", "bas", "chhod do", "rehne do", "koi baat nahi chhodo",
  "zaroorat nahi", "never mind", "shh").
- OOS: not a command for the video app and not a question about the lecture: greetings, small talk, off-topic
  questions (weather, time, food), talk aimed at someone else in the room, muttering, half sentences, false starts,
  asking what the app can do ("help", "what can I say"), and negated commands ("don't skip", "speed mat badlo").

## Labeling rules (these decide the hard cases)

- "I didn't hear / catch that" is REPLAY; "I didn't understand / get it" (samajh nahi aaya) is ASK.
- "I can't hear" (ongoing, "sunai nahi de raha") is VOLUME up; "sunai nahi diya" (just now, past) is REPLAY.
- Complaints invert the adjective: "it's too fast" is SPEED down; "too loud" is VOLUME down.
- "dheere karo" alone is SPEED down; "awaaz dheere karo" is VOLUME down.
- Undo / "go back to where I was", restart, "from the beginning", go to the end / middle / N% are SEEK_ABSOLUTE.
- A question that merely contains command words ("why did he go back?", "what is the volume of a sphere") is ASK.
- "What did he say about X" asks about X: ASK. "What did he just say" (no topic): REPLAY.
- A topic named means SEMANTIC_SEEK ("I missed the bit where he defined X"); no topic means REPLAY ("I missed that").
- A bare "stop" is PAUSE; "stop talking" / "stop explaining" / "bolna band karo" / "chup" is STOP_SPEAKING.
- Acknowledgements that end an exchange ("thanks", "got it", "okay", "theek hai", "samajh gaya") are STOP_SPEAKING.
- "Don't stop" / "mat roko" / "don't pause it" is PLAY; any other negated command ("don't skip", "don't mute",
  "speed mat badlo") is OOS.
- "help" / "what can I say" / "what can you do" is OOS.
- "phir se / dobara / again" + play/chalao means REPLAY (hear it again); "shuru se / from the start / restart" is
  SEEK_ABSOLUTE; "aage badhao / aage karo" is SEEK_FORWARD.
- "go back N seconds" without "again" is SEEK_BACK; "go back N seconds and play it again" / "rewind and replay" is
  REPLAY only when the point is to hear it again — if it's a plain relative jump, SEEK_BACK.
- "N minute aage / peeche", "skip N minutes" are relative (SEEK_FORWARD / SEEK_BACK); "N minute pe/par jao",
  "go to minute N", clock times are SEEK_ABSOLUTE.
- "X kya hai / what is X / explain X" is ASK; "X wala part / take me to X / where does he explain X" is SEMANTIC_SEEK.
- "summary / recap / ab tak kya hua / what did I miss" is SUMMARIZE; a question about one specific concept is ASK.
- "note this / bookmark / yaad rakhna / likh lo" is TAKE_NOTE; "is it important to note that…?" is ASK.
- Decided by the project owner: the dismissals "chhod do", "koi baat nahi chhodo", "zaroorat nahi" are STOP_SPEAKING;
  "is lecture ka main point kya hai" / "इस lecture का मुख्य point बताइए" are SUMMARIZE; "skip to the summary at the end
  of the lecture" is ambiguous (SEMANTIC_SEEK vs SEEK_ABSOLUTE) → drop.

## Precedents from the gold voice corpus (follow them)

- PLAY: "start", "start again", "shuru karo", "I'm back", "don't stop", "go ahead".
- SEEK_ABSOLUTE: "restart", "play from the beginning", "shuru se chalao", "dobara shuru karo", "phir se shuru karo",
  "shuru se dobara chalao", "shuru mein le chalo", "last mein jao", "play from 3:40", "rewind to the beginning".
- SEEK_BACK: "go back 30 seconds and play" (a relative jump, even with "and play").
- SEEK_FORWARD: "skip 30 seconds and play".
- REPLAY: "say that again", "play that again", "once more", "one more time", "what did he say", "what was that",
  "I missed that", "didn't catch that", "repeat the last 30 seconds", "replay the last minute", "phir se dikhao",
  "phir se chalao", "dobara sunao", "pichhle 30 second phir se", "last minute phir se dikhao", "pichla part phir se chalao".
- ASK: "phir se samjhao" (explain again), "shuru mein kya bataya tha" (a question about content).

## What rows look like

`was` = current label, `judge` = a blind LLM's label (may be null; the LLM is ~98 % right, not always), `kind` = base
(hand-written) or para (an LLM paraphrase of `base`), `split` = train/val/test. A paraphrase must be judged on its own
text, not on its base: paraphrasing sometimes drifts ("phir se" turns PLAY into REPLAY; "samajh nahi aaya" turns REPLAY
into ASK). Numbers, times and topics may differ from the base — that's intended.

Rows from the confident-learning queue also carry `cl_suggest` (the intent an out-of-fold classifier preferred) and
`cl_p_label` (its probability for the current label). That classifier is often wrong on rare phrasings: treat its
suggestion as a reason to look closely, never as the answer. `kind` = external means a CLINC150 / SNIPS sentence used
as an OOS negative: drop it if it reads like one of our intents (e.g. "play <song>" looks like PLAY).
