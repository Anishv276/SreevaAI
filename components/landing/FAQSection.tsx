const FAQS = [
  {
    q: "Is this a real conversation or pre-recorded questions?",
    a: "It's a live voice call. Ishitha, Sreeva's AI interviewer, joins the call and conducts the interview in real time. Every question is generated from what the candidate just said. There are no scripts, no fixed question banks, no branching logic. The conversation is genuinely different for every candidate.",
  },
  {
    q: "Does the AI make the hiring decision, or do we?",
    a: "You do. Sreeva gives you a structured recommendation backed by evidence from the transcript, not a pass/fail verdict. Your team makes the final call. The report is designed to make that decision faster and more defensible, not to replace it.",
  },
  {
    q: "Is every candidate scored the same way, or can the AI be inconsistent or biased?",
    a: "Every candidate is scored against the same rubric: clarity, depth, specificity, and grounding, applied through the same evaluation process regardless of who they are. The rubric adjusts for experience level (a fresher and a senior engineer aren't held to identical bars) but never for anything else. Unlike a panel of human interviewers, Ishitha doesn't get tired, distracted, or friendlier by the fifth call of the day.",
  },
  {
    q: "What happens if the call drops or a candidate has technical issues?",
    a: "The call auto-reconnects on brief network drops, and a hardware check runs before the interview starts to catch camera/mic issues early. If a candidate's connection fails badly enough that the interview can't be completed, you can reschedule them for a fresh session from your dashboard, no reset process, no lost report for the parts that did complete.",
  },
  {
    q: "How does it catch cheating or impersonation?",
    a: "Sreeva monitors 12 behavioral and technical signals throughout the call, including attention patterns, audio anomalies, and response cadence shifts, combined into a single integrity score. Beyond signals, the adaptive follow-ups themselves expose candidates who can't defend what they claimed: there's no way to script your way through a depth probe.",
  },
  {
    q: "What does the report actually contain?",
    a: "A combined score (0-100), per-skill breakdown with individual scores, a Hire / Hold / Reject recommendation with reasoning, verbatim evidence quotes pulled directly from the transcript with timestamps, behavioral analysis, and an integrity score. Everything your panel needs to make a decision, without sitting in a call.",
  },
  {
    q: "What happens to interview recordings, and who can access them?",
    a: "Recordings are stored securely and only your organization's team can access them. Retention length is configurable by your admin (a fixed number of days after the interview), after which recordings are deleted automatically. Candidates are shown a clear consent screen before the interview starts, disclosing that the session is recorded, and must agree before the call begins.",
  },
  {
    q: "How is this priced, is there a free trial?",
    a: "Sreeva runs on a credit-based plan sized to your hiring volume, not a flat per-seat subscription. There's no self-serve signup: book a demo and we'll size a plan around how many roles and candidates you're actually screening, and you can see the product on a real role from your pipeline before committing.",
  },
  {
    q: "Does this replace our final-round interviews?",
    a: "No. Sreeva handles the first-round screen, the call that usually costs a senior team member 60-90 minutes per candidate. It filters out candidates who can't back up their resume, so your team's final-round time goes to candidates who are actually worth a deeper conversation.",
  },
  {
    q: "How long does it take to set up a role, and how do candidates join?",
    a: "Under 5 minutes on your end: upload the JD, review the extracted skills, invite candidates. The first interview can go out the same day. Candidates get a link by email, pick a slot that works for them, and join from their browser. No app to download, no account to create.",
  },
];

export default function FAQSection() {
  return (
    <section className="faq" id="faq" data-section-anchor="faq" aria-label="Frequently asked questions about Sreeva AI"
      itemScope itemType="https://schema.org/FAQPage">
      <div className="shell faq-shell">
        <div className="faq-l">
          <h2 className="display-h2" data-words data-reveal>
            Frequently<br />asked <span className="ital" style={{ color: "var(--primary)" }}>questions.</span>
          </h2>
          <p className="lede" data-reveal data-delay="2">Can&apos;t find an answer? <a href="mailto:support@sreevaai.com"
            className="link-u">support@sreevaai.com</a></p>
        </div>
        <div className="faq-r" id="faqWrap">
          {FAQS.map((item, i) => (
            <div className="faq-item" data-reveal key={i} itemScope itemProp="mainEntity" itemType="https://schema.org/Question">
              <button className="faq-q" aria-expanded="false">
                <span className="qn"><span className="n">{String(i + 1).padStart(2, "0")}</span><span className="qt" itemProp="name">{item.q}</span></span>
                <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className="faq-a" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                <div className="faq-a-inner" itemProp="text">{item.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
