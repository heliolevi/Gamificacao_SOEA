// Dados do evento exibidos na interface — edite aqui se algo mudar.
export const EVENT = {
  name: "SOEA",
  fullName: "Semana Oficial da Engenharia e da Agronomia",
  // Mantido com o nome antigo porque várias telas leem EVENT.school
  school: "Semana Oficial da Engenharia e da Agronomia",
  // Preencha com as datas oficiais quando estiverem confirmadas (ex.: ["10/11", "11/11"])
  dates: [] as string[],
}

// Vínculo escolhido no cadastro. `valor` é o que a API grava (mantenha igual a backend/vinculos.py).
export const VINCULOS = [
  { valor: "comunidade", rotulo: "Comunidade" },
  { valor: "empresa", rotulo: "Empresa" },
  { valor: "empresa_do_sistema", rotulo: "Empresa do Sistema" },
  { valor: "entidade", rotulo: "Entidade" },
  { valor: "instituicao_ensino_superior", rotulo: "Instituição de Ensino Superior" },
  { valor: "startup_do_sistema", rotulo: "Startup do Sistema" },
] as const
