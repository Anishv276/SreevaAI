
import sys
import json
import os
from pypdf import PdfReader
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

def extract_text(file_path):
    try:
        if file_path.lower().endswith(".txt"):
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
                
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        print(json.dumps({"error": f"Failed to extract text: {str(e)}"}))
        sys.exit(1)

def extract_data(text, type_):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print(json.dumps({"error": "OPENAI_API_KEY is not set in the environment or .env file."}))
        sys.exit(1)
        
    try:
        client = OpenAI(api_key=api_key)
    except Exception as e:
        print(json.dumps({"error": f"Failed to initialize OpenAI client: {str(e)}"}))
        sys.exit(1)
    
    prompt = ""
    if type_ == "JD":
        prompt = f"""Extract structured data from the Job Description below.

Return JSON in this exact schema:

{{
  "job_title": string,
  "company_name": string | null,
  "department": string | null,
  "location": {{
    "city": string | null,
    "state": string | null,
    "country": string | null,
    "remote": boolean
  }},
  "employment_type": "full-time" | "part-time" | "contract" | "internship" | null,
  "experience": {{
    "min_years": number | null,
    "max_years": number | null
  }},
  "skills": {{
    "must_have": [string],
    "good_to_have": [string],
    "soft_skills": [string]
  }},
  "education": {{
    "required": string | null,
    "preferred": string | null
  }},
  "responsibilities": [string],
  "requirements": [string],
  "salary": {{
    "min": number | null,
    "max": number | null,
    "currency": string | null,
    "period": "yearly" | "monthly" | null
  }},
  "keywords": [string],
  "summary": string
}}

Extraction Rules:
- Convert experience into numbers (e.g., "2-4 years" → 2 and 4). If fresher, use 0.
- Classify skills strictly:
  must_have = Technical tools, frameworks, and hard skills (e.g., React, n8n, Zapier).
  good_to_have = Nice-to-have technical tools or industry knowledge.
  soft_skills = Communication, leadership, teamwork, etc.
- NEVER put technical tools in soft_skills.
- Normalize skills (e.g., "experience in React.js" → "React.js").
- Convert salary like "5-10 LPA" into numeric values (500000 to 1000000).
- Set remote = true if remote or hybrid is mentioned.
- Extract responsibilities as complete, detailed bullet points. DO NOT summarize or omit specific tools, technologies, or frameworks mentioned (e.g., names like "Terraform", "AWS", "Kubernetes", "Prometheus" must be preserved).
- Extract 10-15 relevant keywords for resume matching.
- Write a 1–2 line clear summary of the role.

Job Description:
{text}
"""
    elif type_ == "RESUME":
        prompt = f"""Extract structured data from the Resume below.

Return JSON in this exact schema:

{{
  "full_name": string,
  "email": string | null,
  "phone": string | null,
  "location": {{
    "city": string | null,
    "state": string | null,
    "country": string | null
  }},
  "experience": {{
    "total_years": number | null,
    "relevant_years": number | null
  }},
  "current_company": string | null,
  "education": [string],
  "skills": {{
    "technical": [string],
    "tools": [string],
    "soft_skills": [string]
  }},
  "projects": [
    {{
      "name": string | null,
      "description": string | null,
      "technologies": [string]
    }}
  ],
  "keywords": [string],
  "summary": string
}}

Extraction Rules:
- Extract total experience as a number (e.g., "5 years" → 5).
- Estimate relevant_years if possible, else null.
- Normalize skill names (e.g., "Exp in React" → "React").
- Group skills into technical (languages/frameworks), tools (software/platforms), soft_skills.
- Extract projects if present with their technologies.
- Extract 10-15 matching keywords for the candidate.
- Write a 1-2 line professional summary of the candidate.

Resume:
{text}"""
    elif type_ == "SCORE":
        # Expecting input text to contain both JD and Resume or passed separately? 
        # For simplicity in this script, let's assume 'text' passed to this function is the combined input 
        # OR we modify how we call it. 
        # The script currently takes a file_path. 
        # For scoring, we might want to pass JSON input via stdin or a temp file containing both.
        # Let's adjust the main block to handle SCORE differently, or expect a specific file format.
        # But wait, 'extract_text' reads a PDF. 
        # For scoring, we have the resume text (already extracted or fresh) and JD text (from DB).
        # Let's assume for SCORE mode, the "file_path" argument is actually a JSON file containing { "resume": "...", "jd": "..." }
        # OR we just rely on stdin for SCORE mode.
        pass

    try:
        if type_ == "SCORE":
            # Input 'text' here is expected to be a JSON string with resume and jd objects
            input_data = json.loads(text)
            resume_data = input_data.get("resume", {})
            jd_data = input_data.get("jd", {})
            
            # Extract raw texts for fallback but prioritize structured data
            resume_text = resume_data.get("summary", "") if isinstance(resume_data, dict) else str(resume_data)
            jd_text = jd_data.get("summary", "") if isinstance(jd_data, dict) else str(jd_data)

            prompt = f"""
You are an AI hiring decision engine.

Evaluate the candidate strictly against the Job Description (JD) using structured data.

---

### JOB DESCRIPTION (JD):
{json.dumps(jd_data, indent=2)}

### CANDIDATE DATA:
{json.dumps(resume_data, indent=2)}

---

### SCORING RULES (STRICT):

1. Skills Match (60 points total)
- Match JD "must_have" skills with candidate "technical" + "tools"
- Each missing must-have skill reduces score heavily
- "good_to_have" skills add bonus

2. Experience Match (25 points total)
- If candidate total_years >= JD min_years → full points
- If slightly below → partial points
- If far below → low score

3. Projects Relevance (10 points total)
- Check if candidate projects use relevant technologies from JD

4. Soft Skills (5 points total)
- Based only if explicitly mentioned in resume

---

### HARD RULES:

- If candidate misses more than 40% of must-have skills → status = "Rejected"
- If experience < (JD min_years - 1) → status = "Rejected"
- Otherwise:
    score >= 75 → "Shortlisted"
    score 50–74 → "Borderline"
    score < 50 → "Rejected"

---

### OUTPUT FORMAT (STRICT JSON):

{{
  "score": number (0-100),
  "status": "Shortlisted" | "Borderline" | "Rejected",
  "skills_match": number (0-100),
  "experience_match": number (0-100),
  "strengths": [string],
  "weaknesses": [string],
  "missing_must_have": [string],
  "reasoning": "Clear 3-4 sentence explanation with exact matches and gaps",
  "summary": "2-line recruiter-friendly decision summary"
}}

Only return valid JSON.
"""

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are structured data extraction engine for hiring systems. Convert JDs into clean, consistent JSON. Output ONLY valid JSON. Follow the schema exactly. Do not add extra fields. Standardize all values. Remove duplicates."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" }
        )
        content = completion.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        print(json.dumps({"error": f"OpenAI Error: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python scripts/extract_pdf.py <file_path> <type>"}))
        sys.exit(1)

    file_path = sys.argv[1]
    type_ = sys.argv[2]
    
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)

    if type_ == "SCORE":
        # For SCORE, file_path contains JSON { "resume": "...", "jd": "..." }
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        # extract_data handles the SCORE type internally if text is JSON
        data = extract_data(text, type_)
        # Output result consistent with other modes
        print(json.dumps({"data": data}))
    else:
        # For JD or RESUME, file_path is a PDF/text file
        text = extract_text(file_path)
        data = extract_data(text, type_)
        
        # Optionally save to a debug file, but don't fail if we can't
        try:
            output_file = "candidate.json" if type_ == "RESUME" else "drive.json"
            with open(output_file, "w") as f:
                json.dump(data, f, indent=4)
        except:
            pass

        # Output to stdout for the backend
        print(json.dumps({"text": text, "data": data}))
