/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite abrir o `next dev` por túneis do ngrok (sem isso o HMR/scripts são bloqueados e o Safari mostra tela branca).
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        // Em produção, API_URL aponta para o deploy do FastAPI (ex.: https://soea-api.vercel.app).
        // Passar pela mesma origem do app deixa o cookie do refresh token first-party.
        destination: `${(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/:path*`,
      },
    ]
  },
}

export default nextConfig
