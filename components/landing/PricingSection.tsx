import React from 'react';
import { motion } from 'framer-motion';

const plans = [
  {
    name: "Starter",
    tag: "For teams piloting AI screening on 1–2 roles.",
    price: "$99",
    features: ["30 interviews included", "1 active drive", "Top-up: $4.00/interview"],
    cta: "Book Demo",
    isPopular: false
  },
  {
    name: "Growth",
    tag: "For teams hiring across multiple roles each month.",
    price: "$299",
    features: ["100 interviews included", "5 active drives", "Top-up: $3.00/interview"],
    cta: "Book Demo",
    isPopular: true
  },
  {
    name: "Scale",
    tag: "For high-volume hiring or agencies.",
    price: "$699",
    features: ["300 interviews included", "10 active drives", "Top-up: $2.50/interview"],
    cta: "Book Demo",
    isPopular: false
  },
  {
    name: "Business",
    tag: "Custom pricing for enterprise teams.",
    price: "Custom",
    features: ["600+ interviews", "Unlimited active drives", "Top-up: Custom"],
    cta: "Talk to Us",
    isPopular: false
  }
];

const features = [
  { name: "Interviews / month", starter: "30", growth: "100", scale: "300", business: "600+" },
  { name: "Active drives", starter: "1", growth: "5", scale: "10", business: "Unlimited" },
  { name: "Resume screening", starter: true, growth: true, scale: true, business: true },
  { name: "Adaptive AI Interview", starter: true, growth: true, scale: true, business: true },
  { name: "Smart follow-ups", starter: true, growth: true, scale: true, business: true },
  { name: "AI Interview Report", starter: true, growth: true, scale: true, business: true },
  { name: "Integrity & proctoring", starter: "—", growth: "Basic", scale: "Advanced", business: "Advanced + custom policies" },
  { name: "Recording storage", starter: "7 days", growth: "14 days", scale: "30 days", business: "Custom" },
  { name: "Support", starter: "Email", growth: "Priority email", scale: "Priority + onboarding assist", business: "Dedicated CSM" },
  { name: "ATS integrations", starter: "Coming soon", growth: "Coming soon", scale: "Coming soon", business: "Coming soon (priority access)" },
  { name: "Multilingual interviews", starter: "Coming soon", growth: "Coming soon", scale: "Coming soon", business: "Coming soon (early pilots)" },
];

export default function PricingSection() {
  const renderValue = (val: string | boolean) => {
    if (typeof val === 'boolean') {
      return val ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-500 mx-auto"><path d="M20 6 9 17l-5-5"/></svg>
      ) : (
        <span className="text-gray-300">—</span>
      );
    }
    return <span className="text-gray-900 font-medium">{val}</span>;
  };

  return (
    <section className="py-32 bg-white font-geist border-t border-gray-100/60" id="pricing">
      <div className="max-w-[1280px] mx-auto px-6">
        
        <div className="max-w-3xl mb-24 text-center mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="flex items-center gap-3 mb-6"
          >
            <span className="inline-flex items-center px-4 py-1.5 bg-white border border-gray-200 shadow-sm text-gray-900 rounded-full text-[11px] font-extrabold uppercase tracking-widest">Pricing</span>
          </motion.div>
          <motion.h2 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-[3.5rem] lg:text-[4.5rem] font-bold text-[#111111] leading-[1.05] tracking-[-0.02em] mb-8"
          >
            Pay per screen.<br/>
            Not per headcount.
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="text-xl md:text-[22px] text-gray-500 leading-[1.6] max-w-2xl font-medium"
          >
            One Sreeva screen costs less than 30 minutes of a senior engineer's time. The math is obvious.
          </motion.p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-32">
          {plans.map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className={`relative rounded-[32px] p-8 flex flex-col h-full bg-white transition-all duration-500 group ${
                plan.isPopular 
                  ? 'border border-violet-500/50 shadow-soft hover:shadow-diffused ring-1 ring-violet-500/20 xl:-translate-y-4 hover:xl:-translate-y-6 hover:-translate-y-2' 
                  : 'border border-hairline hover:shadow-diffused hover:-translate-y-2'
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 inset-x-0 flex justify-center">
                  <span className="bg-violet-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1 rounded-full shadow-sm">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-[22px] font-bold text-gray-900 mb-2 tracking-tight">{plan.name}</h3>
                <p className="text-[14px] text-gray-500 font-medium leading-[1.6]">{plan.tag}</p>
              </div>

              <div className="mb-8 pb-8 border-b border-gray-100">
                <div className="flex items-end gap-1">
                  <span className="text-[44px] font-extrabold text-gray-900 tracking-tighter leading-none">{plan.price}</span>
                  {plan.price !== 'Custom' && <span className="text-gray-400 font-bold mb-1">/mo</span>}
                </div>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                {plan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" className="text-emerald-500 flex-shrink-0 mt-0.5"><path d="M20 6 9 17l-5-5"/></svg>
                    <span className="text-[14px] text-gray-900 font-medium leading-tight">{feat}</span>
                  </li>
                ))}
              </ul>

              <button className={`w-full py-4 rounded-full font-bold text-[14px] transition-all duration-300 ${
                plan.isPopular 
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-soft group-hover:shadow-diffused group-hover:scale-[1.02]' 
                  : 'bg-white border border-hairline text-gray-900 group-hover:border-violet-200 group-hover:bg-violet-50 group-hover:text-violet-700'
              }`}>
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>

        {/* Detailed Feature Comparison */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="max-w-[1080px] mx-auto"
        >
          <div className="text-center mb-12">
            <h4 className="text-[28px] font-bold text-gray-900 mb-3 tracking-tight">Detailed feature comparison</h4>
            <span className="text-gray-500 font-medium text-[15px]">All plans include adaptive AI, smart follow-ups, JD-grounded questions.</span>
          </div>

          <div className="overflow-x-auto pb-8">
            <table className="w-full text-left min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-6 px-4 font-bold text-[13px] text-gray-400 uppercase tracking-widest w-[28%]">Feature</th>
                  <th className="py-6 px-4 text-center font-bold text-[15px] text-gray-900 w-[18%]">Starter</th>
                  <th className="py-6 px-4 text-center font-bold text-[15px] text-violet-600 w-[18%] relative">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-violet-600"></div>
                    Growth
                  </th>
                  <th className="py-6 px-4 text-center font-bold text-[15px] text-gray-900 w-[18%]">Scale</th>
                  <th className="py-6 px-4 text-center font-bold text-[15px] text-gray-900 w-[18%]">Business</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {features.map((feat, i) => (
                  <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4 text-[14px] font-bold text-gray-900">{feat.name}</td>
                    <td className="py-4 px-4 text-center text-[14px]">{renderValue(feat.starter)}</td>
                    <td className="py-4 px-4 text-center text-[14px] bg-violet-50/20">{renderValue(feat.growth)}</td>
                    <td className="py-4 px-4 text-center text-[14px]">{renderValue(feat.scale)}</td>
                    <td className="py-4 px-4 text-center text-[14px]">{renderValue(feat.business)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
