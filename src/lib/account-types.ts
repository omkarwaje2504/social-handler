// Kinds of linked social accounts. Instagram is the one that connects today; the others can be
// recorded for organisation and reporting (and connect once their integrations exist).
export const ACCOUNT_TYPES = [
  { key: "instagram", label: "Instagram", icon: "/social/instagram.png" },
  { key: "facebook", label: "Facebook", icon: "/social/facebook.png" },
  { key: "youtube", label: "YouTube", icon: "/social/youtube.png" },
  { key: "linkedin", label: "LinkedIn", icon: "/social/linkedin.png" },
  { key: "x", label: "X", icon: "/social/x.png" },
  { key: "threads", label: "Threads", icon: "/social/threads.png" },
  { key: "whatsapp", label: "WhatsApp", icon: "/social/whatsapp.png" },
  { key: "tiktok", label: "TikTok", icon: "/social/tiktok.png" },
  { key: "pinterest", label: "Pinterest", icon: "/social/pinterest.png" },
  { key: "snapchat", label: "Snapchat", icon: "/social/snapchat.png" },
  { key: "telegram", label: "Telegram", icon: "/social/telegram.png" },
] as const;

export const accountTypeOf = (k: string | null | undefined) => ACCOUNT_TYPES.find((t) => t.key === k) ?? ACCOUNT_TYPES[0];
