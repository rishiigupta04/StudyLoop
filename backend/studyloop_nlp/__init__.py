"""Shared text processing for StudyLoop.

Imported by BOTH the backend (serving) and ml/ (training data prep) so the classifier trains on
exactly what it sees in production (roadmap D6). Pure Python, no dependencies, <1 ms per call.
"""

from studyloop_nlp.normalize import normalize, transliterate
from studyloop_nlp.slots import Slots, parse_slots

__all__ = ["normalize", "transliterate", "parse_slots", "Slots"]
__version__ = "1.0.0"  # bump whenever output changes: the classifier must be retrained against it
