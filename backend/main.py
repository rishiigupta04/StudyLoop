import os
import sys
import logging
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.routers.copilot import router as copilot_router

# Ensure logs directory exists
os.makedirs("backend/logs", exist_ok=True)
log_file_path = os.path.join("backend", "logs", "backend.log")

# Configure structured logging output to file and console
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
    handlers=[
        logging.FileHandler(log_file_path, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("studyloop.main")
logger.info("Initializing StudyLoop FastAPI Backend Service...")

app = FastAPI(
    title="StudyLoop Web API Engine",
    description="Python FastAPI backend for LangGraph Multi-Agent RAG Orchestrator & Cloud LLM Copilot",
    version="1.0.0"
)

# Configure CORS Middleware for Vite Dev Server (localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(copilot_router)

@app.get("/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
async def health_check():
    """Health check endpoint for API monitoring."""
    logger.info("Health check ping received.")
    return {
        "status": "healthy",
        "service": "StudyLoop FastAPI Backend Engine",
        "version": "1.0.0",
        "environment": "development"
    }

# Global Unhandled Exception Handler for Easy Debugging
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catches all unhandled 500 errors across all routes.
    Logs full exception stack trace to backend/logs/backend.log for easy debugging.
    """
    logger.critical(f"Unhandled Exception on {request.method} {request.url}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "message": str(exc),
            "path": str(request.url.path),
            "detail": "Inspect backend/logs/backend.log for detailed stack trace debugging logs."
        }
    )

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Uvicorn server on http://localhost:8000")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
