"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "auto";
const KEY = "sh-theme";

/** Applies a mode: light/dark pin <html data-theme>, auto removes it so the OS setting wins. */
function apply(mode: Mode) {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  try {
    if (mode === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {}
}

/** Runs in <head> before first paint so a saved theme never flashes the other one. */
export const themeInitScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [mode, setMode] = useState<Mode>("auto");

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setMode(t === "light" || t === "dark" ? t : "auto");
  }, []);

  const pick = (m: Mode) => { apply(m); setMode(m); };
  const opts: { m: Mode; label: string }[] = [
    { m: "light", label: "☀ Light" },
    { m: "dark", label: "☾ Dark" },
    { m: "auto", label: "Auto" },
  ];

  return (
    <div className={`theme-toggle${floating ? " theme-float" : ""}`} role="group" aria-label="Color theme">
      {opts.map((o) => (
        <button key={o.m} type="button" aria-pressed={mode === o.m} onClick={() => pick(o.m)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
