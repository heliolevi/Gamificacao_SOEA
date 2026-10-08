// Consulta: Participantes
// Uma linha por participante (sem administradores), com o vínculo escolhido no cadastro.
// Requer o parâmetro de texto "ChaveApiBi" (Página Inicial > Gerenciar Parâmetros).
let
    // Endereço do backend: precisa ser texto fixo (não parâmetro) para a atualização agendada funcionar no serviço.
    Fonte = Json.Document(
        Web.Contents(
            "https://gamificacao-soea.vercel.app",
            [
                RelativePath = "bi/participantes",
                Headers = [#"X-API-Key" = ChaveApiBi]
            ]
        )
    ),

    Esquema = type table [
        id_participante = text,
        nome = text,
        vinculo = text,
        vinculo_rotulo = text,
        pontos = Int64.Type,
        nivel = Int64.Type,
        qrs_capturados = Int64.Type,
        perguntas_respondidas = Int64.Type,
        data_registro = nullable text
    ],

    Tabela = Table.FromRecords(Fonte[participantes], Esquema, MissingField.UseNull),

    // A API entrega UTC; o relatório fica no horário de Brasília (UTC-3).
    ComHorario = Table.AddColumn(
        Tabela,
        "registrado_em",
        each
            if [data_registro] = null then null
            else DateTimeZone.RemoveZone(DateTimeZone.SwitchZone(DateTimeZone.FromText([data_registro]), -3)),
        type nullable datetime
    ),

    ComDia = Table.AddColumn(
        ComHorario,
        "data_cadastro",
        each if [registrado_em] = null then null else Date.From([registrado_em]),
        type nullable date
    ),

    Final = Table.RemoveColumns(ComDia, {"data_registro"})
in
    Final
