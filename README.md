# Sheep CRM 🐑⚔️

SaaS multissetorial para atendimento comercial unificado por **WhatsApp + Instagram**, CRM enxuto, automação híbrida com IA e follow-up com regras de conformidade.

## MVP v0.1
Prazo-alvo: 14 dias. Piloto com 3 empresas; liberações/permissões da Meta são dependências externas.

## Backlog para Codex
Veja as [issues](https://github.com/vmoraisjr/sheep-crm/issues): SHP-01 a SHP-11. Ordem recomendada: 01 → 02 → (03 + 04 em paralelo) → (05 + 06) → 07 → 08 → 09 → 10. SHP-11 em paralelo.

## Figma
[Wireframes editáveis Sheep CRM](https://www.figma.com/design/QluKocfMBvAy7vbpW5BvSx)

## Identidade
Sheep é uma ovelha com elmo de cavaleiro medieval: mascote simpática, confiável e protetora; UI minimalista com índigo #4F5ED7.

## Princípios
Multi-tenant com isolamento por RLS; APIs oficiais Meta; mensagens e consentimentos auditáveis; transferências para humanos; sem inventar condições comerciais; dados de teste até aprovação das integrações.

## Desenvolvimento

Requer Node.js 24 e npm. Execute `npm ci`, copie `.env.example` para `.env.local`, configure um projeto Supabase e execute todas as migrations em `supabase/migrations` na ordem. O app usa exclusivamente a chave pública e o JWT do usuário: nenhuma chave service-role é necessária para servir requisições. `npm run dev` abre a UI. Sem configuração, a página informa explicitamente que não há conexão.

Autenticação: `/login` permite cadastro e senha (12+ caracteres); ative confirmação de e-mail, proteção contra abuso e URLs de redirecionamento no Supabase. Cadastros confirmados criam empresa em `/organizations/new` via RPC atômica. Cookies são renovados no proxy; `getUser()` valida o usuário no servidor. O tenant selecionado é sempre validado pelas memberships. `requireTenant()` fornece `supabase`, `user`, `organizationId`, `role` a módulos protegidos. Nunca aceite organization_id do navegador como autorização. RLS é obrigatória em toda tabela de negócio; funções privileged usam search_path vazio e grants explícitos.

## Verificação da fundação

`npm run lint`, `npm run typecheck`, `npm test` e `npm run build`. O job `database` da CI executa as migrations em PostgreSQL descartável e `tests/rls.sql`: cria A e B, prova que B só vê sua empresa/membership e tenta escalada de role. `tests/postgres-bootstrap.sql` simula exclusivamente as funções de identidade de Supabase Auth para testar SQL real; não valida entrega de e-mail nem conexão real ao Supabase. Para repetir em Supabase local, aplique migrations e rode somente `tests/rls.sql` com psql como postgres. A transação de teste é revertida.

Bloqueios: nenhum projeto/credencial Supabase foi fornecido; login e confirmação de e-mail externos precisam ser homologados. Nenhuma integração Meta foi ativada nem declarada como real. O schema/fixtures são verificáveis sem credenciais; pilotos reais dependem de serviços provisionados.
