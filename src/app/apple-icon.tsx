import { ImageResponse } from "next/og";
import { LogoMark } from "@/lib/brand";

// iOS home-screen icon. Full-bleed square: iOS applies its own rounded corners.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<LogoMark size={180} rounded={false} />, size);
}
