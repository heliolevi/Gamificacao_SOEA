import { ImageResponse } from "next/og"
import { SoeaIcon } from "@/lib/soea-icon"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(<SoeaIcon size={180} />, size)
}
