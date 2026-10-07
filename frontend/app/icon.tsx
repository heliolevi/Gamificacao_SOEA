import { ImageResponse } from "next/og"
import { SoeaIcon } from "@/lib/soea-icon"

export const size = { width: 512, height: 512 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(<SoeaIcon size={512} />, size)
}
