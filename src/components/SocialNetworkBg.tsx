"use client";

import { useEffect, useRef } from "react";

// Login backdrop: social-network icons drift around the screen, each wired to the centre (where the
// SMC hub sits) by a glowing line with data "packets" flowing in, plus a faint mesh between
// neighbours. Positions are driven by requestAnimationFrame so the lines stay attached to the icons.
const NETWORKS = [
  "instagram", "facebook", "youtube", "x", "linkedin", "whatsapp",
  "tiktok", "threads", "pinterest", "snapchat", "telegram",
] as const;

type Node = { angle: number; reach: number; speed: number; phase: number; drift: number };

// Fixed (not random) so the server and client render the same thing.
const NODES: Node[] = NETWORKS.map((_, i) => ({
  angle: (i / NETWORKS.length) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.12 : -0.08),
  reach: [1, 0.86, 0.97, 0.82, 1.02, 0.9, 0.95, 0.84, 1, 0.88, 0.93][i],
  speed: 0.35 + ((i * 37) % 10) / 40,
  phase: i * 1.7,
  drift: 10 + ((i * 13) % 12),
}));

export function SocialNetworkBg() {
  const svgRef = useRef<SVGSVGElement>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const spokes = Array.from(svg.querySelectorAll<SVGLineElement>("line.net-spoke"));
    const mesh = Array.from(svg.querySelectorAll<SVGLineElement>("line.net-mesh"));
    const packets = Array.from(svg.querySelectorAll<SVGCircleElement>("circle.net-packet"));
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Sized to its container (the login page's brand panel), not the window.
    const box = svg.parentElement!;
    let w = 0, h = 0, size = 56;
    const resize = () => {
      w = box.clientWidth;
      h = box.clientHeight;
      size = w < 520 ? 42 : w < 800 ? 50 : 58;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    let raf = 0;
    const frame = (now: number) => {
      const t = still ? 0 : now / 1000;
      const cx = w / 2, cy = h / 2;
      // Ellipse around the hub in the middle of the panel.
      const rx = Math.max(w * 0.36, 130), ry = Math.max(h * 0.3, 130);
      const pts = NODES.map((n) => {
        const x = cx + Math.cos(n.angle) * rx * n.reach + Math.sin(t * n.speed + n.phase) * n.drift;
        const y = cy + Math.sin(n.angle) * ry * n.reach + Math.cos(t * n.speed * 0.8 + n.phase) * n.drift;
        return [Math.min(Math.max(x, size / 2 + 6), w - size / 2 - 6), Math.min(Math.max(y, size / 2 + 6), h - size / 2 - 6)];
      });
      pts.forEach(([x, y], i) => {
        const el = iconRefs.current[i];
        if (el) {
          el.style.width = el.style.height = `${size}px`;
          el.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
        }
        const s = spokes[i];
        s.setAttribute("x1", `${x}`); s.setAttribute("y1", `${y}`);
        s.setAttribute("x2", `${cx}`); s.setAttribute("y2", `${cy}`);
        const [nx, ny] = pts[(i + 1) % pts.length];
        const m = mesh[i];
        m.setAttribute("x1", `${x}`); m.setAttribute("y1", `${y}`);
        m.setAttribute("x2", `${nx}`); m.setAttribute("y2", `${ny}`);
        // Packet travels icon → centre, fading at both ends.
        const p = packets[i];
        const k = still ? 0.5 : (t * (0.18 + NODES[i].speed * 0.12) + NODES[i].phase) % 1;
        p.setAttribute("cx", `${x + (cx - x) * k}`);
        p.setAttribute("cy", `${y + (cy - y) * k}`);
        p.setAttribute("opacity", `${Math.sin(Math.PI * k) * 0.95}`);
      });
      svg.parentElement?.classList.add("ready");
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div className="net-bg" aria-hidden="true">
      <svg ref={svgRef} className="net-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="net-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset=".55" stopColor="#ff4fa3" />
            <stop offset="1" stopColor="#ffb347" />
          </linearGradient>
          <filter id="net-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {NETWORKS.map((n) => <line key={`m-${n}`} className="net-mesh" />)}
        {NETWORKS.map((n) => <line key={`s-${n}`} className="net-spoke" />)}
        {NETWORKS.map((n) => <circle key={`p-${n}`} className="net-packet" r="3.5" filter="url(#net-glow)" />)}
      </svg>
      <div className="net-hub"><img src="/icon.svg" alt="" width={56} height={56} /></div>
      {NETWORKS.map((n, i) => (
        <div key={n} ref={(el) => { iconRefs.current[i] = el; }} className="net-node" style={{ animationDelay: `${i * 0.35}s` }}>
          <img src={`/social/${n}.png`} alt="" draggable={false} />
        </div>
      ))}
    </div>
  );
}
