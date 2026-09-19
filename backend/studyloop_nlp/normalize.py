"""Devanagari → Latin (Hinglish-style) transliteration + canonicalisation.

Chrome's `hi-IN` recognizer returns Devanagari even for Hinglish speech ("थोड़ा पीछे जाओ",
"वीडियो पॉज़ करो"). The intent classifier is trained on Latin-script text, so everything goes
through `normalize()` first. Output style follows how people *type* Hinglish ("peeche", "thoda",
"karo"), not academic IAST ("pīche", "thoṛā", "karo").
"""

from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------- lexicon (exact-word overrides)
# Common command words, English loanwords spoken in Hindi, and number words. Checked before rules.
# fmt: off
LEXICON: dict[str, str] = {
    # English loanwords as Chrome writes them
    "वीडियो": "video", "विडियो": "video", "सेकंड": "second", "सेकेंड": "second", "सेकंड्स": "seconds",
    "मिनट": "minute", "मिनिट": "minute", "मिनट्स": "minutes", "नोट": "note", "नोट्स": "notes",
    "स्पीड": "speed", "पॉज़": "pause", "पॉज": "pause", "पोज": "pause", "प्ले": "play", "स्टॉप": "stop",
    "स्टार्ट": "start", "बैक": "back", "फॉरवर्ड": "forward", "स्किप": "skip", "म्यूट": "mute",
    "अनम्यूट": "unmute", "वॉल्यूम": "volume", "टॉपिक": "topic", "पार्ट": "part", "समरी": "summary",
    "क्वेश्चन": "question", "रिपीट": "repeat", "जंप": "jump", "चैप्टर": "chapter", "सेक्शन": "section",
    "एक्सप्लेन": "explain", "नॉर्मल": "normal", "फास्ट": "fast", "स्लो": "slow", "टाइम": "time",
    "लेक्चर": "lecture", "एग्जांपल": "example", "एग्ज़ाम्पल": "example", "डाउन": "down", "अप": "up",
    "ओके": "ok", "प्लीज": "please", "प्लीज़": "please", "सेव": "save", "बुकमार्क": "bookmark",
    # Hindi function / command words (Hinglish spellings people actually type)
    "पीछे": "peeche", "आगे": "aage", "रुको": "ruko", "रुकिए": "rukiye", "रोको": "roko", "रोकिए": "rokiye",
    "चलाओ": "chalao", "चलाइए": "chalaiye", "चलो": "chalo", "बंद": "band", "करो": "karo", "करें": "karein",
    "कर": "kar", "करना": "karna", "करिए": "kariye", "कीजिए": "kijiye", "थोड़ा": "thoda", "थोड़ी": "thodi",
    "थोड़े": "thode", "जाओ": "jao", "जाइए": "jaiye", "चले": "chale", "पर": "par", "पे": "pe", "से": "se",
    "का": "ka", "की": "ki", "के": "ke", "को": "ko", "में": "mein", "है": "hai", "हैं": "hain", "था": "tha",
    "क्या": "kya", "क्यों": "kyun", "कैसे": "kaise", "कब": "kab", "कहाँ": "kahan", "कहां": "kahan",
    "फिर": "phir", "दोबारा": "dobara", "वापस": "wapas", "तेज़": "tez", "तेज": "tez", "धीरे": "dheere",
    "आवाज़": "awaaz", "आवाज": "awaaz", "बढ़ाओ": "badhao", "बढ़ा": "badha", "घटाओ": "ghatao", "कम": "kam",
    "ज़्यादा": "zyada", "ज्यादा": "zyada", "सुनाओ": "sunao", "बताओ": "batao", "बताइए": "bataiye",
    "समझाओ": "samjhao", "लिखो": "likho", "लिख": "likh", "लो": "lo", "लीजिए": "lijiye", "दो": "do",
    "यह": "yeh", "ये": "ye", "वो": "wo", "वह": "woh", "इस": "is", "उस": "us", "वाला": "wala", "वाले": "wale",
    "वाली": "wali", "हिस्सा": "hissa", "हिस्से": "hisse", "भाग": "bhaag", "बस": "bas", "ठीक": "theek",
    "अभी": "abhi", "तक": "tak", "मतलब": "matlab", "नहीं": "nahi", "हाँ": "haan", "हां": "haan",
    "और": "aur", "सारांश": "saransh", "जहाँ": "jahan", "जहां": "jahan", "बारे": "baare", "मुझे": "mujhe",
    "समझ": "samajh", "आया": "aaya", "आई": "aayi", "नही": "nahi", "याद": "yaad", "रखो": "rakho",
    # number words
    "एक": "ek", "तीन": "teen", "चार": "chaar", "पांच": "paanch", "पाँच": "paanch", "छह": "chhe",
    "छः": "chhe", "सात": "saat", "आठ": "aath", "नौ": "nau", "दस": "das", "पंद्रह": "pandrah",
    "बीस": "bees", "पच्चीस": "pachchees", "तीस": "tees", "चालीस": "chaalees", "पचास": "pachaas",
    "साठ": "saath", "सौ": "sau", "डेढ़": "dedh", "ढाई": "dhai", "आधा": "aadha", "आधे": "aadhe",
    "ग्यारह": "gyarah", "बारह": "barah", "तेरह": "terah", "चौदह": "chaudah", "सोलह": "solah",
    "सत्रह": "satrah", "अठारह": "atharah", "उन्नीस": "unnis", "इक्कीस": "ikkis", "बाईस": "bais",
    "तेईस": "teis", "चौबीस": "chaubis", "छब्बीस": "chhabbis", "सत्ताईस": "sattais", "अट्ठाईस": "atthais",
    "उनतीस": "untis", "इकतीस": "iktis", "बत्तीस": "battis", "तैंतीस": "taintis", "चौंतीस": "chauntis",
    "पैंतीस": "paintis", "छत्तीस": "chhattis", "सैंतीस": "saintis", "अड़तीस": "adtis", "उनतालीस": "untalis",
    "इकतालीस": "iktalis", "बयालीस": "bayalis", "तैंतालीस": "taintalis", "चवालीस": "chawalis",
    "पैंतालीस": "paintalis", "छियालीस": "chhiyalis", "सैंतालीस": "saintalis", "अड़तालीस": "adtalis",
    "उनचास": "unchas", "इक्यावन": "ikyavan", "बावन": "bavan", "तिरपन": "tirpan", "चौवन": "chauvan",
    "पचपन": "pachpan", "छप्पन": "chhappan", "सत्तावन": "sattavan", "अट्ठावन": "atthavan", "उनसठ": "unsath",
    "सत्तर": "sattar", "अस्सी": "assi", "नब्बे": "nabbe", "आधी": "aadhi", "साढ़े": "saadhe",
    # spellings the rules get wrong for command words (शुरू → "shuroo" would miss the PLAY rule)
    "शुरू": "shuru", "शुरु": "shuru", "शुरुआत": "shuruaat", "शुरूआत": "shuruaat", "चालू": "chalu",
    "रूको": "ruko", "रुकें": "rukein", "रोकें": "rokein", "ठहरो": "thehro", "ठहरिए": "thehriye",
    "सुनाई": "sunai", "आ": "aa", "वहीं": "wahin", "वहाँ": "wahan", "वहां": "wahan", "यहीं": "yahin",
    "यहाँ": "yahan", "यहां": "yahan", "क्यूँ": "kyun", "क्यूं": "kyun", "उदाहरण": "udaharan", "टू": "to",
    # English loanwords as hi-IN writes them
    "रिज्यूम": "resume", "रिज़्यूम": "resume", "कंटिन्यू": "continue", "रीस्टार्ट": "restart",
    "रिस्टार्ट": "restart", "रिप्ले": "replay", "रीप्ले": "replay", "रिवाइंड": "rewind", "फास्टर": "faster",
    "फ़ास्टर": "faster", "स्लोअर": "slower", "लाउडर": "louder", "बिगिनिंग": "beginning",
    "स्टार्टिंग": "starting", "परसेंट": "percent", "प्रतिशत": "percent", "फुल": "full", "फ़ुल": "full",
    "मैक्स": "max", "मैक्सिमम": "maximum", "मिनिमम": "minimum", "डबल": "double", "हाफ": "half",
    "हाफ़": "half", "एक्स": "x", "टाइम्स": "times", "नेक्स्ट": "next", "कैंसल": "cancel", "थैंक्स": "thanks",
    "थैंक": "thank", "यू": "you", "सॉरी": "sorry", "साउंड": "sound", "ऑफ": "off", "ऑफ़": "off", "एंड": "end",
    "इम्पॉर्टेंट": "important", "मार्क": "mark", "हेल्प": "help", "पॉइंट": "point", "अनडू": "undo",
    "साइलेंट": "silent", "मिडिल": "middle", "लास्ट": "last", "प्लेबैक": "playback",
}

_CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh",
    "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d",
    "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r",
    "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    # precomposed nukta letters
    "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f", "य़": "y",
}
_NUKTA_CONS = {"क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "d", "ढ": "dh", "फ": "f", "य": "y"}
_VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai",
    "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e",
}
_MATRAS = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o",
    "ौ": "au", "ॉ": "o", "ॅ": "e",
}
_VIRAMA, _NUKTA = "्", "़"
_NASAL = {"ं": "n", "ँ": "n"}
_VISARGA = "ः"
_DEV_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")
_DEVANAGARI_RE = re.compile("[\u0900-\u097f]")
# fmt: on


def _translit_word(word: str) -> str:
    """Rule-based transliteration of ONE Devanagari word with Hindi schwa deletion."""
    # units: [consonant, vowel]; vowel None = inherent a, "" = virama; [None, v] = independent vowel
    units: list[list[str | None]] = []
    tail = ""  # nasal/visarga attached to previous unit
    i = 0
    while i < len(word):
        ch = word[i]
        nxt = word[i + 1] if i + 1 < len(word) else ""
        if ch in _CONS:
            cons = _CONS[ch]
            if nxt == _NUKTA and ch in _NUKTA_CONS:
                cons = _NUKTA_CONS[ch]
                i += 1
            units.append([cons, None])
        elif ch in _VOWELS:
            units.append([None, _VOWELS[ch]])
        elif ch in _MATRAS and units:
            units[-1][1] = _MATRAS[ch]
        elif ch == _VIRAMA and units:
            units[-1][1] = ""
        elif ch in _NASAL and units:
            if units[-1][1] is None:
                units[-1][1] = "a"  # explicit so schwa deletion keeps it: "बंद" → "band"
            units[-1].append("n")
        elif ch == _VISARGA and units:
            units[-1].append("h")
        elif ch == _NUKTA:
            pass
        else:
            tail += ch
        i += 1

    # schwa deletion: word-final inherent 'a' dropped (if >1 unit); medial a → ∅ / V C _ C V (right to left)
    has_vowel = lambda u: u[1] is None or bool(u[1])  # noqa: E731
    deleted = [False] * len(units)
    if len(units) > 1 and units[-1][0] is not None and units[-1][1] is None:
        deleted[-1] = True
    for k in range(len(units) - 2, 0, -1):
        u = units[k]
        if u[0] is None or u[1] is not None:
            continue
        prev, nxt_u = units[k - 1], units[k + 1]
        prev_v = has_vowel(prev) and not deleted[k - 1]
        next_cv = nxt_u[0] is not None and has_vowel(nxt_u) and not deleted[k + 1]
        if prev_v and next_cv:
            deleted[k] = True

    out = []
    for k, u in enumerate(units):
        cons, vowel, *extra = u
        s = cons or ""
        if vowel is None:
            s += "" if deleted[k] else "a"
        else:
            s += vowel
        s += "".join(extra)
        out.append(s)
    word_out = "".join(out) + tail
    # Hinglish spelling conventions for word endings
    word_out = re.sub(r"aa$", "a", word_out)
    word_out = re.sub(r"ee$", "i", word_out)
    word_out = re.sub(r"aao$", "ao", word_out)  # dikhaao → dikhao, badhaao → badhao
    return word_out


def transliterate(text: str) -> str:
    """Devanagari → Hinglish-style Latin. Latin tokens pass through untouched."""
    text = unicodedata.normalize("NFC", text).translate(_DEV_DIGITS)
    out = []
    for tok in re.split(r"(\s+|[,.!?।॥;:\"'()\-])", text):
        if not tok or not _DEVANAGARI_RE.search(tok):
            out.append(tok)
            continue
        out.append(LEXICON.get(tok) or _translit_word(tok))
    return "".join(out)


# ---------------------------------------------------------------- canonicalisation
# fmt: off
_NUMBER_WORDS: dict[str, float] = {
    # Hinglish (also the spellings LEXICON gives Devanagari number words)
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6, "chah": 6,
    "saat": 7, "aath": 8, "nau": 9, "das": 10, "dus": 10, "gyarah": 11, "gyaarah": 11, "barah": 12,
    "baarah": 12, "terah": 13, "chaudah": 14, "pandrah": 15, "solah": 16, "satrah": 17, "atharah": 18,
    "athaarah": 18, "unnis": 19, "unnees": 19, "bees": 20, "ikkis": 21, "ikkees": 21, "bais": 22,
    "teis": 23, "chaubis": 24, "chaubees": 24, "pachchees": 25, "pachees": 25, "pachchis": 25,
    "chhabbis": 26, "sattais": 27, "atthais": 28, "untis": 29, "untees": 29, "tees": 30, "iktis": 31,
    "battis": 32, "taintis": 33, "chauntis": 34, "paintis": 35, "paintees": 35, "chhattis": 36,
    "saintis": 37, "adtis": 38, "untalis": 39, "chaalees": 40, "chalees": 40, "chalis": 40,
    "iktalis": 41, "bayalis": 42, "taintalis": 43, "chawalis": 44, "paintalis": 45, "paintaalees": 45,
    "chhiyalis": 46, "saintalis": 47, "adtalis": 48, "unchas": 49, "pachaas": 50, "pachas": 50,
    "ikyavan": 51, "bavan": 52, "tirpan": 53, "chauvan": 54, "pachpan": 55, "chhappan": 56,
    "sattavan": 57, "atthavan": 58, "unsath": 59, "saath": 60, "sattar": 70, "assi": 80, "nabbe": 90,
    "sau": 100,
    # English
    "a": 1, "an": 1, "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "hundred": 100,
}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fourty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
         "eighty": 80, "ninety": 90}
_FRACTIONS = {"half": 0.5, "aadha": 0.5, "aadhe": 0.5, "aadhi": 0.5, "dedh": 1.5, "dhai": 2.5,
              "dhaai": 2.5, "sava": 1.25, "sawa": 1.25}
_POINT_DIGITS = {"zero": "0", "oh": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
                 "six": "6", "seven": "7", "eight": "8", "nine": "9"}
_UNITS = {
    "s": "seconds", "sec": "seconds", "secs": "seconds", "second": "seconds", "seconds": "seconds",
    "sekand": "seconds", "sekend": "seconds", "min": "minutes", "mins": "minutes", "minute": "minutes",
    "minutes": "minutes", "minat": "minutes", "minit": "minutes", "hr": "hours", "hrs": "hours",
    "hour": "hours", "hours": "hours", "ghanta": "hours", "ghante": "hours",
}
# contexts that say "this word IS a number" (otherwise "kar do", "ek baar aur", "one more time" stay words)
_RATE_AFTER = {"guna", "times", "x", "speed"}     # "do guna", "two times", "dedh speed"
_BEFORE_ANCHORS = {"speed", "volume", "awaaz"}     # "speed dedh", "volume ko pachaas"
_SEEK_VERBS = {"go", "jump", "skip", "seek", "move", "take", "head", "start", "play", "restart", "resume",
               "navigate", "back"}
_SEEK_PREPS = {"to", "at", "from"}                 # "go to twelve thirty", "play from ten"
_HI_POSTS = {"par", "pe", "tak", "se"}             # "baarah tees par jao", "paanch minute se chalao"

# how people (and en-IN) spell Hinglish → one canonical spelling the rules use
_VARIANTS: dict[str, str] = {
    "piche": "peeche", "pichhe": "peeche", "peechhe": "peeche", "peechay": "peeche", "peche": "peeche",
    "aagey": "aage", "aagay": "aage", "agey": "aage", "agay": "aage", "aagee": "aage",
    "rooko": "ruko", "rukho": "ruko", "rukko": "ruko", "rukjao": "ruk jao",
    "chalaao": "chalao", "chalaen": "chalao", "chalayein": "chalao", "chalaaiye": "chalaiye",
    "chalado": "chala do", "chaloo": "chalu", "chaalu": "chalu", "chaaloo": "chalu",
    "shuroo": "shuru", "suru": "shuru", "shuruu": "shuru", "shurooaat": "shuruaat", "shuruat": "shuruaat",
    "shurwat": "shuruaat", "shuruwat": "shuruaat",
    "awaz": "awaaz", "aawaz": "awaaz", "aawaaz": "awaaz", "avaaz": "awaaz", "avaz": "awaaz", "awaj": "awaaz",
    "awaaj": "awaaz",
    "dhire": "dheere", "dheeray": "dheere", "dhere": "dheere", "dhima": "dheema", "dheemaa": "dheema",
    "dhimi": "dheemi", "tej": "tez", "taiz": "tez", "tezz": "tez", "tezi": "tez",
    "badao": "badhao", "barhao": "badhao", "badhaao": "badhao", "barha": "badha", "ghataao": "ghatao",
    "kum": "kam", "fir": "phir", "fhir": "phir", "phirse": "phir se", "firse": "phir se",
    "dubara": "dobara", "dobaara": "dobara", "doobara": "dobara",
    "samjhaao": "samjhao", "samjhado": "samjha do", "samjhaaie": "samjhaiye", "samjhaie": "samjhaiye",
    "samjhaaiye": "samjhaiye", "samaj": "samajh", "samjh": "samajh", "matlb": "matlab", "mtlb": "matlab",
    "kyaa": "kya", "kia": "kya", "kyon": "kyun", "kyu": "kyun", "kyoon": "kyun", "kiyon": "kyun",
    "kaisey": "kaise", "kese": "kaise",
    "wapis": "wapas", "vapas": "wapas", "waapas": "wapas", "vaapas": "wapas", "wahi": "wahin", "vahin": "wahin",
    "vaheen": "wahin", "waheen": "wahin", "vahan": "wahan", "vahaan": "wahan", "wahaan": "wahan",
    "thora": "thoda", "thodaa": "thoda", "thodasa": "thoda sa",
    "jyada": "zyada", "ziada": "zyada", "jyaada": "zyada", "zyaada": "zyada", "bandh": "band",
    "kro": "karo", "karoo": "karo", "kardo": "kar do", "krdo": "kar do", "karen": "karein",
    "deejie": "dijiye", "dijie": "dijiye", "deejiye": "dijiye", "kijie": "kijiye", "keejie": "kijiye",
    "keejiye": "kijiye",
    "jaao": "jao", "jaaiye": "jaiye", "jaie": "jaiye", "jaaie": "jaiye",
    "sunaao": "sunao", "dikhaao": "dikhao", "dikhaaiye": "dikhaiye", "sunaai": "sunai", "sunaayi": "sunai",
    "sunayi": "sunai", "likhlo": "likh lo", "likhie": "likhiye",
    "thahro": "thehro", "theharo": "thehro", "thahrie": "thehriye", "thahriye": "thehriye",
    "thehrie": "thehriye", "akhir": "aakhir", "akhri": "aakhri", "aakhiri": "aakhri", "bich": "beech",
    "adhe": "aadhe", "adha": "aadha", "adhi": "aadhi", "puri": "poori", "pura": "poora",
    "bohot": "bahut", "bahot": "bahut", "bhot": "bahut", "boht": "bahut", "bahoot": "bahut",
    "jara": "zara", "zaraa": "zara", "chupp": "chup", "chodo": "chhodo", "chod": "chhod", "rehne": "rahne",
    "sukriya": "shukriya", "dhanyawad": "dhanyavaad", "dhanyavad": "dhanyavaad", "dhanyawaad": "dhanyavaad",
    "thik": "theek", "thiik": "theek", "teek": "theek", "accha": "achha", "acha": "achha", "achcha": "achha",
    "aya": "aaya", "gya": "gaya", "gai": "gayi", "nahin": "nahi", "nai": "nahi", "nhi": "nahi",
    "nahee": "nahi", "rha": "raha", "rhi": "rahi", "rhe": "rahe",
    "vala": "wala", "waala": "wala", "vali": "wali", "waali": "wali", "vale": "wale", "waale": "wale",
    "kahaan": "kahan", "jaha": "jahan", "jahaan": "jahan", "bataao": "batao", "bataaiye": "bataiye",
    "pratishat": "percent", "parsent": "percent", "percentage": "percent",
}
_BIGRAMS = {("un", "mute"): "unmute", ("un", "pause"): "unpause", ("re", "wind"): "rewind",
            ("re", "play"): "replay", ("fast", "forwards"): "fast forward"}
# whole-utterance recognizer slips: a bare "on mute" is almost always a misheard "unmute"
_WHOLE = {"paws": "pause", "pose": "pause", "pours": "pause", "porse": "pause", "pawse": "pause",
          "paus": "pause", "on mute": "unmute", "and mute": "unmute", "an mute": "unmute", "en mute": "unmute"}
_DISFLUENCIES = {"um", "umm", "ummm", "uh", "uhh", "uhm", "er", "erm", "hmm", "hmmm", "hm", "mm", "mmm", "ah", "aah"}
_CONTRACTIONS = [
    (re.compile(r"\bwon'?t\b"), "will not"), (re.compile(r"\bcan'?t\b|\bcannot\b"), "can not"),
    (re.compile(r"\blet'?s\b"), "let us"), (re.compile(r"n't\b"), " not"), (re.compile(r"'m\b"), " am"),
    (re.compile(r"'re\b"), " are"), (re.compile(r"'s\b"), " is"), (re.compile(r"'ll\b"), " will"),
    (re.compile(r"'ve\b"), " have"), (re.compile(r"'d\b"), " would"),
]
_KEEP_CHARS_RE = re.compile(r"[^a-z0-9:.\s]")
_DIGITS_RE = re.compile(r"\d+(?:\.\d+)?")
# absolute times written without a colon, only in a seek context:
# "go to 12 30" / "go to 1230" / "jump to 12.30" / "play from 12 30" / "12 30 par jao"
_CLOCK_EN_RE = re.compile(
    r"\b((?:go|jump|skip|seek|move|take me|head|start|play|resume|restart)"
    r"(?: back| ahead| forward| straight| right)? (?:to|at|from)) (\d{1,2})[ .]?(\d{2})\b"
    r"(?! ?(?:x|speed|times|guna|percent)\b)"  # "play at 1.25 speed" is a rate, not 1:25
)
_CLOCK_HI_RE = re.compile(r"\b(\d{1,2})[ .]?(\d{2}) (?=(?:par|pe|tak|se)\b)")
# fmt: on


def _fmt_num(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def _canon_clock(s: str) -> str:
    s = _CLOCK_EN_RE.sub(lambda m: f"{m[1]} {m[2]}:{m[3]}" if int(m[3]) < 60 else m[0], s)
    return _CLOCK_HI_RE.sub(lambda m: f"{m[1]}:{m[2]} " if int(m[2]) < 60 else m[0], s)


def _parse_number(toks: list[str], i: int) -> tuple[float, int] | None:
    """One spoken number starting at toks[i] → (value, end index). Digits, "forty five",
    "one hundred twenty", Hindi words, "dedh" / "half a", "saadhe teen", "paune do", "one point five",
    "one and a half", "a couple of". "a few" returns -1 (the unit decides: 5 s or 2 min)."""
    n, t, j = len(toks), toks[i], i + 1
    if _DIGITS_RE.fullmatch(t):
        v = float(t)
    elif t in _TENS:
        v = _TENS[t]
        if j < n and toks[j] in _POINT_DIGITS and toks[j] not in ("zero", "oh"):
            v, j = v + _NUMBER_WORDS[toks[j]], j + 1
    elif t in ("a", "an") and j < n and toks[j] in ("couple", "few"):
        return _parse_number(toks, j)
    elif t == "couple":
        return 2.0, j + (1 if j < n and toks[j] == "of" else 0)
    elif t == "few":
        return -1.0, j
    elif t in ("saadhe", "sadhe", "saade", "paune"):  # "saadhe teen" = 3.5, "paune do" = 1.75
        base = _parse_number(toks, j) if j < n else None
        if base is None:
            return None
        return (base[0] + 0.5 if t != "paune" else base[0] - 0.25), base[1]
    elif t in _FRACTIONS:
        v = _FRACTIONS[t]
        if t == "half" and j < n and toks[j] in ("a", "an"):  # "half a minute"
            j += 1
    elif t in _NUMBER_WORDS:
        v = _NUMBER_WORDS[t]
    else:
        return None
    if j < n and toks[j] == "hundred" and t != "hundred":  # "one hundred twenty", "a hundred"
        v, j = v * 100, j + 1
        rest = _parse_number(toks, j) if j < n else None
        if rest and 0 < rest[0] < 100:
            v, j = v + rest[0], rest[1]
    if j + 1 < n and toks[j] == "point":  # "one point five", "1 point 25"
        k = j + 1
        digits = ""
        while k < n and (toks[k] in _POINT_DIGITS or toks[k].isdigit()):
            digits += _POINT_DIGITS.get(toks[k], toks[k])
            k += 1
        if digits:
            v, j = float(f"{int(v)}.{digits}"), k
    if toks[j : j + 3] == ["and", "a", "half"]:
        v, j = v + 0.5, j + 3
    elif toks[j : j + 2] in (["and", "half"], ["aur", "aadha"]):
        v, j = v + 0.5, j + 2
    return v, j


def _licensed(toks: list[str], s: int, e: int) -> bool:
    """Is the number word run toks[s:e] really a number here?"""
    nxt = toks[e] if e < len(toks) else ""
    prv = toks[s - 1] if s >= 1 else ""
    anchor = toks[s - 2] if s >= 2 and prv in {"ko", "to", "at", "on"} else prv
    if nxt in _UNITS:
        return True
    if toks[s] in ("a", "an") and e == s + 1:
        return False  # an article only counts before a unit ("a minute")
    if nxt == "percent" or nxt in _RATE_AFTER or nxt in _HI_POSTS:
        return True
    if anchor in _BEFORE_ANCHORS:
        # "awaaz aadhi karo" is a 50% level, left to the slot parser, not 0.5
        return not (anchor != "speed" and toks[s] in _FRACTIONS)
    return prv in _SEEK_PREPS and any(w in _SEEK_VERBS for w in toks[max(0, s - 4) : s - 1])


def _numbers(toks: list[str]) -> list[str]:
    runs: list[tuple[int, int, float]] = []
    i = 0
    while i < len(toks):
        p = _parse_number(toks, i)
        if p:
            runs.append((i, p[1], p[0]))
            i = p[1]
        else:
            i += 1
    lic = [_licensed(toks, s, e) for s, e, _ in runs]
    for _ in range(2):  # clock pairs: "twelve thirty par jao" — a run touching a number run is one too
        for k in range(len(runs) - 1):
            if runs[k][1] == runs[k + 1][0] and (lic[k] or lic[k + 1]):
                lic[k] = lic[k + 1] = True
    out: list[str] = []
    i = r = 0
    while i < len(toks):
        while r < len(runs) and runs[r][0] < i:  # runs swallowed by "... and a half"
            r += 1
        if r < len(runs) and runs[r][0] == i:
            s, e, v = runs[r]
            licensed = lic[r]
            r += 1
            i = e
            if not licensed or (e == s + 1 and _DIGITS_RE.fullmatch(toks[s])):
                out.extend(toks[s:e])
                continue
            unit = toks[e] if e < len(toks) else ""
            if v < 0:  # "a few": seconds → 5, minutes/hours → 2
                v = 5.0 if _UNITS.get(unit) == "seconds" else 2.0
            half = 3 if toks[e + 1 : e + 4] == ["and", "a", "half"] else 0
            half = half or (2 if toks[e + 1 : e + 3] in (["and", "half"], ["aur", "aadha"]) else 0)
            if unit in _UNITS and half:  # "a minute and a half" → 1.5 minutes
                out += [_fmt_num(v + 0.5), unit]
                i = e + 1 + half
                continue
            out.append(_fmt_num(v))
        else:
            out.append(toks[i])
            i += 1
    return out


def normalize(text: str) -> str:
    """The one function every utterance goes through before the classifier (graph node `normalize_input`).

    - Devanagari → Hinglish Latin, Devanagari digits → ASCII; Hinglish spellings → one canonical form
    - lowercase, contractions expanded ("don't" → "do not"), punctuation stripped (keeps `12:30`, `1.5`)
    - spoken numbers → digits where the context says they are numbers: next to a unit ("das second",
      "half a minute", "a minute and a half"), a rate ("speed dedh", "do guna"), a percent, a volume
      level, or a seek target ("go to twelve thirty", "baarah tees par jao")
    - colon-less times in a seek context → "12:30"; units canonicalised; "1.5 x" → "1.5x"
    - disfluencies ("um", "uh") dropped; a few whole-utterance recognizer slips fixed ("paws" → "pause")
    """
    s = transliterate(text).lower().replace("’", "'")
    for pattern, repl in _CONTRACTIONS:
        s = pattern.sub(repl, s)
    s = _KEEP_CHARS_RE.sub(" ", s.replace("%", " percent "))
    s = re.sub(r"(?<!\d)[:.]|[:.](?!\d)", " ", s)  # drop sentence punctuation, keep 12:30 / 1.5
    s = re.sub(r"(\d)\s*x\b", r"\1x", s)  # "1.5 x" → "1.5x"
    s = re.sub(r"(\d)(sec|secs|s|min|mins|minute|minutes|second|seconds)\b", r"\1 \2", s)  # "10s" → "10 s"
    toks = " ".join(_VARIANTS.get(t, t) for t in s.split() if t not in _DISFLUENCIES).split()
    for k in range(len(toks) - 1):
        if (toks[k], toks[k + 1]) in _BIGRAMS:
            toks[k], toks[k + 1] = _BIGRAMS[(toks[k], toks[k + 1])], ""
    toks = _WHOLE.get(" ".join(t for t in toks if t), " ".join(t for t in toks if t)).split()
    s = " ".join(_numbers(toks))
    s = _canon_clock(re.sub(r"(\d)\s+x\b", r"\1x", s))
    out: list[str] = []
    for tok in s.split():
        if tok in _UNITS and (tok != "s" or (out and _DIGITS_RE.fullmatch(out[-1]))):
            out.append(_UNITS[tok])
        else:
            out.append(tok)
    return " ".join(out)
