// Espelha calcular_nivel() do backend: nivel = floor(sqrt(pontos / 50)) + 1.
// Se a fórmula mudar lá, atualize aqui — é usada só pra desenhar a barra de progresso.
export function levelProgress(pontos: number) {
  const p = Math.max(0, pontos || 0)
  const nivel = Math.floor(Math.sqrt(p / 50)) + 1
  const inicio = 50 * (nivel - 1) ** 2
  const proximo = 50 * nivel ** 2
  return {
    nivel,
    faltam: proximo - p,
    pct: Math.min(1, (p - inicio) / (proximo - inicio)),
  }
}
