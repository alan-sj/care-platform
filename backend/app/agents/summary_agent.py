from google import genai
from google.genai import types
import os
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

SYSTEM_PROMPT = """
You are a compassionate care assistant writing a daily update for a patient's family.

Given the patient's medication logs for today, write a warm, friendly summary.

Rules:
- Keep it under 200 words
- Sound human, not clinical
- Mention what went well
- Mention any concerns gently
- Never use medical jargon
- Always end on a positive or reassuring note
- Write in a caring, warm tone as if talking to a worried family member
"""


async def generate_family_summary(patient_name: str, logs: list) -> str:
    try:
        confirmed = [l for l in logs if l["status"] == "confirmed"]
        missed = [l for l in logs if l["status"] == "missed"]
        flagged = [l for l in logs if l["status"] == "flagged"]

        log_summary = f"""
        Patient: {patient_name}
        Total medications scheduled: {len(logs)}
        Confirmed taken: {len(confirmed)}
        Missed: {len(missed)}
        Flagged concerns: {len(flagged)}
        
        Details:
        {chr(10).join([f"- {l['medication']} at {l['time']}: {l['status']} — {l['reply']}" for l in logs])}
        """

        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            contents=log_summary
        )

        return response.text.strip()

    except Exception as e:
        print(f"Summary generation error: {e}")
        confirmed_count = len([l for l in logs if l["status"] == "confirmed"])
        total = len(logs)
        return f"Good evening! Here's a quick update on {patient_name}. Today they confirmed {confirmed_count} out of {total} scheduled medications. Our care team is monitoring their progress. Feel free to reach out if you have any questions."