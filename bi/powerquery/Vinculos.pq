// Consulta: Vinculos
// Tabela fixa com os 6 vínculos do cadastro (+ "Não informado" para contas antigas).
// Serve para: manter a ORDEM nos gráficos e mostrar vínculos com zero participantes.
// Se a lista mudar, atualize também backend/vinculos.py, frontend/lib/event.ts e o CHECK do banco.
let
    Fonte = #table(
        type table [vinculo = text, vinculo_rotulo = text, ordem = Int64.Type],
        {
            {"comunidade", "Comunidade", 1},
            {"empresa", "Empresa", 2},
            {"empresa_do_sistema", "Empresa do Sistema", 3},
            {"entidade", "Entidade", 4},
            {"instituicao_ensino_superior", "Instituição de Ensino Superior", 5},
            {"startup_do_sistema", "Startup do Sistema", 6},
            {"nao_informado", "Não informado", 7}
        }
    )
in
    Fonte
