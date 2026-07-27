from pydantic import BaseModel, Field
from typing import List, Optional

class VoiceQueryRequest(BaseModel):
    user_query: str = Field(..., description="Spoken or typed user question / command")
    current_timestamp: str = Field("00:00", description="Current playback timestamp e.g. 18:45")
    video_url: Optional[str] = Field(None, description="YouTube video URL")
    video_title: Optional[str] = Field("CS229 Lecture", description="Lecture title")
    language: Optional[str] = Field("Hinglish", description="Hinglish or English")

class VoiceQueryResponse(BaseModel):
    query_id: str
    user_query: str
    ai_response: str
    action_type: str = Field(..., description="SEEK_PLAYER | PAUSE_PLAYER | CONCEPT_QA | BOOKMARK_NOTE")
    target_timestamp: Optional[str] = None
    target_seconds: Optional[int] = None
    engine_used: str = Field("Cloud Fast LLM + BGE-M3 RAG", description="Engine tag")
    latency_ms: int
    saved_as_note: bool = False

class TranscriptIngestRequest(BaseModel):
    video_url: str = Field(..., description="YouTube video URL to extract transcript from")

class TranscriptChunk(BaseModel):
    start_time: str
    start_seconds: float
    duration: float
    text: str

class TranscriptIngestResponse(BaseModel):
    video_id: str
    video_title: str
    total_chunks: int
    chunks: List[TranscriptChunk]

class NoteExportItem(BaseModel):
    title: str
    content: str
    timestamp: str
    video_title: str

class NotionExportRequest(BaseModel):
    notes: List[NoteExportItem]
    notion_database_id: Optional[str] = None

class NotionExportResponse(BaseModel):
    status: str
    exported_count: int
    notion_url: Optional[str] = None
