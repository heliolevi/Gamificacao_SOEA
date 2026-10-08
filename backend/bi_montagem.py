"""Montagem dos registros do relatório (Power BI). Funções puras: sem banco, fáceis de testar."""
from collections import Counter

from nivel import calcular_nivel
from vinculos import VINCULOS

NAO_INFORMADO = "nao_informado"
ROTULO_NAO_INFORMADO = "Não informado"  # contas criadas antes do campo "vínculo" existir


def vinculo_e_rotulo(slug: str | None) -> tuple[str, str]:
    if slug in VINCULOS:
        return slug, VINCULOS[slug]
    return NAO_INFORMADO, ROTULO_NAO_INFORMADO


def contar_por_usuario(linhas: list[dict]) -> Counter:
    return Counter(str(l["id_user"]) for l in linhas if l.get("id_user"))


def montar_participantes(usuarios: list[dict], qrs: Counter, perguntas: Counter) -> list[dict]:
    saida = []
    for u in usuarios:
        id_user = str(u["id_user"])
        slug, rotulo = vinculo_e_rotulo(u.get("vinculo"))
        pontos = int(u.get("pontos") or 0)
        saida.append(
            {
                "id_participante": id_user,
                "nome": u.get("nome") or "",
                "vinculo": slug,
                "vinculo_rotulo": rotulo,
                "pontos": pontos,
                "nivel": calcular_nivel(pontos),
                "qrs_capturados": qrs.get(id_user, 0),
                "perguntas_respondidas": perguntas.get(id_user, 0),
                "data_registro": u.get("data_registro"),
            }
        )
    return saida


def montar_capturas(capturas: list[dict], qrcodes: list[dict], ids_participantes: set[str]) -> list[dict]:
    por_hash = {q["code_hash"]: q for q in qrcodes}
    saida = []
    for c in capturas:
        id_user = str(c.get("id_user") or "")
        if id_user not in ids_participantes:  # ignora administradores
            continue
        qr = por_hash.get(c.get("code_hash")) or {}
        saida.append(
            {
                "id_participante": id_user,
                "local": qr.get("local") or "Desconhecido",
                "pontos_qr": int(qr.get("pontos") or 0),
                "capturado_em": c.get("catch_time"),
            }
        )
    return saida
