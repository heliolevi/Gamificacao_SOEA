/* eslint-disable */
// @ts-nocheck
/*
 * MODO DEMONSTRAÇÃO — só liga com NEXT_PUBLIC_DEMO=1 (ex.: iniciar-front.bat).
 * Responde as chamadas /api/* com dados fictícios para ver o app sem backend.
 * Nunca ative em produção: qualquer e-mail/senha "entra".
 */
export function instalarDemo() {
  if (typeof window === "undefined" || (window as any).__soeaDemo) return
  ;(window as any).__soeaDemo = true

  // Pré-visualização: simula a API do SOEA com dados fictícios (nada sai do navegador).
  var user = {id_user:"demo-1", nome:"Visitante Demo", email:"demo@soea.app", pontos:340, nivel:3, is_admin:false};
  var nomes = ["Ana Ribeiro","Bruno Tavares","Carla Menezes","Diego Farias","Elisa Rocha","Fábio Nunes","Gabriela Lima","Hugo Araújo"];
  var ranking = nomes.map(function(n,i){var p=980-i*95;return {id:"r"+i,nome:n,pontos:p,nivel:Math.floor(Math.sqrt(p/50))+1,qrs_capturados:12-i};});
  function json(body, status){return Promise.resolve(new Response(JSON.stringify(body),{status:status||200,headers:{"Content-Type":"application/json"}}));}
  function sessao(){return {etapa:"ok",user:user,token:"demo",expira_em:900};}
  var orig = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var i = url.indexOf("/api/"); if (i < 0) return orig(input, init);
    var path = url.slice(i+4).split("?")[0];
    var body = {}; try { body = init && init.body && typeof init.body === "string" ? JSON.parse(init.body) : {}; } catch(e){}
    if (path === "/opcoes/escola") return json(["UNDB","UFMA","IFMA","Outra"]);
    if (path === "/auth/login") { if (body.email) user.email = body.email; return json(sessao()); }
    if (path === "/auth/registro/iniciar") { user.nome = body.nome || user.nome; user.email = body.email || user.email; return json({status:"codigo_enviado",mensagem:"ok",expira_em:600,reenviar_em:60},202); }
    if (path === "/auth/registro/reenviar" || path === "/auth/senha/solicitar" || path === "/auth/login/reenviar") return json({status:"codigo_enviado",mensagem:"ok",expira_em:600,reenviar_em:60},202);
    if (path === "/auth/registro/verificar" || path === "/auth/senha/confirmar" || path === "/auth/login/verificar") {
      if (body.codigo === "000000") return json({detail:"Código incorreto. Você tem mais 4 tentativas."},400);
      return json(sessao());
    }
    if (path === "/auth/refresh") return json(sessao());
    if (path.indexOf("/auth/logout") === 0) return json({status:"ok",mensagem:"ok"});
    if (path === "/auth/me") return json(user);
    if (path === "/ranking") { var lim = parseInt((url.split("limit=")[1]||"0"),10); return json(lim>0 ? ranking.slice(0,lim) : ranking); }
    if (path === "/usuarios/me/posicao") return json({id:user.id_user,nome:user.nome,pontos:user.pontos,nivel:user.nivel,posicao:11,qrs_capturados:5});
    if (path === "/capturar") return json({status:"Sucesso",pontos_qr:50,pontos_total:390,nivel_anterior:3,nivel_atual:4,subiu_de_nivel:true,
      pergunta:{id_pergunta:"p"+Date.now(),enunciado:"Qual conselho regulamenta a profissão de engenheiro no Brasil?",tipo:"multipla_escolha",alternativas:{A:"CFM",B:"Confea",C:"OAB",D:"CFC"}}});
    if (path === "/responder") return json({acertou:true,resposta_correta:"B",pontos_bonus:50,feedback:"ok"});
    if (path === "/amigos/escanear") return json({status:"Sucesso",amigo:"Ana Ribeiro",pontos_ganho:50,pontos_total:390,nivel_anterior:3,nivel_atual:3,subiu_de_nivel:false});
    if (path === "/usuarios/me/nome") return json({status:"Sucesso",nome:"Visitante Demo"});
    if (path === "/usuarios/me/qrcode") return Promise.resolve(new Response(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1z" fill="none" stroke="#000" stroke-width="2"/><path d="M11 11h2v2h-2zM15 13h2v2h-2zM12 16h3v2h-3zM17 17h2v2h-2z"/></svg>'],{type:"image/svg+xml"})));
    return json({detail:"Indisponível na pré-visualização."},503);
  };
}

if (process.env.NEXT_PUBLIC_DEMO === "1") instalarDemo()
