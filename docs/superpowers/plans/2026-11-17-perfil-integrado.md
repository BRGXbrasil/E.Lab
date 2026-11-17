# Meu Perfil integrado — plano de implementação

> Execução nesta sessão, com testes e revisão ao final.

**Objetivo:** publicar a revisão aprovada do formulário e receber respostas no painel autenticado do Hub.
**Arquitetura:** E.Lab/main como fonte do Hub; formulário idêntico no Meu-perfil. Supabase existente para envio público limitado, leitura por RLS e Realtime. Preservar o projeto Sites e sua audiência.
**Especificação:** revisão aprovada nesta conversa em 17/11/2026: capa enxuta, campos grandes, nome livre, Pular destacado, oito bebidas, sem subfrases, referência do dia, valet livre e confirmação somente após salvamento.

## Tarefas
- [x] Testar e ajustar formulário existente; remover subfrases e texto extra da capa, confirmar texto final; manter duas cópias idênticas. Casos: navegação, pular, erro e repetição idempotente, recusa de mensagens e consentimento de armazenamento.
- [x] Testar e implementar assinatura Realtime no painel existente com limpeza no logout e troca de função. Manter paginação, busca, atualização manual e consulta periódica de recuperação. Casos: evento novo, sessão antiga, fechamento da assinatura.
- [x] Revisar SQL e endpoint já testados em homologação; permitir origem exata do Sites; implantar novos objetos em produção, habilitar Realtime. Verificar anon sem leitura e equipe autorizada com leitura, envio e reenvio sem duplicação. Não migrar registros locais automaticamente.
- [x] Comparar módulos independentes ao catálogo integrado; acrescentar caminhos para operação no Hub e aviso de armazenamento local, preservando registros existentes.
- [ ] Publicar fontes no GitHub e mesmos arquivos no Sites, com manifesto e proveniência do commit E.Lab. Validar formulário anônimo e painel protegido; só então entregar link para divulgação.

## Verificação
Executar testes Node/Chromium de ambos projetos, testes SQL de permissões/idempotência/limite em transação, submissão fictícia real com exclusão do registro de teste, verificação de publicação e abertura sem sessão.

## Decisões
Reaproveitar PRs existentes em vez de reconstruir. A confirmação não anuncia agendamento. Dados pessoais nunca serão gravados em repositórios públicos. Ferramentas Sites de preparação não estão instaladas neste ambiente: Git autenticado em memória e empacotamento tar equivalente serão usados se necessário.

## Registro de execução

- Formulário: testes de navegação, pular, confirmação e repetição aprovados.
- Banco: objetos de produção criados sem alterar tabelas operacionais. SQL de permissões, idempotência e limites passou em transação revertida.
- Fonte Sites preservada em sites/; D1/R2 mantidos. Pacote histórico pessoal removido do código público.
- Sites usa identidade própria; leitura integrada é assinada no servidor. Supabase autentica o painel GitHub e Realtime.
- Comparação dos módulos: checklists independentes têm quatro itens locais por setor; Hub oferece catálogo operacional, autoria, histórico e compartilhamento. Acrescentados links para esses recursos, sem importar automaticamente dados locais.
- Rede do ambiente bloqueia acesso direto ao Sites, GitHub Pages e Supabase. Testes locais e SQL são possíveis; validação anônima externa permanece separada da confirmação de implantação.

- Revisão independente: rotas antigas /internal/* usavam constantes no código como autorização. Desativadas com HTTP 410; teste comprova que não leem nem alteram dados.

- Revisão independente: sessão expirada/revogada podia conservar dados privados na tela. Corrigida limpeza do estado e invalidação de respostas atrasadas, com teste que falhou antes da correção.

## Verificação final antes de publicar

- Formulário: 10 testes passaram. Painel E.Lab: 6 testes passaram. Hub Sites: 179 passaram, 2 testes dependentes de arquivos locais antigos foram pulados, como na linha de base.
- Revisão independente concluída; os dois problemas identificados foram reproduzidos e corrigidos com testes. Nenhum ajuste menor pendente.
- Inspeção móvel local: 390×844, campo de 72 px, sem excesso horizontal.
- Dados históricos existentes permanecem nos bancos. Apenas o código e metadados sanitizados serão publicados nos repositórios.
