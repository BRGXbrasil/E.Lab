# Migração de históricos e permissões — critérios de homologação

Este documento não contém registros reais de clientes. A migração de históricos **não foi executada**.

## Origem e tratamento

1. **Lista da Vez antiga:** solicitar exportação somente leitura do estado e eventos da tabela Supabase legada, incluindo ID, revisão e horário. Preservar o JSON bruto e a origem.
2. **Recepção, Estoque e Limpeza legados:** exportar, com autorização, as chaves locais de cada navegador/dispositivo. Um mesmo nome de chave em navegadores diferentes não significa histórico comum.
3. **Drive:** as planilhas de cronogramas contêm dados de clientes e pessoas da equipe em abas separadas. Importar por fluxo seguro e separado do catálogo de tarefas; nunca copiar esses registros para repositório público.
4. **Meu Perfil:** exigir exportação estruturada autorizada com consentimento, versões de texto e data; não inferir autorização a partir de campo vazio.

## Ensaio obrigatório antes de importar

- Backup imutável com checksum e acesso restrito.
- Verificar contagens por fonte, intervalo temporal, ID, duplicatas e registros fictícios.
- Conservar horário original e converter apenas na apresentação para America/Sao_Paulo.
- Mapear origem, identificador antigo, ID novo e decisão de transformação (tabela de reconciliação).
- Executar `dry-run` sem escrita; gerar diferenças e revisar com responsável.
- Importar em ambiente isolado; validar contagens, amostras e conflitos; repetir com idempotência.
- Após autorização, executar importação real com trilha auditável e plano de reversão.

## Permissões esperadas

| Recurso | Papéis com leitura/operação |
|---|---|
| Meu Perfil público | Envio somente, sem listagem |
| Perfis de clientes | Gestão, Recepção e Profissional autorizado |
| Lista da Vez | Gestão, Recepção e Profissional |
| Estoque | Gestão e Controles/Estoque |
| Ocorrências e ativações da Recepção | Gestão e Recepção |
| Catálogo em conferência | Gestão |
| Equipe e concessão de acesso | Proprietário/admin |
| Auditoria | Gestão |

As verificações de código são parciais. Confirmar por sessões de teste reais (sem acesso, cada papel e administração), incluindo chamadas diretas às APIs e não apenas menus ocultos. Revisar concorrência de estoque, rate limiting do perfil público, confidencialidade de dados e logs antes da publicação.

## Bloqueios atuais

- Ausentes exportações de Supabase e navegadores; não há como validar migração histórica real.
- Sem `DATABASE_URL` para banco de homologação neste ambiente.
- Dependências não instaladas; testes TypeScript, build e integração de MySQL não foram executados.
- A migração `0002` permanece proposta, com 59 definições inativas. Não executar em produção antes de validação de esquema, rollback e testes de concorrência.
