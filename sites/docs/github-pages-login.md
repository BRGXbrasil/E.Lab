# Acesso direto pelo GitHub Pages

Entrada: https://brgxbrasil.github.io/E.Lab/ — sem redirecionar para o ChatGPT.

O HTML usa a mesma interface do Hub, gerada por `node scripts/build.mjs` e `node scripts/build-pages.mjs`. Os arquivos de `outputs/pages/` são publicados na raiz e em `assets/` do repositório principal. O SDK Supabase 2.76.1 é hospedado junto ao site; somente a chave publicável consta no cliente.

O login usa e-mail/senha do Supabase Auth ou o nome já cadastrado via `elab-login`. Não cria nem altera contas ou senhas. A função `elab-hub-identity` valida a sessão no Auth e consulta o vínculo ativo em `elab_ops_members`; dados editáveis do usuário não concedem permissões. A função não oferece cadastro público.

O backend operacional existente e seus dados permanecem no mesmo banco. A API aceita a origem exata do GitHub Pages com Bearer obrigatório, valida cada sessão antes de acessar registros e preserva os controles de setor. O contexto privado da assistente usa a identidade Supabase, sem depender de cookies entre sites. Arquivos importados e seus downloads usam o mesmo transporte autenticado. A saída limpa a sessão local e recarrega a página.

A validação automatizada cobre CORS, token ausente/inválido, permissões, autoria, isolamento da assistente e construção do site. Acesso positivo com uma senha real deve ser validado pela pessoa titular; nenhuma senha foi criada ou substituída para testes.

O acesso anônimo temporário (`ELAB_TEST_ACCESS`) é desativado nesta publicação. A entrada antiga direciona visitantes ao GitHub Pages; o formulário público das clientes continua disponível.
