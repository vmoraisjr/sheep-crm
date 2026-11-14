# Onboarding (#9)

`/onboarding` usa sessão Supabase e organização validada no servidor. Somente owner/admin salva ou aprova. Alterações revogam aprovação; revisão otimista impede aprovar rascunho obsoleto. Nenhuma URL é coletada automaticamente: documentos são texto fornecido, sem SSRF e sem fatos inventados.

`/onboarding?mode=demo` permite percorrer o wizard sem credenciais. Aprovação e teste são simulados na sessão, sem enviar à Meta nem ativar agente real. Dados não são enviados ao endpoint neste modo.

Conexões permanecem desconectadas até credenciais/permissões validadas pelos módulos de canais. Aprovação de conhecimento não comprova integração nem piloto real. Aplicar migrations antes de usar modo autenticado.
