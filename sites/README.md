# E.Lab Hub no Sites

Fonte canônica da publicação Sites, mantida no repositório BRGXbrasil/E.Lab.

Execute `npm ci`, `npm run build` e `npm test` nesta pasta. O formulário em `public/meu-perfil/index.html` é uma cópia idêntica de `../meu-perfil/index.html`, conferida antes da publicação. Produz Worker em `dist/server/index.js`, mantendo o manifesto de projeto e bindings existentes.

Publicação: espelhar esta pasta no repositório fonte do Sites, construir a partir do mesmo commit E.Lab e empacotar `dist/` com o manifesto na raiz do tar. Segredos ficam exclusivamente nas variáveis de ambiente do Sites.

Perfis enviados por clientes ficam no Supabase; operações e históricos existentes permanecem no D1. Painel da recepção consulta respostas automaticamente a cada 3 segundos. O frontend nunca recebe a chave de assinatura nem chaves de servidor.

A recuperação histórica embutida foi sanitizada para o repositório público. Registros já consolidados permanecem no D1; esta versão não copia os históricos pessoais para o GitHub.

## Acesso sem login durante os testes

A variável de ambiente de produção `ELAB_TEST_ACCESS=enabled` libera todos os módulos do Hub com perfil de gestão, inclusive gravações e consulta dos perfis recebidos, conforme autorização do proprietário. A tela identifica o acesso de teste e as gravações usam o ator `teste-sem-login@elab.invalid`. A conta proprietária continua protegida contra alterações pelo painel.

Para reativar o login, defina `ELAB_TEST_ACCESS=disabled` (ou remova a variável) e reimplante a versão salva. O valor padrão exige login. A ativação depende exclusivamente da variável do servidor; cabeçalhos e parâmetros enviados pelo visitante não a habilitam. Nenhuma política de leitura pública é adicionada ao Supabase.
