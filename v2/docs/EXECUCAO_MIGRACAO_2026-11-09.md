# E.Lab 2.0 — migração recuperada e execução segura

## Origem e resultado

- Exportação privada Supabase `public.elab_state`, revisão 32 (24/10/2026).
- Ensaio de conversão local: 5 serviços, 27 eventos, 3 agendamentos futuros.
- O JSON de origem **não** está neste repositório público e **não** deve ser commitado.
- O histórico e a fila atual são importados conjuntamente, em uma transação MySQL; o arquivo bruto original permanece no backup privado.

## Execução

1. Aplicar migrações `0000` e `0001` do schema MySQL em **homologação**, usando configuração segura da plataforma.
2. Validar que `queue_state` está vazio e que `queue_events` não tem legado previamente importado.
3. Executar `node scripts/import-legacy-queue.mjs /CAMINHO/PRIVADO/snapshot.json` (somente leitura / dry-run).
4. Definir `DATABASE_URL` exclusivamente de homologação e `ELAB_IMPORT_APPROVED=YES`; executar `node scripts/import-legacy-queue.mjs /CAMINHO/PRIVADO/snapshot.json --apply`.
5. Confirmar cinco linhas em `queue_state`, 27 em `queue_events`, três `futureQueue` preservadas, total por serviço e permissões da API.
6. Fazer nova importação em base zerada somente após restaurar backup; nunca reimportar por cima de estado vivo. Promover a aplicação apenas após homologação.

O importador **bloqueia** destino que já tenha estado da fila e faz rollback em falhas. Não foi aplicada nenhuma escrita no banco operacional real nesta sessão, pois o aplicativo usa MySQL e o conector disponível dá acesso somente ao Supabase legado.

## Pendências de publicação

- Configurar e validar MySQL de homologação e produção da aplicação, sem expor credenciais.
- Ativar catálogo de 59 tarefas após migração `0002`, com API/UX e controle de papéis por área.
- Testar concorrência de fila/estoque, autorizações de todas as funções, reversão e logs com sessões reais.
- Executar build, checagem TypeScript e integração; testes de catálogo/importação não substituem esses testes.
- Não publicar site ou sobrescrever projetos atuais antes da aprovação dos testes.
