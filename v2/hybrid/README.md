# E.Lab híbrido — módulo operacional incremental

Este módulo conecta **MySQL operacional** com **Supabase Auth**, sem substituir a Lista da Vez existente, cuja sincronização continua em **Supabase Realtime**. Não realiza migrações nem importações automáticas de dados reais.

## Inicialização

1. Provisione MySQL em ambiente de homologação e aplique as migrações Drizzle existentes, conferindo antes as tabelas `team_members`, `operational_task_definitions`, `operational_task_events` e `audit_events`.
2. Configure no ambiente **do servidor** `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e opcionalmente `PORT` (padrão `3100`). Nunca inclua `DATABASE_URL` em código público ou variáveis de cliente.
3. Instale as dependências de `v2/package.json` e execute `node hybrid/server.mjs` a partir de `v2`.
4. Publique somente por trás de TLS, proxy reverso e controle de origem. O servidor escuta em `127.0.0.1` por padrão.

## Contratos

- `GET /health` → `{ "ok": true }`, sem banco.
- `GET /api/operational-tasks` → `{ "tasks": [...] }`, apenas tarefas ativas e áreas autorizadas.
- `POST /api/operational-events` → `{ "changed": true, "completed": true, "eventId": "..." }` ou `changed: false` em repetição idempotente. Corpo: `taskId` (UUID), `eventType` (`completed` ou `reopened`), `businessDate` (`YYYY-MM-DD`, fuso de negócio São Paulo), `note` opcional.
- Requisições operacionais devem conter `Authorization: Bearer <access_token_do_Supabase>`.

O servidor valida o token chamando `/auth/v1/user`, associa o e-mail confirmado a um `team_members` ativo e confere permissão por área. Sem vínculo ativo, não há acesso. Não são aceitos papéis de `user_metadata` nem credenciais MySQL no navegador. O registro do evento e a auditoria compartilham uma transação MySQL; uma tarefa inativa não aceita eventos.

## Limites e homologação

- A migração `0002` mantém as 59 tarefas inativas. Sua ativação exige aceite operacional e ensaio no banco homologado.
- A Lista da Vez ainda grava diretamente no Supabase; não existe espelhamento MySQL da fila neste módulo. O banco MySQL passa a ser a base dos eventos das rotinas **quando a API for implantada e as tarefas ativadas**.
- Antes de produção: testes reais com banco MySQL, índice para `(task_id, business_date, created_at)`, testes de concorrência entre sessões, papéis de acesso, rate limiting, TLS e estratégia de backup/restore.
- O repositório continua público; **não** registrar exports reais, credenciais ou dados pessoais.

Testes locais sem banco: `node --test hybrid/hybrid.test.mjs`.
