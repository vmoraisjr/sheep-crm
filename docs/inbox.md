# Central de conversas (#5)

`/demo` abre uma caixa de entrada inteiramente simulada, com WA e IG, busca, filtros, resposta manual, pausa da IA, responsável e contexto de transferência. Os dados ficam no localStorage deste navegador (`sheep:inbox:demo:v1`). Nenhuma mensagem é enviada à Meta. Limpar essa chave reinicia a demonstração.

`/inbox` exige sessão Supabase e associação ao tenant. `/api/inbox` deriva o tenant da sessão, aplica filtros organization_id além da RLS e retorna cache privado no-store. Exibe mensagens de canais reais ou simulados com origem explícita. Os controles de envio/alteração reais falham de forma explícita e segura até haver conexão operacional do worker oficial de canais; não exibem sucesso fictício. A entrega real depende de configuração e validação sandbox dos adaptadores das issues #3/#4.

A interface inclui carregamento, vazio, erro anunciado por leitor de tela, labels, foco visível e layout em coluna para telas pequenas. O Figma não é necessário.

Testes: `npm test -- tests/inbox.test.ts`; execução integrada de navegador será registrada no PR.
