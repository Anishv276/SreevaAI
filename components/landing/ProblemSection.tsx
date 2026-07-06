import React from 'react';

const problems = [
  {
    title: "Unqualified candidates advance.",
    desc: "They pass keyword screens and waste your hiring manager's time in deep interviews.",
    stat: "42%",
    statDesc: "of resumes contain claims with no supporting evidence."
  },
  {
    title: "Questions lack depth.",
    desc: "Every interviewer asks something different. No one digs deep enough, no one stays consistent.",
    stat: "3.4x",
    statDesc: "variance between two interviewers on the same role."
  },
  {
    title: "Resume skills don't stick.",
    desc: "Candidates claim expertise. The first follow-up exposes them repeating resume language verbatim.",
    stat: "1 in 3",
    statDesc: "\"expert\" claims collapse on the second probe."
  }
];

export default function ProblemSection() {
  return (
    <section className="py-32 bg-white font-geist text-gray-900 border-t border-gray-100" id="problem">
      <div className="max-w-[1280px] mx-auto px-6">
        
        {/* Header */}
        <div className="max-w-3xl mb-20 text-center mx-auto flex flex-col items-center">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-2 h-2 rounded-full bg-violet-600"></span>
            <span className="text-violet-600 font-bold uppercase tracking-widest text-[13px]">The problem</span>
          </div>
          <h2 className="text-[3rem] lg:text-[4rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-6">
            Resumes <span className="text-gray-400 font-normal italic">lie.</span><br/>
            Interviewers <span className="text-gray-400 font-normal italic">guess.</span><br/>
            Your team <span className="text-gray-400 font-normal italic">burns out.</span>
          </h2>
          <p className="text-xl text-gray-500 leading-[1.6] font-medium max-w-2xl">
            Scripted questions can't catch what candidates are hiding. Your interviewers aren't asking at the same depth. And one bad hire is costing you more than you think.
          </p>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10">
          {problems.map((prob, i) => (
            <div key={i} className="bg-[#FDFDFD] border border-gray-200/80 rounded-3xl p-8 lg:p-10 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.06)] transition-all duration-300 flex flex-col group">
              <div className="w-12 h-12 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 font-bold text-[14px] mb-8 group-hover:bg-violet-600 group-hover:text-white transition-colors duration-300">
                0{i + 1}
              </div>
              <h3 className="text-[22px] font-bold text-gray-900 mb-4 tracking-tight leading-tight">{prob.title}</h3>
              <p className="text-[16px] text-gray-500 font-medium leading-[1.6] mb-12 flex-1">
                {prob.desc}
              </p>
              <div className="pt-8 border-t border-gray-100 flex flex-col">
                <span className="text-[36px] font-extrabold text-gray-900 tracking-tighter mb-1 leading-none">{prob.stat}</span>
                <span className="text-[13px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed max-w-[200px]">{prob.statDesc}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
