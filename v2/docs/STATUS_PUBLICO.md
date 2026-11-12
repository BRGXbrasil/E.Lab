# E.Lab Unificado 2.0 — branch de desenvolvimento

Esta branch não modifica a publicação do GitHub Pages. O objetivo é evoluir a aplicação em etapas verificáveis.

## Cronogramas (confirmados em 09/11/2026)

- Recepção: 9 definições.
- Estoque: 16 definições; a tarefa "Conferir produtos próximos do vencimento" é **mensal, dia 15**.
- Limpeza: 34 definições; limpeza pesada **segunda-feira**; tarefas três vezes por semana **terça, quinta e sábado**.
- Total: **59 definições**, sem dados pessoais.

O arquivo `data/cronogramas-operacionais.json` é o catálogo sanitizado. A migração `drizzle/0002_operational_catalog_staging.sql` cria tabelas de definição/evento e insere as 59 tarefas com `active=false`. **A implantação real e a ativação ainda não ocorreram.**

## Testes e limites

- `node --test tests/cronogramas.test.mjs`: 5 testes passaram no ambiente de preparação.
- Testes completos de TypeScript, aplicação e migração de MySQL ainda exigem instalar dependências e configurar um banco isolado. A instalação offline foi bloqueada por dependência ausente no espelho local; não contornamos a política.
- Migração de históricos reais (Supabase, armazenamento local e planilhas com clientes) **não foi realizada**. Exige backup, exportações autorizadas e conferência por IDs, datas e consentimentos.
- Arquivos com links privados do Drive, nomes de clientes, inventários de repositórios privados e segredos não devem entrar nesta branch pública.

## Próxima etapa

Concluir execução das rotinas por calendário com autoria e auditoria; testar operações e permissões em ambiente de homologação; preparar migradores de históricos com ensaio/dry-run; somente depois avaliar implantação.
