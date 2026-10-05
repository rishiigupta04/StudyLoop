# Lean CPU image for Render/Railway free tier (~512 MB RAM). No torch — ONNX Runtime only (added in Tier 1c).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
# Tier 1c intent model. The ~67 MB ONNX bundle is not in git: fetch the exact Hugging Face revision pinned in
# bundle.lock.json into /app/models/intent (onnx_classifier.DEFAULT_DIR), checking size + sha256 of every file.
# A failed fetch fails the build. This sits before COPY app so editing app code never re-downloads the model;
# a changed requirements.txt (the layer above), lock or script does. Stdlib only: nothing but python is needed here.
COPY bundle.lock.json ./bundle.lock.json
COPY scripts/fetch_intent_bundle.py ./scripts/fetch_intent_bundle.py
RUN python scripts/fetch_intent_bundle.py
COPY app ./app
COPY studyloop_nlp ./studyloop_nlp
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
