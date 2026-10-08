"""Vínculo do participante com o SOEA, escolhido no cadastro.

O valor guardado no banco é o slug (chave); o rótulo é o que aparece para pessoas.
Mantenha em sincronia com frontend/lib/event.ts e com o CHECK de users.vinculo
(backend/migrations/01_vinculo_no_cadastro.sql).
"""

VINCULOS: dict[str, str] = {
    "comunidade": "Comunidade",
    "empresa": "Empresa",
    "empresa_do_sistema": "Empresa do Sistema",
    "entidade": "Entidade",
    "instituicao_ensino_superior": "Instituição de Ensino Superior",
    "startup_do_sistema": "Startup do Sistema",
}


def rotulo_vinculo(slug: str | None) -> str:
    return VINCULOS.get(slug or "", "")
