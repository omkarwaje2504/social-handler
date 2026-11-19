import { ImageResponse } from "next/og";
import { BRAND, LogoMark } from "@/lib/brand";

// Social share card (WhatsApp, LinkedIn, Slack, X…) for every page.
export const alt = BRAND.full;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const [a, b, c] = BRAND.gradient;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "72px 84px", color: "#f3f3f8", fontFamily: "sans-serif",
          backgroundColor: BRAND.themeDark,
          backgroundImage: "linear-gradient(135deg, #2a1f63 0%, #07070e 45%, #07070e 60%, #3a1030 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <LogoMark size={128} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1, color: "#ffffff" }}>
              SMC
            </div>
            <div style={{ fontSize: 40, fontWeight: 700, marginTop: 6 }}>Social Management Center</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#c4c5d6", marginTop: 44, maxWidth: 980, lineHeight: 1.35 }}>
          {BRAND.tagline}.
        </div>
        <div style={{ display: "flex", width: 220, height: 6, borderRadius: 3, marginTop: 30, backgroundImage: `linear-gradient(90deg, ${a}, ${b}, ${c})` }} />
        <div style={{ display: "flex", gap: 14, marginTop: 30 }}>
          {["Analytics", "Auto-DMs", "Inbox", "Scheduling", "Regions"].map((t) => (
            <div key={t} style={{ fontSize: 24, padding: "10px 20px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
