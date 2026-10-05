# Voice-corpus regression: CLASSIFIER=onnx vs regex

_`ml/corpus_regression.py`, bundle `intent-20261005-distilbert-s2`, routing τ 0.98 (**what-if**, not the bundle's calibrated τ). A regression check, not accuracy: the corpus is in the training data and the regex was tuned on it._

- cases: 743; identical intent + action + route: **638**; disagreements: **105**
- matching the corpus's expected intent and action: regex 743/743, ONNX 682/743
- disagreements by kind: {'deferred to llm_router (below τ or OOS)': 105}
- classify_intent node time with ONNX (graph timings): p50 8.71 ms, p95 13.54 ms, max 20.01 ms

| # | utterance | group | expected | regex | ONNX (conf) | ONNX route | kind |
|---:|---|---|---|---|---|---|---|
| 1 | play the video | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 2 | I'm back | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 3 | start again | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.52) | llm | deferred to llm_router (below τ or OOS) |
| 4 | don't stop | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 5 | hold on | en | PAUSE {'type': 'PAUSE'} | PAUSE {'type': 'PAUSE'} [fast] | PAUSE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 6 | hold it | en | PAUSE {'type': 'PAUSE'} | PAUSE {'type': 'PAUSE'} [fast] | PAUSE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 7 | come again | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 8 | what did he say | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 9 | what was that | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 10 | I missed that | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 11 | I didn't hear that | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 12 | sorry what | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 13 | pardon | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 14 | rewind and play | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.93) | llm | deferred to llm_router (below τ or OOS) |
| 15 | stop talking | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 16 | stop speaking | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 17 | be quiet | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 18 | quiet | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 19 | shut up | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 20 | enough | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 21 | never mind | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 22 | forget it | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 23 | thank you | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 24 | understood | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 25 | alright | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 26 | sounds good | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 27 | chalao | hinglish | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 28 | video chalao | hinglish | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 29 | chalu karo | hinglish | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 30 | shuru karo | hinglish | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 31 | zara chalao | hinglish | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 32 | main aa gaya | hinglish | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 33 | thehro | hinglish | PAUSE {'type': 'PAUSE'} | PAUSE {'type': 'PAUSE'} [fast] | PAUSE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 34 | band karo | hinglish | PAUSE {'type': 'PAUSE'} | PAUSE {'type': 'PAUSE'} [fast] | PAUSE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 35 | wapas jao | hinglish | SEEK_BACK {'type': 'SEEK_RELATIVE', 'delta_s': -10.0} | SEEK_BACK {'type': 'SEEK_RELATIVE', 'delta_s': -10.0} [fast] | SEEK_BACK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 36 | jahan tha wahan le chalo | hinglish | SEEK_ABSOLUTE {'type': 'SEEK_PREVIOUS'} | SEEK_ABSOLUTE {'type': 'SEEK_PREVIOUS'} [fast] | SEEK_ABSOLUTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 37 | dobara dikhao | hinglish | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 38 | sunai nahi de raha | hinglish | VOLUME {'type': 'VOLUME_STEP', 'delta': 20} | VOLUME {'type': 'VOLUME_STEP', 'delta': 20} [fast] | VOLUME (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 39 | silent karo | hinglish | VOLUME {'type': 'MUTE'} | VOLUME {'type': 'MUTE'} [fast] | VOLUME (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 40 | bas bas | hinglish | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 41 | rehne do | hinglish | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 42 | kuch nahi | hinglish | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 43 | चलाओ | hindi | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 44 | वीडियो चलाओ | hindi | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 45 | चालू करो | hindi | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 46 | शुरू करो | hindi | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 47 | जारी रखो | hindi | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 48 | ठहरो | hindi | PAUSE {'type': 'PAUSE'} | PAUSE {'type': 'PAUSE'} [fast] | PAUSE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 49 | बंद करो | hindi | PAUSE {'type': 'PAUSE'} | PAUSE {'type': 'PAUSE'} [fast] | PAUSE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 50 | वापस जाओ | hindi | SEEK_BACK {'type': 'SEEK_RELATIVE', 'delta_s': -10.0} | SEEK_BACK {'type': 'SEEK_RELATIVE', 'delta_s': -10.0} [fast] | SEEK_BACK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 51 | सुनाई नहीं दे रहा | hindi | VOLUME {'type': 'VOLUME_STEP', 'delta': 20} | VOLUME {'type': 'VOLUME_STEP', 'delta': 20} [fast] | VOLUME (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 52 | रहने दो | hindi | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 53 | how does backpropagation work | slow_path | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 54 | I don't understand | slow_path | ASK | ASK [rag] | ASK (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 55 | I didn't get that | slow_path | ASK | ASK [rag] | ASK (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 56 | define entropy | slow_path | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 57 | give me an example | slow_path | ASK | ASK [rag] | ASK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 58 | what's the difference between a list and an array | slow_path | ASK | ASK [rag] | ASK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 59 | help me understand this | slow_path | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 60 | samjha do | slow_path | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 61 | explain karo | slow_path | ASK | ASK [rag] | ASK (0.94) | llm | deferred to llm_router (below τ or OOS) |
| 62 | उदाहरण दो | slow_path | ASK | ASK [rag] | ASK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 63 | summarize | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 64 | summarize so far | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 65 | give me a summary | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 66 | recap | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 67 | what have we covered | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 68 | what did I miss | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 69 | key points please | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 70 | sum it up | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 71 | summary do | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 72 | ab tak kya hua | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 73 | सारांश बताओ | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 74 | अब तक क्या हुआ | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 75 | समरी दो | slow_path | SUMMARIZE | SUMMARIZE [rag] | SUMMARIZE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 76 | take a note | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 77 | make a note | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 78 | save this | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 79 | remember this | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 80 | mark this point | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 81 | bookmark karo | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 82 | yaad rakhna | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 83 | बुकमार्क करो | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 84 | याद रखना | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 85 | search for binary search | slow_path | SEMANTIC_SEEK | SEMANTIC_SEEK [seek] | SEMANTIC_SEEK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 86 | what does pause mean in music | precision | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 87 | what is the volume of a sphere | precision | ASK | ASK [rag] | ASK (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 88 | is merge sort faster than quick sort | precision | ASK | ASK [rag] | ASK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 89 | tell me about the next part | precision | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 90 | speed of light kya hai | precision | ASK | ASK [rag] | ASK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 91 | don't pause | precision | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 92 | hold up | heldout | PAUSE {'type': 'PAUSE'} | PAUSE {'type': 'PAUSE'} [fast] | PAUSE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 93 | okay let's go | heldout | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 94 | that's all | heldout | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 95 | no need | heldout | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 96 | video start karo | heldout | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 97 | आधे वीडियो पर ले चलो | heldout | SEEK_ABSOLUTE {'type': 'SEEK_FRACTION', 'fraction': 0.5} | SEEK_ABSOLUTE {'type': 'SEEK_FRACTION', 'fraction': 0.5} [fast] | SEEK_ABSOLUTE (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 98 | how do we play this game | heldout | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 99 | video ko chalu karo | heldout | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 100 | what happens when we pause the training | heldout | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 101 | how much volume of data | heldout | ASK | ASK [rag] | ASK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 102 | is it okay to skip this step | heldout | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 103 | iska speed kitna hai | heldout | ASK | ASK [rag] | ASK (0.98) | llm | deferred to llm_router (below τ or OOS) |
| 104 | mat ruko | heldout | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 105 | shuru mein kya bataya tha | heldout | ASK | ASK [rag] | ASK (0.94) | llm | deferred to llm_router (below τ or OOS) |
