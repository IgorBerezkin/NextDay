import { createRoot } from "react-dom/client";
import "@fontsource/tiny5";
import "@fontsource/press-start-2p";
import "../styles.css";
import "./installer.css";
import Installer from "./Installer";

const dpr = window.devicePixelRatio || 1;
document.documentElement.style.setProperty("--p", `${Math.max(1, Math.round(3 * dpr)) / dpr}px`);
window.addEventListener("contextmenu", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(<Installer />);
