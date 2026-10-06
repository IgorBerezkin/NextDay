import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

type Phase = "night" | "dawn" | "day" | "dusk";

const BANDS: Record<Phase, string[]> = {
  night: ["#0d0e1a", "#11132a", "#151a36", "#1a2043", "#1f2750", "#242f5c"],
  dawn: ["#29366f", "#3b5dc9", "#6d7fcf", "#b98aa6", "#ef9d77", "#ffcd75"],
  day: ["#2f6fd8", "#3b86e8", "#41a6f6", "#56b8f7", "#6ccaf7", "#94dcf6"],
  dusk: ["#1a2043", "#29366f", "#5d275d", "#8e3352", "#c4504e", "#ef7d57"],
};
const GROUND: Record<Phase, string> = { night: "#0b0c16", dawn: "#1a1c2c", day: "#257179", dusk: "#14152a" };
const HOUSE: Record<Phase, string> = { night: "#141629", dawn: "#29366f", day: "#1a1c2c", dusk: "#1a1c2c" };

function phaseOf(h: number): Phase {
  if (h >= 21 || h < 5) return "night";
  if (h < 8) return "dawn";
  if (h < 18) return "day";
  return "dusk";
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PX = 3;

export function Sky({ hour }: { hour: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = phaseOf(hour);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    let W = 0;
    let H = 0;
    let stars: { x: number; y: number; ph: number; c: string; big: boolean }[] = [];
    let houses: { x: number; w: number; h: number; roof: number; lights: { x: number; y: number; ph: number }[] }[] = [];
    let clouds: { x: number; y: number; w: number; speed: number }[] = [];

    const setup = () => {
      W = Math.ceil(window.innerWidth / PX);
      H = Math.ceil(window.innerHeight / PX);
      cv.width = W;
      cv.height = H;
      const r = rng(7);
      stars = [];
      const count = Math.round((W * H) / 260);
      for (let i = 0; i < count; i++) {
        const y = Math.floor(Math.pow(r(), 1.6) * H * 0.85);
        stars.push({
          x: Math.floor(r() * W),
          y,
          ph: r() * Math.PI * 2,
          c: r() < 0.15 ? "#73eff7" : r() < 0.25 ? "#ffcd75" : "#f4f4f4",
          big: r() < 0.08,
        });
      }
      houses = [];
      let x = 0;
      const hr = rng(42);
      while (x < W) {
        const w = 5 + Math.floor(hr() * 8);
        const h = 3 + Math.floor(hr() * 4);
        const lights: { x: number; y: number; ph: number }[] = [];
        for (let ly = 1; ly < h - 1; ly += 2)
          for (let lx = 1; lx < w - 1; lx += 3) if (hr() < 0.4) lights.push({ x: lx, y: ly, ph: hr() * 100 });
        houses.push({ x, w, h, roof: hr() < 0.5 ? Math.floor(w / 2) : 0, lights });
        x += w + Math.floor(hr() * 4);
      }
      const cr = rng(99);
      clouds = Array.from({ length: Math.max(3, Math.round(W / 90)) }, () => ({
        x: cr() * W,
        y: 3 + Math.floor(cr() * Math.min(40, H * 0.4)),
        w: 10 + Math.floor(cr() * 18),
        speed: 0.02 + cr() * 0.03,
      }));
    };

    let shown = true;
    const unlisten = listen<boolean>("window-visibility", (e) => {
      shown = e.payload;
    });

    const draw = (t: number) => {
      if (document.hidden || !shown || !W) return;
      const bands = BANDS[phase];
      const n = bands.length;
      const bh = H / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = bands[i];
        ctx.fillRect(0, Math.floor(i * bh), W, Math.ceil(bh) + 1);
      }
      for (let i = 1; i < n; i++) {
        const y0 = Math.floor(i * bh);
        ctx.fillStyle = bands[i];
        for (let x = 0; x < W; x += 2) ctx.fillRect(x, y0 - 2, 1, 1);
        ctx.fillStyle = bands[i - 1];
        for (let x = 1; x < W; x += 2) ctx.fillRect(x, y0, 1, 1);
      }

      const sec = t / 1000;
      if (phase === "night" || phase === "dusk") {
        for (const s of stars) {
          if (phase === "dusk" && s.y > H * 0.35) continue;
          const tw = Math.sin(sec * 1.3 + s.ph);
          if (tw < -0.75) continue;
          ctx.fillStyle = s.c;
          ctx.fillRect(s.x, s.y, 1, 1);
          if (s.big && tw > 0.55) {
            ctx.fillRect(s.x - 1, s.y, 3, 1);
            ctx.fillRect(s.x, s.y - 1, 1, 3);
          }
        }
        drawMoon(ctx, Math.floor(W * 0.74), 3);
      } else {
        drawSun(ctx, Math.floor(W * 0.74), 3, phase === "dawn");
        for (const c of clouds) {
          const cx = Math.floor(((c.x + sec * c.speed * 10) % (W + 40)) - 20);
          drawCloud(ctx, cx, c.y, c.w, phase === "dawn" ? "#f6d5c0" : "#f4f4f4");
        }
      }

      const ground = H - 2;
      ctx.fillStyle = GROUND[phase];
      ctx.fillRect(0, ground, W, 2);
      for (const h of houses) {
        const top = ground - h.h;
        ctx.fillStyle = HOUSE[phase];
        ctx.fillRect(h.x, top, h.w, h.h);
        if (h.roof) for (let k = 1; k <= h.roof; k++) ctx.fillRect(h.x + k, top - k, Math.max(1, h.w - 2 * k), 1);
        if (phase !== "day") {
          for (const l of h.lights) {
            const on = Math.sin(sec * 0.05 + l.ph) > -0.6;
            if (!on) continue;
            ctx.fillStyle = "#ffcd75";
            ctx.fillRect(h.x + l.x, top + l.y, 1, 1);
          }
        }
      }
    };

    setup();
    draw(performance.now());
    const timer = window.setInterval(() => draw(performance.now()), 250);
    const onResize = () => {
      setup();
      draw(performance.now());
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", onResize);
      void unlisten.then((f) => f());
    };
  }, [phase]);

  return <canvas ref={ref} className="sky" aria-hidden />;
}

const MOON = [
  "..####...",
  ".###.....",
  "###......",
  "##.......",
  "##.......",
  "###......",
  ".####...#",
  "..######.",
];

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  MOON.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch !== "#") return;
      ctx.fillStyle = i < 2 || j > 5 ? "#ef9d77" : "#ffcd75";
      ctx.fillRect(x + i, y + j, 1, 1);
    }),
  );
}

function drawSun(ctx: CanvasRenderingContext2D, x: number, y: number, low: boolean) {
  ctx.fillStyle = low ? "#ef7d57" : "#ffcd75";
  ctx.fillRect(x + 2, y, 4, 1);
  ctx.fillRect(x + 1, y + 1, 6, 1);
  ctx.fillRect(x, y + 2, 8, 4);
  ctx.fillRect(x + 1, y + 6, 6, 1);
  ctx.fillRect(x + 2, y + 7, 4, 1);
  ctx.fillStyle = "#fff6d8";
  ctx.fillRect(x + 2, y + 2, 2, 2);
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + 2, w, 3);
  ctx.fillRect(x + 4, y + 1, Math.floor(w * 0.5), 1);
  ctx.fillRect(x + 6, y, Math.floor(w * 0.3), 1);
  ctx.fillRect(x + Math.floor(w * 0.55), y + 1, Math.floor(w * 0.3), 1);
  ctx.fillStyle = "rgba(26,28,44,0.12)";
  ctx.fillRect(x + 2, y + 4, w, 1);
}
