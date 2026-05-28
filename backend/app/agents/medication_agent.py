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

Determine:
1. Whether they took their medication
2. Any health concerns mentioned
3. A warm, friendly reply to send back to the patient

Always respond with this exact JSON format:
{
    "status": "confirmed" | "missed" | "flagged" | "unclear",
    "concern": null or "description of concern",
    "reply": "warm message to send back to patient"
}

Rules:
- "confirmed" → patient took medication. Examples: "yes", "took it", "done", "already took it", "took it an hour ago", "yes i took it"
- "missed" → patient has NOT taken medication yet. Examples: "no", "not yet", "haven't taken it", "forgot", "will take later", "nope"
- "flagged" → patient took it BUT mentioned symptoms or concerns. Examples: "took it but feeling dizzy", "yes but i have a headache"
- "unclear" → genuinely cannot determine. Only use this if the message is completely unrelated to medication.

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

async def interpret_patient_reply(patient_name: str, medication_name: str, message: str) -> dict:
    try:
        prompt = f"""
        Patient name: {patient_name}
        Medication: {medication_name}
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
        return {
            "status": "unclear",
            "concern": None,
            "reply": f"Thank you {patient_name}, I received your message. Our care team will follow up with you shortly."
        }