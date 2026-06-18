"use client";
import React from "react";
export function useCount(target: number, deps: React.DependencyList, duration = 800) {
  const [v, setV] = React.useState(target);
  const first = React.useRef(true);
  React.useEffect(() => {
    let raf = 0;
    let start: number | undefined;
    const from = first.current ? 0 : v;
    first.current = false;
    const tick = (t: number) => {
      if (start === undefined) start = t;
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - k) ** 3;
      setV(from + (target - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate on deps only (billing prototype)
  }, deps);
  return v;
}
