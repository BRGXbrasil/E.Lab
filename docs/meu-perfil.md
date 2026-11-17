# Meu Perfil E.Lab

Formulário baseado no HTML fornecido para revisão. `index.html` e `perfil-elab-standalone.html` devem permanecer idênticos.

As respostas não são gravadas no GitHub nem no localStorage. O envio usa a função `elab-profile-submit` do Supabase e a tabela `elab_client_profiles`. A função valida campos e consentimentos, limita cada endereço a 30 novos envios por hora e aceita novas tentativas idênticas sem duplicação. Endereços são representados apenas por hash HMAC diário; o endereço bruto não é armazenado nesta tabela. O limite depende dos cabeçalhos encaminhados pelo gateway; não substitui proteção contra ataques distribuídos.

Somente usuários ativos com função `owner`, `director`, `admin`, `manager` ou `reception` podem ler os perfis, conforme RLS no banco. Visitantes não podem consultar, alterar ou excluir registros. Chaves de servidor ficam no ambiente da função. A chave pública no HTML identifica a aplicação e não é um segredo nem substitui RLS.

A autorização de armazenamento inclui as informações de saúde que a cliente decidir compartilhar. Os três consentimentos de mensagens, novidades e imagem permanecem separados. A versão do texto é `2026-11-16`; alterações no texto exigem nova versão. A confirmação final não confirma agendamento.

## Integração com o Elab Hub

O Hub lê a mesma tabela pela sessão já autenticada. O módulo `meu-perfil/painel.js` no repositório E.Lab fornece busca, páginas de 25 perfis e atualização a cada 30 segundos enquanto a aba está visível. Os dados renderizados são limpos ao sair. Respostas são renderizadas por `textContent`.

## Publicação coordenada

1. Aplicar `database/profile-storage.sql` no projeto de produção usado pelo Hub, `yrmsnykdxxqomkvxqnki`. A migração cria apenas objetos novos, sem modificar dados existentes.
2. Implantar `supabase/functions/elab-profile-submit/index.ts` e `core.mjs` com verificação JWT do gateway desativada. A função valida a chave pública da aplicação; o gateway valida a chave do projeto. Isso permite o formulário público sem login. A leitura continua protegida por RLS. As variáveis Supabase de URL e chave de servidor são fornecidas pelo ambiente; não as copie para o HTML.
3. Publicar os dois PRs coordenadamente: formulário em Meu-perfil e formulário/painel no E.Lab. Não mesclar antes de o endpoint de produção estar pronto.
4. Conferir um envio fictício no painel com uma conta autorizada e remover somente esse registro de teste.

Homologação: `yccndhykuvsduolvtmfi`. Migração e endpoint implantados e testados em homologação; produção ainda não alterada. O teste real repetiu um envio fictício e confirmou um único registro. O SQL de verificação testa permissões, idempotência, conflitos e limite, com fixtures revertidas por ROLLBACK.

## Verificação

Node 24. Execute `npm ci`, `npx playwright install --with-deps chromium` e `npm test`. Para Chromium já instalado, defina `CHROMIUM_PATH=/usr/bin/chromium`.

Testes: navegação e falha seguida de nova tentativa, preservação do envio pendente, validação de payload, consentimentos recusados, acesso do banco, idempotência e limites. No Hub também há testes de paginação, renderização segura e concorrência de sessões.

Em falha de confirmação, o envio exato fica preservado na memória da página, com edição temporariamente bloqueada para evitar que uma tentativa já salva seja reenviada com dados diferentes. Fechar ou recarregar a página descarta essa memória. A cliente pode pedir correção ou exclusão pela recepção; estes pedidos devem ser executados por administração autorizada no banco.
