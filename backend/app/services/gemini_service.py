import json
import logging
import asyncio
from typing import Type, TypeVar, Any, Optional
from pydantic import BaseModel
from google.genai import Client
from google.genai import types

T = TypeVar("T", bound=BaseModel)

async def generate_content_with_retry(
    prompt: str,
    system_instruction: str,
    response_schema: Optional[Type[T]] = None,
    model: str = "gemini-flash-latest",
    max_retries: int = 4,
    base_delay: float = 1.0,
) -> Any:
    """
    Calls the Gemini API using types.GenerateContentConfig.
    If a 503, 429, or other transient error occurs, retries with exponential backoff.
    """
    if model in ["gemini-2.5-flash", "gemini-flash-latest"]:
        model = "gemini-flash-lite-latest"
        
    client = Client()
    
    # Configure request config
    if response_schema:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=response_schema,
        )
    else:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
        )
        
    for attempt in range(max_retries):
        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            raw = response.text.strip()
            
            if response_schema:
                # Return parsed JSON dict/object
                return json.loads(raw)
            else:
                # Return raw text response
                return raw
        except Exception as e:
            err_str = str(e)
            is_temporary = (
                "503" in err_str or 
                "429" in err_str or 
                "unavailable" in err_str.lower() or 
                "rate" in err_str.lower() or
                "overloaded" in err_str.lower() or
                "demand" in err_str.lower()
            )
            
            if is_temporary and attempt < max_retries - 1:
                delay = base_delay * (2.5 ** attempt)
                logging.warning(
                    f"Gemini API returned temporary error on attempt {attempt+1}/{max_retries}: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )
                await asyncio.sleep(delay)
                continue
            else:
                logging.error(f"Error calling Gemini API after {attempt+1} attempts: {e}")
                raise e
