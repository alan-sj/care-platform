# Stage 1: Build the React Frontend
FROM node:20 AS frontend-builder
WORKDIR /dashboard
COPY dashboard/package*.json ./
RUN npm install
COPY dashboard/ ./
# Build frontend with VITE_API_URL set to relative /api path
RUN VITE_API_URL=/api npm run build

# Stage 2: Build the FastAPI Python Backend
FROM python:3.11-slim
WORKDIR /app

# Install standard build dependencies if needed (e.g. for psycopg2 etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/app ./app

# Copy compiled frontend from Stage 1 into backend's serving directory
COPY --from=frontend-builder /dashboard/dist ./dist

# Create a folder for persistent database storage (for SQLite) and set ownership for Hugging Face user 1000
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data

# Default port for Hugging Face Spaces is 7860
EXPOSE 7860

# Run uvicorn server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
