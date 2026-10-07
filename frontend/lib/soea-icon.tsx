// Ícone do app (app/icon.tsx e app/apple-icon.tsx): o X oficial da Confea-X sobre branco,
// com a área de proteção do manual (margem generosa em volta da marca).
import { BRAND_ORANGE, BRAND_X_PATHS, BRAND_X_VIEWBOX } from "@/components/soea/brand-x"

export function SoeaIcon({ size }: { size: number }) {
  const mark = Math.round(size * 0.6)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={mark} height={mark} viewBox={BRAND_X_VIEWBOX} fill={BRAND_ORANGE}>
        {BRAND_X_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    </div>
  )
}
