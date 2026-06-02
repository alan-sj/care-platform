---
title: Care Platform
emoji: 🩺
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Care Platform

A modern, high-fidelity patient care dashboard and AI-driven clinical backend.

## 🚀 Hugging Face Spaces Deployment

This repository is configured to deploy directly to Hugging Face Spaces using Docker.

- **Vite React Frontend**: Compiled and served statically.
- **FastAPI Python Backend**: Runs the REST API under the `/api` route prefix.
- **SQLite Database**: Automatically initializes and runs on a local SQLite instance for easy portable deployment.

## 🛠️ Local Development & Running

To build and run this project locally in Docker:

```bash
# Build the Docker image
docker build -t care-platform .

# Run the container
docker run -p 7860:7860 -e GOOGLE_API_KEY="your_api_key" care-platform
```
