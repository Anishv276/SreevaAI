"use client";

import { useState, useMemo } from "react";

const WORKING_DAYS_PER_MONTH = 20;

function formatHoursMinutes(totalMinutes: number) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatMoney(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export default function RoiSection() {
  const [teamSize, setTeamSize] = useState(8);
  const [callsPerDay, setCallsPerDay] = useState(4);
  const [avgCallLength, setAvgCallLength] = useState(30);
  const [reviewTime, setReviewTime] = useState(15);
  const [hourlyCost, setHourlyCost] = useState(600);

  const { hoursBack, moneyBack, callsPerMonth } = useMemo(() => {
    // Ishitha conducts the call and writes the report, so the full call time
    // plus the notes/review time your team currently spends disappears.
    const currentMinutesPerCall = Number(avgCallLength) + Number(reviewTime);
    const calls = Number(teamSize) * Number(callsPerDay) * WORKING_DAYS_PER_MONTH;
    const minutesSaved = currentMinutesPerCall * calls;
    const hoursSaved = minutesSaved / 60;
    const money = hoursSaved * Number(hourlyCost);
    return {
      hoursBack: formatHoursMinutes(minutesSaved),
      moneyBack: formatMoney(money),
      callsPerMonth: calls,
    };
  }, [teamSize, callsPerDay, avgCallLength, reviewTime, hourlyCost]);

  const slider = (
    label: string,
    value: number,
    setValue: (v: number) => void,
    min: number,
    max: number,
    step: number,
    suffix: string
  ) => (
    <div className="roi-field">
      <div className="roi-field-top">
        <span className="roi-field-label">{label}</span>
        <span className="roi-field-value">{value}{suffix}</span>
      </div>
      <input
        type="range"
        className="roi-field-slider"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ "--roi-fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      />
    </div>
  );

  return (
    <section className="roi" id="roi" data-section-anchor="roi" aria-label="Time and cost savings calculator">
      <div className="shell">
        <div className="sec-head" style={{ textAlign: "center", margin: "0 auto 48px" }}>
          <span className="eyebrow roi-eyebrow" data-reveal>Talent team calculator</span>
          <h2 className="display-h2" data-words data-reveal>
            What screening is <span className="ital" style={{ color: "var(--primary)" }}>actually costing</span> your team.
          </h2>
          <p className="lede" data-reveal data-delay="2" style={{ marginLeft: "auto", marginRight: "auto" }}>
            Drag the sliders to match how your talent team runs first-round calls today.
          </p>
        </div>

        <div className="roi-panel" data-reveal>
          <div className="roi-inputs">
            {slider("Talent team headcount", teamSize, setTeamSize, 1, 100, 1, "")}
            {slider("First-round calls per recruiter, per day", callsPerDay, setCallsPerDay, 1, 20, 1, "")}
            {slider("Average call length", avgCallLength, setAvgCallLength, 10, 90, 5, " min")}
            {slider("Notes + writeup time after each call", reviewTime, setReviewTime, 0, 60, 5, " min")}
            {slider("Fully-loaded recruiter cost", hourlyCost, setHourlyCost, 200, 3000, 50, "/hr")}
          </div>

          <div className="roi-result">
            <div className="roi-result-block">
              <span className="roi-result-label">Recruiter hours freed, per month</span>
              <span className="roi-result-value">{hoursBack}</span>
            </div>
            <div className="roi-result-divider"></div>
            <div className="roi-result-block">
              <span className="roi-result-label">Cost recovered, per month</span>
              <span className="roi-result-value roi-result-value-money">{moneyBack}</span>
            </div>
            <span className="roi-result-sub">across {callsPerMonth.toLocaleString()} first-round calls a month, run and written up by Ishitha instead of your team</span>
          </div>
        </div>
      </div>
    </section>
  );
}
