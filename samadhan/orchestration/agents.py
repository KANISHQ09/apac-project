import os
import json
from pathlib import Path
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import List, Optional
from dotenv import load_dotenv

# Load env variables from the local .env file
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# Load gemini key from env
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Define schemas for structured outputs
class IntakeTriageResult(BaseModel):
    is_valid_civic_issue: bool = Field(description="True if the input describes a valid public civic grievance, false if spam, generic, or off-topic.")
    sanitized_description: str = Field(description="A clean, professionally summarized version of the grievance in English.")
    estimated_urgency: str = Field(description="Urgency estimate: 'low', 'medium', 'high', 'critical'.")
    primary_category: str = Field(description="The primary category key: 'water', 'sanitation', 'electricity', 'roads', 'parks', 'buildings'.")

class SubTask(BaseModel):
    department: str = Field(description="Department responsible for this subtask: 'water_supply', 'sanitation', 'electricity', 'roads', 'parks', 'buildings'.")
    description: str = Field(description="Specific, action-oriented instruction for this department.")
    sequence: int = Field(description="Execution sequence order (1 for first tasks, 2 for tasks that depend on previous, etc.).")

class OrchestrationResult(BaseModel):
    is_compound: bool = Field(description="True if the grievance requires multiple separate departments to resolve sequential issues.")
    explanation: str = Field(description="Immutable logic trace explaining the routing and sequencing decisions for RTI audits.")
    subtasks: List[SubTask] = Field(description="List of department-scoped tasks to be dispatched.")

class MultiAgentOrchestrator:
    def __init__(self):
        # We use gemini-1.5-flash as our fast, reliable agent LLM
        self.model_name = "gemini-1.5-flash"

    def run_triage(self, title: str, description: str) -> IntakeTriageResult:
        """
        Intake & Triage Agent:
        Parses textual input, filters spam/injection, estimates urgency, and assigns category.
        """
        if not GEMINI_API_KEY:
            # Fallback mock response if Gemini API is not configured
            return IntakeTriageResult(
                is_valid_civic_issue=True,
                sanitized_description=f"Triage: {description}",
                estimated_urgency="medium",
                primary_category="roads" if "road" in description.lower() or "pothole" in description.lower() else "water"
            )

        prompt = f"""
        Analyze the following civic issue submission.
        Title: {title}
        Description: {description}

        Determine if this is a valid civic grievance (trash, potholes, leaks, power outages, etc.).
        Sanitize and translate/summarize the text to clear English.
        Estimate severity/urgency and assign the best primary category.
        """
        
        try:
            model = genai.GenerativeModel(self.model_name)
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    response_schema=IntakeTriageResult,
                )
            )
            data = json.loads(response.text)
            return IntakeTriageResult(**data)
        except Exception as e:
            print(f"Gemini API Call failed in run_triage: {e}")
            return IntakeTriageResult(
                is_valid_civic_issue=True,
                sanitized_description=f"Triage (Fallback): {description}",
                estimated_urgency="medium",
                primary_category="roads" if "road" in description.lower() or "pothole" in description.lower() else "water"
            )

    def run_orchestration(self, triage: IntakeTriageResult) -> OrchestrationResult:
        """
        Orchestration Agent:
        Splits compound grievances into sequential tasks and generates explanation logs for audit trail.
        """
        if not GEMINI_API_KEY:
            # Fallback mock response
            dept_map = {
                "water": "water_supply",
                "sanitation": "sanitation",
                "electricity": "electricity",
                "roads": "roads",
                "parks": "parks",
                "buildings": "buildings"
            }
            primary_dept = dept_map.get(triage.primary_category, "roads")
            return OrchestrationResult(
                is_compound=False,
                explanation="No compound issues detected. Direct routing to primary department.",
                subtasks=[
                    SubTask(
                        department=primary_dept,
                        description=triage.sanitized_description,
                        sequence=1
                    )
                ]
            )

        prompt = f"""
        Review this sanitized civic issue:
        Category: {triage.primary_category}
        Description: {triage.sanitized_description}
        Urgency: {triage.estimated_urgency}

        Identify if this is a compound issue requiring coordinate action between different municipal departments.
        For example: "A major water main leak flooded the street, cracking the asphalt and creating massive potholes."
        This requires:
          1. Water Supply Department (to fix the pipe leak first)
          2. Roads Department (to patch the potholes after the leak is stopped)

        Generate sequential subtasks. Provide a detailed, human-readable logic trace in 'explanation'
        explaining why you split (or didn't split) the ticket, and the sequencing logic, suitable for audit logs.
        """

        try:
            model = genai.GenerativeModel(self.model_name)
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    response_schema=OrchestrationResult,
                )
            )
            data = json.loads(response.text)
            return OrchestrationResult(**data)
        except Exception as e:
            print(f"Gemini API Call failed in run_orchestration: {e}")
            dept_map = {
                "water": "water_supply",
                "sanitation": "sanitation",
                "electricity": "electricity",
                "roads": "roads",
                "parks": "parks",
                "buildings": "buildings"
            }
            primary_dept = dept_map.get(triage.primary_category, "roads")
            return OrchestrationResult(
                is_compound=False,
                explanation=f"Fallback orchestration triggered due to exception: {str(e)}",
                subtasks=[
                    SubTask(
                        department=primary_dept,
                        description=triage.sanitized_description,
                        sequence=1
                    )
                ]
            )
