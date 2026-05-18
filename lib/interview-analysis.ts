import OpenAI from "openai";

export async function generateInterviewReport(params: {
  transcript: string;
  resumeText: string;
  jdText: string;
  role: string;
  candidateName: string;
  durationSeconds: number;
  proctoringEvents: any[];
  orgId?: string;
}) {
  const {
    transcript,
    resumeText,
    jdText,
    role,
    candidateName,
    durationSeconds,
    proctoringEvents,
  } = params;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "dummy-key-for-mock-mode") {
    console.warn("[INTERVIEW_ANALYSIS] OPENAI_API_KEY is missing or dummy. Using fallback report.");
    return { data: generateFallbackReport(candidateName, role), usage: null };
  }

  const openai = new OpenAI({ apiKey });

  const prompt = `
You are a senior technical recruiter and behavioral analyst. You have just reviewed a complete AI-led interview.

CANDIDATE: ${candidateName}
ROLE: ${role}
DURATION: ${Math.round(durationSeconds / 60)} minutes
PROCTORING EVENTS: ${JSON.stringify(proctoringEvents || [])}

[RESUME]
${resumeText || "No resume provided."}

[JOB DESCRIPTION]
${jdText || "No JD provided."}

[FULL INTERVIEW TRANSCRIPT]
${transcript}

---

TASK: Analyze the full transcript end-to-end and output a structured JSON report. Be specific and evidence-backed. Never invent moments — cite the transcript directly.

OUTPUT SCHEMA (strict JSON, all fields required):

{
  "_meta": {
    "is_fallback": false,
    "generated_at": "ISO timestamp"
  },

  "scores": {
    "combined_score": number (0–100. Weighted: demonstrated_competency×0.35 + communication×0.25 + behavioral×0.20 + cognitive×0.15 + integrity×0.05. Compute LAST.),
    "demonstrated_competency": number (0–100. See RULE 2 for full methodology.),
    "communication_score": number (0–100. Average of all 9 communication sub-scores. Must match communication section.),
    "behavioral_score": number (0–100. Engagement depth, ownership signals, consistency between resume claims and interview answers, handling of follow-up probes. NOT communication, NOT proctoring.),
    "cognitive_score": number (0–100. Average of cognitive_insights: clarity + depth_of_knowledge + problem_solving + logical_thinking + adaptability, divided by 5.),
    "integrity_score": number (0–100. Start 100, deduct: tab_switch −5 each, face_not_detected −10 each, multiple_faces −15 each, phone_detected −8 each. Floor at 0.)
  },

  "qa_blocks": [
    {
      "q": number (1-based),
      "question": "Full question text as asked",
      "answer_summary": "60–90 word neutral summary of what the candidate actually said — paraphrase, do not evaluate here",
      "title": "2–4 word topic label",
      "tags": ["skill1", "skill2"],
      "score": "X/10",
      "verdict": "Specific reasoning: what was asked, what the candidate said, what was good, what was missing. Cite transcript. No generic phrases.",
      "confidence": "High" | "Medium" | "Low",
      "score_breakdown": {
        "technical_accuracy": number (0–10, correctness of facts/concepts stated),
        "depth": number (0–10, beyond surface — layers, trade-offs, edge cases),
        "clarity": number (0–10, how clearly the answer was communicated),
        "practical_application": number (0–10, real-world usage, project context, implementation detail)
      }
    }
  ],

  "communication": {
    "pronunciation": number (0–100. Score clarity of articulation as readable from the transcript.
      SIGNALS THAT LOWER SCORE: garbled or broken words, truncated words mid-sentence, words that appear phonetically mangled or misheard by the STT system, sentences where word boundaries collapse.
      SIGNALS THAT RAISE SCORE: words consistently spelled correctly and fully formed, sentences that read cleanly without broken phrasing.
      85–100: crisp, fully formed words throughout; 65–84: mostly clear with occasional garbled words; 40–64: frequent unclear or broken words; below 40: hard to parse multiple answers.
      NOTE: This is a transcript — score what is OBSERVABLE in the text, not assumed vocal quality.),

    "grammar": number (0–100. Score sentence structure quality across ALL answers.
      SIGNALS THAT LOWER SCORE: subject-verb disagreement ("I was studied", "we will I mean"), missing articles, run-on sentences with no punctuation, tense inconsistencies within a single sentence, sentence fragments under 4 words used as complete answers, incorrect prepositions, repeated word ("nothing nothing much").
      SIGNALS THAT RAISE SCORE: consistently complete sentences, correct tense throughout, varied clause structure (subordinate clauses, conditionals), proper use of articles and prepositions.
      Count observable grammar errors across the full transcript. 85–100: ≤2 errors; 65–84: 3–6 errors; 40–64: 7–12 errors; below 40: 13+ errors or pervasive structural issues.),

    "fluency": number (0–100. Score smoothness of verbal delivery based on observable transcript patterns.
      SIGNALS THAT LOWER SCORE: filler words (um, uh, like, you know, basically, so, right, I mean, sort of, kind of) — count total instances; broken phrases that restart mid-thought ("I was — I mean — so what happened was"); sentence fragments followed immediately by a corrected version; answers that trail off without completing the thought.
      SCORING SCALE: Count filler instances across all substantive answers.
      0 fillers → 95–100; 1–3 fillers → 85–94; 4–7 fillers → 70–84; 8–12 fillers → 55–69; 13–18 fillers → 40–54; 19–25 fillers → 25–39; 26+ fillers → below 25.
      Also penalise broken/restarted phrases: each restart = −3 points from fluency base.),

    "confidence": number (0–100. Score assertiveness and decisiveness from the transcript text.
      SIGNALS THAT LOWER SCORE: hedging phrases ("I think maybe", "I guess", "not sure", "kind of", "sort of", "I believe", "probably", "might be", "could be", "I suppose", "something like that"); apologetic openers ("sorry, just", "only", "I might be wrong"); tentative phrasing where a direct statement was possible; answers that end with an upward question ("…right?", "…I think?"); self-corrections that suggest uncertainty rather than clarification.
      SIGNALS THAT RAISE SCORE: declarative statements ("I built X", "The reason is Y", "We used Z because"), active voice, defending a position when challenged, giving direct answers without unnecessary qualification.
      Count hedging instances across all substantive answers.
      0–1 hedges → 90–100; 2–3 hedges → 75–89; 4–6 hedges → 60–74; 7–10 hedges → 45–59; 11–15 hedges → 30–44; 16+ hedges → below 30.),

    "summary": "One sentence that names the SPECIFIC patterns observed — cite actual counts or concrete examples (e.g., 'Candidate used 14 filler words and 8 hedging phrases across technical answers, dragging fluency and confidence scores down despite grammatically complete sentences.'). No generic phrases."
  },

  "cognitive_insights": {
    "clarity": number (0–100),
    "clarity_earned": "1–2 sentences: what the candidate specifically said or did that showed clear thinking. Quote or close paraphrase from transcript. Start with what worked — e.g. 'Structured their answer in three steps before diving in, naming each part before explaining it.'",
    "clarity_missed": "1–2 sentences: what cost them points — where their explanation was confusing, circular, or required follow-up probing. Cite the specific moment. If none, write 'No clarity issues detected.'",
    "depth_of_knowledge": number (0–100),
    "depth_earned": "1–2 sentences: the strongest evidence of real knowledge depth — a specific implementation detail, trade-off, or nuanced distinction they demonstrated. Quote or close paraphrase.",
    "depth_missed": "1–2 sentences: where they stayed surface-level, gave textbook definitions without application, or failed to go beyond the obvious. Cite exact question or moment. If depth was strong throughout, write 'No significant depth gaps.'",
    "problem_solving": number (0–100),
    "problem_solving_earned": "1–2 sentences: the best example of structured thinking — did they break the problem down, name constraints, consider edge cases? Quote or paraphrase the moment.",
    "problem_solving_missed": "1–2 sentences: where they jumped to a solution without reasoning, made an unstated assumption, or ignored an important constraint. Cite the question. If problem solving was solid, write 'No major gaps in problem solving approach.'",
    "logical_thinking": number (0–100),
    "logical_thinking_earned": "1–2 sentences: where their reasoning was sequenced, conclusions followed from stated premises, or they connected ideas across different parts of the interview.",
    "logical_thinking_missed": "1–2 sentences: where their logic broke down — contradictory statements, conclusions that didn't follow from their reasoning, or answers that drifted off-topic. If reasoning was coherent throughout, write 'Logical consistency maintained across the session.'",
    "adaptability": number (0–100),
    "adaptability_earned": "1–2 sentences: how they responded when redirected, corrected, or given a curveball — did they adjust their answer, ask a clarifying question, or incorporate the feedback? Cite the moment.",
    "adaptability_missed": "1–2 sentences: where they resisted correction, repeated the same wrong answer, or failed to incorporate interviewer feedback. If adaptability was strong, write 'No adaptability issues observed.'",
    "confidence": number (0–100, genuine conviction vs surface hedging — did they own their answers or constantly qualify with 'I think', 'maybe', 'not sure'?),
    "confidence_earned": "1–2 sentences: moments where the candidate answered with clear conviction — defended a position, gave a direct answer without excessive hedging, or pushed back thoughtfully when challenged. Quote or paraphrase.",
    "confidence_missed": "1–2 sentences: moments of unnecessary hedging, over-qualification, or backing down from a correct answer when challenged. Cite the specific exchange. If confidence was strong throughout, write 'No confidence issues detected.'",
    "summary": "2–3 sentences. Sentence 1: name the strongest cognitive dimension and cite the best evidence moment. Sentence 2: name the weakest dimension and what specifically caused it. Sentence 3: overall cognitive profile verdict — is this person a sharp thinker, surface-level, inconsistent, or a specialist in narrow areas?"
  },

  "behavioral_analysis": {
    "overview": "2–3 sentence plain-English summary an HR manager can read in 10 seconds. State working style, attitude toward the role, and one decisive signal for hiring.",
    "engagement_signals": [
      {
        "signal": "Short label for this signal (e.g. 'Proactive clarification before answering')",
        "what_happened": "Exactly what the candidate said or did at this moment in the interview — cite the topic or question.",
        "what_was_wrong": "What concern or gap this revealed, or write 'None — this was a positive signal' if it was good.",
        "handled": "Yes — [how they resolved it] / Partially — [what was missing] / No — [what they should have done instead]"
      }
    ],
    "consistency_signals": [
      {
        "signal": "Short label (e.g. 'Resume claimed 3 years Python — answered showed beginner level')",
        "what_happened": "What the resume claimed vs what they said in the interview.",
        "what_was_wrong": "Whether the claim was Confirmed, Partially supported, or Not supported — and why it matters.",
        "handled": "Yes — candidate acknowledged the gap / No — candidate doubled down or ignored the inconsistency / N/A — no inconsistency detected"
      }
    ],
    "communication_patterns": [
      {
        "signal": "Short label (e.g. 'Used STAR structure consistently')",
        "what_happened": "The specific pattern observed with a transcript example.",
        "what_was_wrong": "What was problematic about this pattern, or 'None — this was effective communication' if positive.",
        "handled": "Yes / Partially / No — with one sentence of context"
      }
    ],
    "confidence_indicators": [
      {
        "signal": "Short label (e.g. 'Genuine confidence on system design' or 'Surface confidence on testing')",
        "what_happened": "The exact moment or exchange that revealed this confidence level.",
        "what_was_wrong": "What the confidence level signals as a risk or strength — be specific.",
        "handled": "Yes / Partially / No — did they recover or compound the issue"
      }
    ],
    "integrity_flags": [
      "Only include real flags. If none: 'No behavioral integrity concerns detected.' If flags: [Type] at [topic] — [what was observed] — [HR implication]."
    ],
    "strengths_observed": [
      "Format: [Skill/trait] — [Specific transcript moment proving it] — [Why it matters for this role]. Minimum 4 bullets."
    ],
    "concerns_noted": [
      "Format: [Concern] — [What was said/done] — [Risk: Low/Medium/High + why]. Minimum 4 bullets."
    ],
    "summary": "3-sentence behavioral verdict. Sentence 1: working style and interpersonal signals. Sentence 2: strongest evidence point FOR hiring. Sentence 3: biggest risk or open question."
  },

  "verdict": {
    "summary": "150–250 word assessment. Organise as: (1) What the candidate demonstrated — specific skills/projects/knowledge shown with transcript evidence. (2) Critical gaps — what was missing or weak, with severity. (3) Hiring signal — the single most decisive observation that tips this candidate toward hire or no-hire. Never summarise scores (they are shown separately). Never repeat communication observations (shown separately). No vague adjectives. Every sentence must contain a specific observation tied to a transcript moment.",
    "recommendation": "Strong Yes" | "Yes" | "Maybe" | "No",
    "recommendation_reason": "1–2 sentences citing the single most decisive evidence from the transcript — the one thing that most determined this recommendation.",
    "ai_summary_concise": "EXACTLY 4 bullet points starting with •. These are plain, factual, insight-rich observations for an HR manager. STRICT RULES: NO scores, NO percentages, NO communication observations (shown elsewhere), NO hiring recommendation (shown elsewhere), NO vague adjectives ('strong communicator', 'good fit'). Every bullet must be ONE focused sentence containing a SPECIFIC observation from the transcript — name what was said, what topic, what pattern. Bold (**text**) only genuinely important skills, gaps, or signals. Organise as:\n• What specific knowledge, projects, or skills did this person prove? Name the exact area and what they said.\n• Where did depth fall short or a critical area go unanswered? Be specific — name the topic and what was missing.\n• What consistent behavioral pattern emerged? Cite the moment that revealed it most clearly.\n• What is the most important unique insight about this candidate that cannot be seen from scores alone?"
  },

  "strategic_verdict": {
    "decision": "Hire" | "Maybe" | "Do Not Hire",
    "summary": "2–3 sentence strategic overview",
    "rationale": ["Evidence-backed point 1", "Evidence-backed point 2"],
    "next_actions": ["Specific next action with context"]
  },

  "integrity": {
    "score": number (0–100),
    "summary": "Specific summary citing event counts and any correlation with answer quality"
  },

  "skills_proof": [
    {
      "skill": "Exact skill name as discussed (e.g. 'React', 'System Design', 'SQL', 'Leadership', 'REST APIs')",
      "status": "PROVED" | "PARTIAL" | "NOT PROVED" | "NOT TESTED",
      "score": "X/10",
      "what_they_showed": "1–2 sentences: what the candidate demonstrated — specific implementation detail, example, or decision they described. Quote or close paraphrase.",
      "what_was_missing": "1–2 sentences: what was weak, surface-level, or absent. If nothing was missing, write 'Fully demonstrated — no gaps identified.'"
    }
  ]
}

SKILLS_PROOF RULES:
- Include EVERY skill mentioned anywhere in the transcript — from resume claims, interviewer questions, or candidate answers
- Minimum 6 skills. If the interview covered fewer than 6, include skills implied by the role JD
- Score strictly: 8–10 = deep hands-on proof with specific details, 5–7 = partial or surface-level, 1–4 = claimed but not demonstrated, 0 = not tested
- Never give a skill 7+ unless the candidate gave specific implementation evidence (not just definitions)
- Status must match score: PROVED = 7+, PARTIAL = 4–6, NOT PROVED = 1–3, NOT TESTED = 0

---

RULES:

1. QA_BLOCKS — What counts as a real interview question:
   Include ONLY questions that ask the candidate to demonstrate knowledge, share experience, or explain something meaningful.
   SKIP: greetings ("How are you?"), setup questions ("Is your audio working?"), small talk, and the interviewer's own transition statements.
   The first real question is typically about background, experience, skills, or projects.
   Every qa_block MUST have a full score_breakdown with all 4 dimensions.

2. DEMONSTRATED_COMPETENCY SCORE — Core methodology:
   This replaces a narrow "technical_score". It measures how well the candidate demonstrated their capabilities across ALL these axes:
   - Project & Implementation Knowledge: Did they describe what they actually built, how it worked, what decisions they made?
   - Technical Understanding: Did they explain WHY they made choices, not just WHAT they did?
   - Architecture Thinking: Did they mention trade-offs, scalability, failure modes, or design decisions?
   - Debugging & Problem-Solving: Did they share specific debugging stories, root cause analysis, or recovery strategies?
   - Breadth vs Depth: Did they show breadth across the role's domain or deep expertise in core areas?
   - Practical Confidence: Did they speak from experience or theory?

   Scoring:
   - 80–100: Deep, specific, multi-layered answers. Mentioned concrete implementation details, real trade-offs, named technologies correctly. Clearly has hands-on experience.
   - 60–79: Good practical knowledge with some gaps. Explained most concepts correctly with real examples but missed depth in 1–2 areas.
   - 40–59: Moderate — has some experience, answers are surface-level in key areas. Knows the vocabulary but struggles with implementation details.
   - 20–39: Limited hands-on knowledge. Mostly theoretical. Could not explain implementation details when probed.
   - 0–19: Very limited. Generic answers with no specific examples. Could not demonstrate any meaningful domain knowledge.

   DO NOT give a low score just because you didn't ask a formal JD-aligned coding question. Evaluate what the candidate DID demonstrate about their capabilities.
   DO NOT use only qa_block depth scores — look at the full picture across ALL answers.

3. SKILLS_PROOF — Extract every skill discussed, mentioned, or probed in the interview. If a skill appeared in the transcript (even informally), include it. Status must reflect actual performance — not JD alignment.

4. BEHAVIORAL_ANALYSIS — Minimum 4 bullets per section. Every bullet must follow the exact format. Base signals on REAL interview content, not greetings.

5. VERDICT.summary — 200–300 words, evidence-backed. Cite specific answers.

6. AI_SUMMARY_CONCISE — EXACTLY 4 bullets (•). Each is ONE plain sentence — a specific, factual observation grounded in the transcript. NO label prefixes (no "**Demonstrated Capability**:" etc). NO scores, percentages, communication observations, or hiring recommendation. Bold (**text**) only the single most important word or phrase per bullet. Vague adjectives forbidden unless immediately followed by specific evidence.

7. INTEGRITY — Score 100 if no events. Deduct per event, not per type.

8. COGNITIVE INSIGHTS — All _evidence fields required. Cite specific questions/answers from the SUBSTANTIVE interview (not greetings). adaptability is a required dimension.

9. RECOMMENDATION — "Strong Yes" only for exceptional candidates. "No" for clear failures. Be honest.

10. _meta.is_fallback must always be false.

11. NEVER write generic phrases: "showed knowledge", "good answer", "demonstrated skill", "communicated well". Be specific — cite what was said. NEVER use em dashes (—) or en dashes (–) anywhere in your output. Use a period or comma instead.

12. COMMUNICATION — Score all 4 dimensions independently using the exact counting and signal methodology defined in the schema. Do NOT give all 4 the same score. Before scoring, ACTUALLY COUNT: filler word instances (um, uh, like, you know, basically, sort of, kind of, I mean), hedging phrases (I think, maybe, I guess, not sure, kind of, sort of, I suppose, probably, might be), grammar errors (subject-verb disagreement, tense inconsistency, sentence fragments, missing articles), and broken/restarted phrases. Use these counts to derive scores per the scale defined in each dimension. A spread of 20–40 points across dimensions is normal. Score the FULL interview, including casual exchanges, not just formal answers.

13. SCORE_BREAKDOWN per qa_block — Use all 4 dimensions: technical_accuracy, depth, clarity, practical_application. The overall "score" for the block is the average of these 4 × 10. Do not just assign an overall score and ignore breakdown.

14. ROLE FIT context — Role fit is computed by the system from demonstrated_competency + behavioral_score. Your job is to make those two scores accurate. Do not game them.
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional recruitment AI. Output ONLY valid JSON matching the exact schema. All fields required. No markdown fences. No explanation outside JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.15,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const data = JSON.parse(content);
    if (!data._meta) data._meta = { is_fallback: false, generated_at: new Date().toISOString() };
    data._meta.is_fallback = false;

    // Migrate old score key name if AI used it
    if (data.scores && data.scores.technical_score !== undefined && data.scores.demonstrated_competency === undefined) {
      data.scores.demonstrated_competency = data.scores.technical_score;
    }

    console.log(`[INTERVIEW_ANALYSIS] Report generated for ${candidateName}`);
    return {
      data,
      usage: {
        model: response.model || "gpt-4o",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        cachedInputTokens: (response.usage as any)?.prompt_tokens_details?.cached_tokens || 0,
      },
    };
  } catch (error: any) {
    console.error("[INTERVIEW_ANALYSIS_FATAL]:", error.message);
    return { data: generateFallbackReport(candidateName, role, "AI analysis encountered an error."), usage: null };
  }
}

function generateFallbackReport(name: string, role: string, reason = "Internal processing error.") {
  return {
    _meta: { is_fallback: true, generated_at: new Date().toISOString(), reason },
    scores: {
      combined_score: 0,
      demonstrated_competency: 0,
      communication_score: 0,
      behavioral_score: 0,
      cognitive_score: 0,
      integrity_score: 100,
    },
    qa_blocks: [],
    recording: { summary: "Transcript captured. AI analysis unavailable — manual review required." },
    communication: {
      clarity: 0, structured_thinking: 0, confidence: 0, response_flow: 0,
      filler_usage: 0, conciseness: 0, context_understanding: 0,
      technical_articulation: 0, follow_up_handling: 0,
      summary: "Communication evaluation pending — manual review of recording recommended.",
    },
    cognitive_insights: {
      clarity: 0, clarity_evidence: "Unable to evaluate.",
      depth_of_knowledge: 0, depth_evidence: "Unable to evaluate.",
      problem_solving: 0, problem_solving_evidence: "Unable to evaluate.",
      logical_thinking: 0, logical_thinking_evidence: "Unable to evaluate.",
      adaptability: 0, adaptability_evidence: "Unable to evaluate.",
      summary: "Cognitive evaluation requires manual review.",
    },
    behavioral_analysis: {
      overview: "Automated behavioral analysis unavailable. Manual review required.",
      engagement_signals: [],
      consistency_signals: [],
      communication_patterns: [],
      confidence_indicators: [],
      integrity_flags: [],
      strengths_observed: [],
      concerns_noted: [],
      summary: "This interview requires human assessment.",
    },
    verdict: {
      summary: `AI analysis for ${name} (${role}) could not be completed. ${reason}`,
      recommendation: "Maybe",
      recommendation_reason: "Manual review required.",
      ai_summary_concise: "",
    },
    strategic_verdict: {
      decision: "Maybe",
      summary: "Automated analysis failed. Human review required.",
      rationale: ["AI report generation failed — transcript is available for manual review."],
      next_actions: ["Review interview recording and transcript manually"],
    },
    integrity: { score: 100, summary: "No automated integrity analysis available." },
    skills_proof: [],
  };
}

/**
 * Recomputes all scores from AI report evidence. Called after AI returns, before DB persist.
 * Uses demonstrated_competency (new) with fallback to technical_score (old schema).
 */
export function computeEnrichedInterviewScore(report: Record<string, any>): {
  combined_score: number;
  technical_score: number;   // kept as DB field name for compatibility
  communication_score: number;
  behavioral_score: number;
  cognitive_score: number;
  integrity_score: number;
} {
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  const safeAvg = (nums: number[]) =>
    nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

  // ── Demonstrated Competency (replaces narrow technical_score) ─────────────
  // Primary: AI's demonstrated_competency → fallback: technical_score → fallback: derive from qa_blocks
  let demonstratedCompetency: number;
  const aiDC = Number(report?.scores?.demonstrated_competency ?? report?.scores?.technical_score);
  if (Number.isFinite(aiDC) && aiDC > 0) {
    demonstratedCompetency = clamp(aiDC);
  } else {
    // Derive from qa_blocks: average of all 4 score_breakdown dimensions per block
    const qaBlocks: any[] = Array.isArray(report?.qa_blocks) ? report.qa_blocks : [];
    const blockScores = qaBlocks.map((b: any) => {
      const sb = b?.score_breakdown || {};
      const dims = [
        Number(sb.technical_accuracy ?? sb.depth ?? 0),
        Number(sb.depth ?? 0),
        Number(sb.clarity ?? 0),
        Number(sb.practical_application ?? sb.confidence ?? 0),
      ].filter((n) => Number.isFinite(n) && n > 0);
      return dims.length > 0 ? (dims.reduce((a, x) => a + x, 0) / dims.length) * 10 : null;
    }).filter((n): n is number => n !== null);

    const blockAvg = safeAvg(blockScores);
    if (blockAvg !== null) {
      demonstratedCompetency = clamp(blockAvg);
    } else {
      // Last resort: parse "X/10" scores
      const rawScores = qaBlocks
        .map((b: any) => {
          const s = String(b?.score || "");
          const m = s.match(/^(\d+(?:\.\d+)?)\/10$/);
          return m ? parseFloat(m[1]) * 10 : parseFloat(s.replace(/[^\d.]/g, "")) || 0;
        })
        .filter((n) => n > 0);
      demonstratedCompetency = safeAvg(rawScores) !== null ? clamp(safeAvg(rawScores)!) : 0;
    }
  }

  // ── Communication (4 dimensions: pronunciation, grammar, fluency, confidence) ──
  const comm = report?.communication || {};
  const commDims = ["pronunciation", "grammar", "fluency", "confidence"]
    .map((k) => Number(comm[k])).filter((n) => Number.isFinite(n) && n > 0);

  const communicationScore = commDims.length > 0
    ? clamp(safeAvg(commDims)!)
    : clamp(Number(report?.scores?.communication_score) || 0);

  // ── Behavioral ─────────────────────────────────────────────────────────────
  const behavioralScore = clamp(Number(report?.scores?.behavioral_score) || 0);

  // ── Cognitive (5-dimension average) ───────────────────────────────────────
  const cog = report?.cognitive_insights || {};
  const cogDims = [
    Number(cog.clarity), Number(cog.depth_of_knowledge),
    Number(cog.problem_solving), Number(cog.logical_thinking),
    Number(cog.adaptability),
  ].filter((n) => Number.isFinite(n) && n > 0);
  const cognitiveScore = cogDims.length > 0
    ? clamp(safeAvg(cogDims)!)
    : clamp(Number(report?.scores?.cognitive_score) || 0);

  // ── Integrity ──────────────────────────────────────────────────────────────
  const integrityScore = clamp(Number(report?.integrity?.score ?? 100));

  // ── Combined (new weights) ─────────────────────────────────────────────────
  const combinedScore = clamp(
    demonstratedCompetency * 0.35 +
    communicationScore     * 0.25 +
    behavioralScore        * 0.20 +
    cognitiveScore         * 0.15 +
    integrityScore         * 0.05
  );

  return {
    combined_score: combinedScore,
    technical_score: demonstratedCompetency,   // DB column keeps old name
    communication_score: communicationScore,
    behavioral_score: behavioralScore,
    cognitive_score: cognitiveScore,
    integrity_score: integrityScore,
  };
}
