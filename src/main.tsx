import { createRoot } from "react-dom/client";
import "@fontsource/tiny5";
import "@fontsource/press-start-2p";
import "./styles.css";
import "./board/board.css";
import App from "./App";

function syncPixel() {
  const dpr = window.devicePixelRatio || 1;
  const p = Math.max(1, Math.round(3 * dpr)) / dpr;
  document.documentElement.style.setProperty("--p", `${p}px`);
}
syncPixel();
window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.("change", syncPixel);
window.addEventListener("resize", syncPixel);

window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("input, textarea")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);
