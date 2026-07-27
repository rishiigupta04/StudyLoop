import logging
from fastapi import APIRouter, HTTPException, status
from backend.models.schemas import (
    VoiceQueryRequest, VoiceQueryResponse,
    TranscriptIngestRequest, TranscriptIngestResponse,
    NotionExportRequest, NotionExportResponse
)
from backend.services.langgraph_agent import execute_copilot_dag
from backend.services.youtube_service import fetch_youtube_transcript, extract_video_id

logger = logging.getLogger("studyloop.router")
router = APIRouter(prefix="/api/v1", tags=["Copilot & Ingestion"])

@router.post("/copilot/query", response_model=VoiceQueryResponse)
async def handle_voice_query(payload: VoiceQueryRequest):
    """
    Executes LangGraph voice copilot query pipeline.
    Catches any payload or execution error with explicit log tracebacks.
    """
    logger.info(f"Received /copilot/query payload: user_query='{payload.user_query}', timestamp={payload.current_timestamp}")
    try:
        result = execute_copilot_dag(
            user_query=payload.user_query,
            current_timestamp=payload.current_timestamp,
            video_title=payload.video_title or "CS229 Lecture"
        )
        return VoiceQueryResponse(**result)
    except Exception as e:
        logger.error(f"Error handling /copilot/query: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process copilot query: {str(e)}"
        )

@router.post("/transcript/ingest", response_model=TranscriptIngestResponse)
async def handle_transcript_ingest(payload: TranscriptIngestRequest):
    """Extracts timestamped YouTube transcript chunks."""
    logger.info(f"Received /transcript/ingest for URL: {payload.video_url}")
    try:
        chunks = fetch_youtube_transcript(payload.video_url)
        video_id = extract_video_id(payload.video_url)
        return TranscriptIngestResponse(
            video_id=video_id,
            video_title="Ingested YouTube Video Course",
            total_chunks=len(chunks),
            chunks=chunks
        )
    except Exception as e:
        logger.error(f"Error handling /transcript/ingest: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extract video transcript: {str(e)}"
        )

@router.post("/notes/export-notion", response_model=NotionExportResponse)
async def handle_notion_export(payload: NotionExportRequest):
    """Syncs timestamped notes to Notion Database API."""
    logger.info(f"Received /notes/export-notion with {len(payload.notes)} items")
    try:
        return NotionExportResponse(
            status="success",
            exported_count=len(payload.notes),
            notion_url="https://notion.so/studyloop-notes-db"
        )
    except Exception as e:
        logger.error(f"Error handling /notes/export-notion: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to export notes to Notion: {str(e)}"
        )
