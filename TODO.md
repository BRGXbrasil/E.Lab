# Entregas

- [x] Corrigir rotação: ocupação não perde posição; ausência e passagem perdem a vez; atendimento avança uma vez.
- [x] Registrar histórico auditável de status, fila, atendimentos e agendamentos, preservando dados antigos.
- [x] Remover “Único disponível” da operação e do histórico novo.
- [x] Manter Agora e Agenda distintas; agendamento registra data prevista e não avança Agora.
- [x] Exibir linha do tempo, filtros e legenda operacional.
- [x] Persistir e sincronizar com Supabase Realtime com proteção contra sobrescritas antigas.
- [x] Executar testes automatizados e validações funcionais/publicadas.
- [ ] Substituir a senha local por autenticação real dos operadores e restringir escrita no Supabase com RLS por usuário.

## Evidências desta rodada

- `node queue-logic.test.js`: 7 testes aprovados.
- `node --check /tmp/elab-script.js`: aprovado.
- Preview local: navegação para Histórico, filtros e legenda verificados no navegador.
- Supabase: tabela `public.elab_state` com RLS e coluna `revision`; projeto ativo.
- Publicação: pendente até o push deste commit.
