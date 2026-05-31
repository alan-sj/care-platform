FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Run the FastAPI app (ADK agents run inside the same process)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── Optional: ADK web UI for local development ────────────────────────────────
# To spin up the ADK web interface for agent testing, override CMD:
#   docker run --rm -p 8001:8001 care-platform adk web app/agents --port 8001