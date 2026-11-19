// SMC — Social Management Center. One place for the product name, copy and logo used by
// metadata, the manifest, generated icons and the UI.

export const BRAND = {
  short: "SMC",
  name: "Social Management Center",
  full: "SMC · Social Management Center",
  tagline: "Instagram analytics, auto-DMs and inbox in one place",
  description:
    "SMC (Social Management Center) manages Instagram professional accounts: post and reel analytics, follower growth, audience regions, keyword comment-to-DM automations, a shared inbox and scheduled publishing.",
  themeDark: "#07070e",
  themeLight: "#eef0fa",
  gradient: ["#7c5cff", "#ff4fa3", "#ffb347"] as const,
  url: process.env.APP_URL || "https://social-handler.informatia.ai",
};

/**
 * The SMC mark: a chat bubble (social) holding three rising bars (management / analytics) on the
 * brand gradient. Drawn on a 64×64 grid; used by icon.svg and the generated PNG icons.
 */
export function LogoMark({ size = 64, rounded = true }: { size?: number; rounded?: boolean }) {
  const [a, b, c] = BRAND.gradient;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="smc-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={a} />
          <stop offset="0.6" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx={rounded ? 15 : 0} fill="url(#smc-g)" />
      <path
        d="M23 13h18a10 10 0 0 1 10 10v12a10 10 0 0 1-10 10H29l-9 7v-7.6A10 10 0 0 1 13 35V23a10 10 0 0 1 10-10Z"
        fill="#fff"
      />
      <rect x="21" y="30" width="5.5" height="9" rx="2.75" fill="#6a48f5" />
      <rect x="29.25" y="25" width="5.5" height="14" rx="2.75" fill="#b03cd8" />
      <rect x="37.5" y="20" width="5.5" height="19" rx="2.75" fill="#ff4fa3" />
    </svg>
  );
}
