"use client";
import React from "react";
import { cn } from "@/lib/utils";

// USD/INR currency toggle + formatter, ported from the old Consumption Hub modal
// (app/super-admin/orgs/page.tsx). Persists choice to localStorage and fetches
// the live rate from /api/super-admin/exchange-rate (1h cached server-side).

type Currency = "USD" | "INR";
const STORAGE_KEY = "super-admin-org-currency";

export function useCurrency() {
  const [currency, setCurrency] = React.useState<Currency>("USD");
  const [usdToInr, setUsdToInr] = React.useState<number>(84.5);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "USD" || saved === "INR") setCurrency(saved);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, currency);
    } catch {
      /* ignore */
    }
  }, [currency]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/super-admin/exchange-rate");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.rate) setUsdToInr(Number(data.rate));
        }
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmt = React.useCallback(
    (usd: number | null | undefined) => {
      const v = Number(usd || 0);
      if (currency === "INR") {
        const inr = v * usdToInr;
        return `₹${inr < 1 && inr > 0 ? inr.toFixed(2) : inr.toFixed(0)}`;
      }
      if (v === 0) return "$0.00";
      if (Math.abs(v) < 0.005) return `$${v.toFixed(4)}`;
      return `$${v.toFixed(2)}`;
    },
    [currency, usdToInr]
  );

  return { currency, setCurrency, usdToInr, fmt };
}

export function CurrencyToggle({
  currency,
  setCurrency,
}: {
  currency: Currency;
  setCurrency: (c: Currency) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-[#E9E7FF] bg-white p-0.5 text-[11px] font-semibold">
      {(["USD", "INR"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setCurrency(c)}
          className={cn(
            "rounded-lg px-3 py-1.5 transition-colors",
            currency === c ? "bg-[#7C3AED] text-white" : "text-gray-500 hover:text-gray-800"
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
