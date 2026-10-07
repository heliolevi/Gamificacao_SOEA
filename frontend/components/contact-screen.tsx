"use client"

import { motion } from "motion/react"
import { ArrowLeft, ArrowUpRight, Briefcase, CodeXml, Github, Instagram, Linkedin } from "lucide-react"
import { cn } from "@/lib/utils"
import { EASE_OUT, riseItem, staggerList } from "@/lib/motion"
import { haptic } from "@/lib/gsap"
import { Avatar, Reveal, SectionTitle } from "@/components/soea/kit"
import { SoeaMark } from "@/components/soea/mark"

export const DEV_NOME = "Hélio Levi"

const LINKS = [
  {
    id: "portfolio",
    titulo: "Portfólio",
    detalhe: "heliolevi.github.io",
    texto: "Projetos e trabalhos publicados.",
    href: "https://heliolevi.github.io/Projeto-portifolio/index.html",
    icone: Briefcase,
    cor: "bg-orange-tint text-orange-ink",
  },
  {
    id: "linkedin",
    titulo: "LinkedIn",
    detalhe: "Hélio Levi Morais Vieira",
    texto: "Trajetória e contato profissional.",
    href: "https://www.linkedin.com/in/h%C3%A9lio-levi-morias-vieira-472918347/",
    icone: Linkedin,
    cor: "bg-purple-tint text-purple",
  },
  {
    id: "github",
    titulo: "GitHub",
    detalhe: "@heliolevi",
    texto: "Código aberto e repositórios.",
    href: "https://github.com/heliolevi",
    icone: Github,
    cor: "bg-surface-2 text-navy",
  },
  {
    id: "instagram",
    titulo: "Instagram",
    detalhe: "@helio_levi",
    texto: "Bastidores e novidades.",
    href: "https://www.instagram.com/helio_levi/",
    icone: Instagram,
    cor: "bg-orange-tint text-orange-ink",
  },
] as const

const STACK = ["Next.js", "React", "TypeScript", "FastAPI", "PostgreSQL"]

export function ContactScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={onBack}
          className="focus-ring pressable -ml-2 flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-[14px] font-bold text-orange-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.4} /> Voltar ao início
        </button>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }} className="kicker mt-2">
          Contato
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.05 }}
          className="mt-0.5 font-display text-[clamp(30px,9vw,40px)] font-extrabold leading-[1.08] tracking-[-0.035em] text-ink"
        >
          Fale com quem construiu o app
        </motion.h1>
      </div>

      <Cartao />

      <Reveal as="section" className="space-y-3.5">
        <SectionTitle kicker="Onde me encontrar">Redes e portfólio</SectionTitle>
        <motion.ul variants={staggerList} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="space-y-2.5">
          {LINKS.map(({ id, titulo, detalhe, texto, href, icone: Icone, cor }) => (
            <motion.li key={id} variants={riseItem}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => haptic(8)}
                aria-label={`${titulo}: ${detalhe} (abre em nova aba)`}
                className="focus-ring pressable group flex w-full items-center gap-3.5 rounded-[14px] border border-line bg-white p-3.5 hover:bg-surface"
              >
                <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", cor)}>
                  <Icone className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-ink">{titulo}</span>
                  <span className="block truncate text-[14px] font-semibold text-ink-soft">{detalhe}</span>
                  <span className="block text-[13px] leading-snug text-muted-foreground">{texto}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </a>
            </motion.li>
          ))}
        </motion.ul>
      </Reveal>

      <Reveal as="section" className="space-y-3.5">
        <SectionTitle kicker="Sobre o projeto">Como o app foi feito</SectionTitle>
        <div className="rounded-[14px] border border-line bg-surface p-4">
          <p className="text-[15px] leading-relaxed text-ink-soft">
            O Caça QR do SOEA foi desenvolvido do zero por {DEV_NOME}: da interface mobile ao backend, ao banco de dados, ao login por e-mail e ao ranking em tempo real.
          </p>
          <ul className="mt-3.5 flex flex-wrap gap-2" aria-label="Tecnologias usadas">
            {STACK.map((t) => (
              <li key={t} className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-[13px] font-bold text-navy">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      <p className="pb-2 text-center text-[13px] text-subtle">SOEA · Caça QR · desenvolvido por {DEV_NOME}</p>
    </div>
  )
}

/* Cartão de apresentação: bloco azul-marinho da marca, igual ao placar da Home. */
function Cartao() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.1 }}
      className="relative overflow-hidden rounded-[18px] bg-navy p-5 text-white"
      aria-label={`Desenvolvedor: ${DEV_NOME}`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-14 -top-10 w-52 opacity-[0.12]">
        <SoeaMark className="h-auto w-full" />
      </div>
      <div className="relative flex items-center gap-4">
        <Avatar name={DEV_NOME} tone="orange" className="h-16 w-16 text-[22px]" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-navy-soft">Desenvolvido por</p>
          <p className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em]">{DEV_NOME}</p>
        </div>
      </div>
      <p className="relative mt-4 flex items-center gap-2 text-[14px] leading-snug text-navy-soft">
        <CodeXml className="h-4 w-4 shrink-0 text-orange" strokeWidth={2.2} />
        Desenvolvedor do projeto · front-end, back-end e banco de dados
      </p>
    </motion.section>
  )
}

/* Chamada compacta para a Home: leva para a tela de contato. */
export function DevCard({ onClick }: { onClick: () => void }) {
  return (
    <Reveal>
      <button
        onClick={() => {
          haptic(8)
          onClick()
        }}
        className="focus-ring pressable flex w-full items-center gap-3.5 rounded-[14px] border border-line bg-surface p-3.5 text-left hover:bg-surface-2"
        aria-label={`Desenvolvido por ${DEV_NOME}. Abrir contato`}
      >
        <Avatar name={DEV_NOME} tone="navy" className="h-11 w-11 text-[15px]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-subtle">Desenvolvido por</span>
          <span className="block font-display text-[17px] font-extrabold leading-tight text-ink">{DEV_NOME}</span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-[14px] font-bold text-orange-ink">
          Contato <ArrowUpRight className="h-4 w-4" strokeWidth={2.4} />
        </span>
      </button>
    </Reveal>
  )
}
