# E.Lab Unificado 2.0 — modo custo zero

**Estado:** código em homologação, NÃO publicado, NÃO ativado no banco. Este diretório é independente da Lista da Vez, que continua a usar `public.elab_state` e Supabase Realtime.

## Custo obrigatório R$ 0

- GitHub Free e GitHub Pages a partir de repositório **público** (não publique segredos nem dados de clientes).
- Supabase Free já existente para Auth, Realtime e operações PostgreSQL; sem adicionar serviço pago.
- TiDB Cloud Starter MySQL-compatible é **opcional**, a depender da criação de conta/instância gratuita e credenciais próprias. **Não está provisionado nem conectado neste repositório.** Sem uma instância TiDB, o modo operacional usa Postgres no Supabase, não MySQL.
- Railway NÃO deve ser implantado. Existe apenas uma definição staged, sem runtime ativo.
- Gratuito não significa ilimitado: limites e pausas de serviços podem interromper o uso. Não habilitar overages, upgrades, ou gasto automático.

## Migração operacional: não alterar produção antes de ensaio

1. Fazer backup/teste de restauração do projeto existente e verificar policies em `public.elab_state`.
2. Revisar `001_supabase_ops_staging.sql`. Em **banco separado de homologação**, aplicar o esquema isolado com RLS.
3. Aplicar `002_catalog_inactive.sql`, conferindo exatamente 59 registros todos `active = false`, sem apagar ou alterar qualquer registro antigo.
4. Inserir operadores em `public.elab_ops_members` por ID da conta **Supabase Auth confirmada**, com papéis `manager`, `reception`, `controls`, `cleaning` ou `professional`. Não conceder entrada automática.
5. Testar logins não autorizados, cada área, alteração simultânea, leitura cruzada, conclusão e reabertura, idempotência e transações. Conferir backups.
6. Somente após aprovação dos testes e da ativação: publicar `supabase/functions/operational/index.ts` no projeto Supabase com validação JWT ativada; apontar `index.html` para a função; ativar as tarefas explicitamente na base de homologação e depois na operação quando autorizado.
7. Publicação em GitHub Pages exige selecionar uma branch/pasta pública ou workflow; **não modificar a main**. A interface deve exigir autenticação, mas a página estática será publicamente acessível.

## API

- GET `/functions/v1/operational`: tarefas ativas conforme papel.
- POST no mesmo endereço: `{taskId, businessDate: "YYYY-MM-DD", eventType: "completed"|"reopened", note?}`.
- Sessão Supabase obrigatória via Bearer; RLS impede leitura de outra área; função SQL executa escrita e auditoria na mesma transação, com bloqueio por tarefa e resultado idempotente.
- O usuário `professional` não obtém acesso às tarefas operacionais.
- O fuso de referência para a data operacional é `America/Sao_Paulo`.

## Critérios objetivos de entrega

- [x] Arquivos de esquema, catálogo, API e interface preparados em branch isolada.
- [ ] Migração testada em Postgres real separado.
- [ ] Operadores reais cadastrados por UID e papéis conferidos.
- [ ] 59 rotinas importadas e habilitadas somente após aceite.
- [ ] Restauração de backup ensaiada; concorrência validada.
- [ ] Deploy da Edge Function e GitHub Pages homologados.
- [ ] End-to-end aprovado em ambiente com plano gratuito confirmado.
- [ ] TiDB conectado, se for obrigatório manter persistência MySQL.

**Importante:** Uma instância TiDB gratuita ainda depende de conta vinculada à sua titularidade; não é possível criar automaticamente uma instância sem acesso à conta. Não copiar banco MySQL para PostgreSQL sem consentimento específico, nem iniciar pagamentos.
