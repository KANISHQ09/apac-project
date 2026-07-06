import os
from dotenv import load_dotenv
load_dotenv()

from agents import MultiAgentOrchestrator

def main():
    print("API KEY:", os.getenv("GEMINI_API_KEY"))
    orchestrator = MultiAgentOrchestrator()
    print("Running triage...")
    res = orchestrator.run_triage("Test Title", "There is a massive pothole on the main road filled with water.")
    print("Triage Result:", res)
    print("Running orchestration...")
    res2 = orchestrator.run_orchestration(res)
    print("Orchestration Result:", res2)

if __name__ == "__main__":
    main()
