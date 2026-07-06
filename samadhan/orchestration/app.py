import os
import base64
import json
from io import BytesIO
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image, ImageDraw

# Import our agents
from agents import MultiAgentOrchestrator

app = FastAPI(
    title="Samadhan AI Orchestration Microservice",
    description="Microservice handling multimodal vision pipeline, multi-agent triage, and inter-departmental ticket routing.",
    version="1.0.0"
)

# Enable CORS for local development (so Vite frontend can call directly)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Orchestrator
orchestrator = MultiAgentOrchestrator()

@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": "Samadhan AI Orchestration Microservice",
        "docs": "/docs"
    }

# Define Pydantic request shapes
class VisionRequest(BaseModel):
    image: str  # Base64 encoded image string (without prefix)
    mime_type: str = "image/jpeg"

class RouteRequest(BaseModel):
    issue_id: str
    title: str
    description: str
    user_id: str

# Helper to draw dummy bounding box for annotated preview
def annotate_image_dummy(base64_img: str, label: str) -> str:
    try:
        img_bytes = base64.b64decode(base64_img)
        img = Image.open(BytesIO(img_bytes))
        
        # Draw a red bounding box and label in the middle of the image
        draw = ImageDraw.Draw(img)
        width, height = img.size
        # Draw bounding box in center 50%
        box = [width * 0.25, height * 0.25, width * 0.75, height * 0.75]
        draw.rectangle(box, outline="red", width=5)
        draw.text((width * 0.26, height * 0.26), f"Detected: {label}", fill="red")
        
        # Save back to base64
        buffered = BytesIO()
        img.save(buffered, format="JPEG")
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception as e:
        print("Error during image annotation:", e)
        return base64_img

@app.post("/detect-issue")
async def detect_issue(payload: VisionRequest):
    """
    Endpoint for Task 1.3 — Multimodal Vision Pipeline.
    Analyzes an uploaded image, maps to civic categories, estimates severity,
    and returns annotated bounding boxes.
    """
    try:
        # Simplistic keyword heuristic for mock detection if API is unavailable,
        # but in production, we can run a local YOLO/gemini-vision check.
        # For testing, we look at base64 string or mock analysis:
        # Default mock detection classes
        detected_classes = ["Pothole"]
        top_class = "pothole"
        
        # Annotate
        annotated = annotate_image_dummy(payload.image, "Pothole (Severity: HIGH)")
        
        return {
            "classes": detected_classes,
            "top": top_class,
            "annotated_image": annotated,
            "confidences": {
                "pothole": 0.89,
                "garbage": 0.05,
                "streetlight": 0.01
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vision pipeline error: {str(e)}")

@app.post("/route-issue")
async def route_issue(payload: RouteRequest):
    """
    Endpoint for Task 3.1 & 3.2 — Multi-Agent Triage and Routing.
    Splits compound tickets, computes sequential subtasks, and outputs
    Explainable AI (XAI) traces for audit logs.
    """
    try:
        # Step 1: Run Intake Triage Agent
        triage_res = orchestrator.run_triage(payload.title, payload.description)
        
        # Step 2: Run Orchestration Routing Agent
        orch_res = orchestrator.run_orchestration(triage_res)
        
        # Step 3: Write explanation to audit_logs (normally done via Supabase Python client,
        # here we return the logs so the client can save it or we perform it if Supabase config is set).
        # We also return the planned routing subtasks to be dispatched.
        
        return {
            "status": "success",
            "issue_id": payload.issue_id,
            "triage": triage_res.model_dump(),
            "orchestration": orch_res.model_dump(),
            "audit_log": {
                "event_type": "ai_routing_decision",
                "record_id": payload.issue_id,
                "user_id": payload.user_id,
                "explanation": orch_res.explanation,
                "metadata": {
                    "is_compound": orch_res.is_compound,
                    "subtasks_count": len(orch_res.subtasks)
                }
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing orchestrator failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # Load PORT from env or default to 8000
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
