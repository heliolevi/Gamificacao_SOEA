// Consulta: Capturas
// Uma linha por QR Code lido: quem leu, onde e quando. Liga com Participantes por id_participante.
let
    Fonte = Json.Document(
        Web.Contents(
            "https://gamificacao-soea.vercel.app",
            [
                RelativePath = "bi/capturas",
                Headers = [#"X-API-Key" = ChaveApiBi]
            ]
        )
    ),

    Esquema = type table [
        id_participante = text,
        local = text,
        pontos_qr = Int64.Type,
        capturado_em = nullable text
    ],

    Tabela = Table.FromRecords(Fonte[capturas], Esquema, MissingField.UseNull),

    ComHorario = Table.AddColumn(
        Tabela,
        "lido_em",
        each
            if [capturado_em] = null then null
            else DateTimeZone.RemoveZone(DateTimeZone.SwitchZone(DateTimeZone.FromText([capturado_em]), -3)),
        type nullable datetime
    ),

    ComDia = Table.AddColumn(
        ComHorario,
        "data_leitura",
        each if [lido_em] = null then null else Date.From([lido_em]),
        type nullable date
    ),

    ComHora = Table.AddColumn(
        ComDia,
        "hora_leitura",
        each if [lido_em] = null then null else Time.Hour(DateTime.Time([lido_em])),
        type nullable Int64.Type
    ),

    Final = Table.RemoveColumns(ComHora, {"capturado_em"})
in
    Final
