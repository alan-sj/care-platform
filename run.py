import uvicorn
import sys
import os

# Add backend directory to path so uvicorn can find app.main
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

if __name__ == "__main__":
    # Start the FastAPI server on port 7860
    uvicorn.run("app.main:app", host="0.0.0.0", port=7860, reload=False)
