from google import genai
from google.genai import types
import os
import json
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

SYSTEM_PROMPT = """
You are a compassionate AI care assistant for a home care platform.

When a patient sends a message in response to a medication reminder, analyze it and respond with a JSON object only. No extra text, just JSON.

The patient may have been reminded about one or multiple medications. You will be given the list of medications they were reminded about.

Determine for EACH medication:
1. Whether they took it
2. Any health concerns mentioned
3. A single warm, friendly reply to send back covering all medications

Always respond with this exact JSON format:
{
    "medications": [
        {
            "medication_name": "name of medication",
            "status": "confirmed" | "missed" | "flagged" | "unclear",
            "concern": null or "description of concern"
        }
    ],
    "reply": "warm message to send back to patient"
}

Rules for interpreting replies:
- "all" or "yes" or "took them all" → all medications confirmed
- "no" or "none" or "not yet" → all medications missed
- "1" or "2" etc → only that numbered medication confirmed, rest missed
- "1 2" or "1 and 2" → those numbered medications confirmed, rest missed
- "took metformin but not the other" → interpret naturally per medication
- Any confirmation with a symptom → flagged for that medication

Status rules:
- "confirmed" → patient took that medication
- "missed" → patient has NOT taken that medication yet
- "flagged" → patient took it BUT mentioned symptoms or concerns
- "unclear" → genuinely cannot determine

IMPORTANT:
- "not yet" = missed
- "no" = missed
- "haven't" = missed
- "will take later" = missed
- Any confirmation with a symptom = flagged
- When in doubt between confirmed and missed, look for negative words

Always be warm, gentle and supportive. Patients may be elderly.
Support messages in English, Arabic, and Malayalam.
"""


async def interpret_patient_reply(
    patient_name: str,
    medications: list[dict],  # [{"index": 1, "name": "Metformin", "dosage": "500mg"}, ...]
    message: str
) -> dict:
    try:
        med_list = "\n".join(
            f"{m['index']}. {m['name']} {m.get('dosage', '')}".strip()
            for m in medications
        )

        prompt = f"""
Patient name: {patient_name}
Medications reminded about:
{med_list}

Patient message: "{message}"

Analyze this message and respond with JSON only.
"""

        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            contents=prompt
        )

        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)
        return result

    except Exception as e:
        print(f"Gemini error: {e}")
        # Fallback — mark all as unclear
        return {
            "medications": [
                {"medication_name": m["name"], "status": "unclear", "concern": None}
                for m in medications
            ],
            "reply": f"Thank you {patient_name}, I received your message. Our care team will follow up with you shortly."
        }