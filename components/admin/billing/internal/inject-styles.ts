import { INK, INK_2, LINE_2, ORANGE_DEEP } from "./tokens";

export function injectBillingAnimStyles() {
  if (typeof document === "undefined" || document.getElementById("billing-anim")) return;
  const s = document.createElement("style");
  s.id = "billing-anim";
  s.textContent = `
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes popIn { from { opacity: 0; transform: scale(.96) translateY(4px) } to { opacity: 1; transform: scale(1) translateY(0) } }
    @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
    .row-hover:hover { background: ${LINE_2} !important; }
    .ghost-btn:hover { background: ${LINE_2} !important; }
    .primary-btn:hover { background: ${ORANGE_DEEP} !important; }
    .ink-btn:hover { background: ${INK_2} !important; }
    .icon-btn:hover { background: ${LINE_2} !important; color: ${INK} !important; }
  `;
  document.head.appendChild(s);
}
