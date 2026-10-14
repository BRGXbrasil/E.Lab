# Entregas

- [x] Corrigir rotação: ocupação não perde posição; ausência e passagem perdem a vez; atendimento avança uma vez.
- [x] Registrar histórico auditável de status, fila, atendimentos e agendamentos, preservando dados antigos.
- [x] Remover “Único disponível” da operação e do histórico novo.
- [x] Manter Agora e Agenda distintas; agendamento registra data prevista e não avança Agora.
- [x] Exibir linha do tempo, filtros e legenda operacional.
- [x] Persistir e sincronizar com Supabase Realtime com proteção contra sobrescritas antigas.
- [x] Login individual com Supabase Auth e sessão por operador.
- [x] RLS removendo leitura/escrita anônima da tabela `elab_state`.
- [x] Executar testes automatizados e validações funcionais/publicadas.

## Evidências

- `node queue-logic.test.js`: 7 testes aprovados.
- `node --check /tmp/elab-script.js`: aprovado.
- Preview local: histórico, filtros e legenda verificados no navegador.
- Supabase: projeto ativo, tabela `public.elab_state` com RLS, revisão e políticas somente para `authenticated`.
- Publicação: após o commit desta rodada, validar o endereço público.

## Observação

As contas dos operadores devem ser criadas no Supabase Auth. A aplicação não oferece cadastro público; isso evita que qualquer pessoa crie uma conta de operação. Usuários autenticados têm acesso ao estado operacional compartilhado. Uma futura separação por função poderá usar uma tabela de perfis e políticas adicionais por e-mail ou `auth.uid()`.
