# E.Lab Hub no Sites

Fonte canônica da publicação Sites, mantida no repositório BRGXbrasil/E.Lab.

Execute `npm ci`, `npm run build` e `npm test` nesta pasta. O formulário em `public/meu-perfil/index.html` é uma cópia idêntica de `../meu-perfil/index.html`, conferida antes da publicação. Produz Worker em `dist/server/index.js`, mantendo o manifesto de projeto e bindings existentes.

Publicação: espelhar esta pasta no repositório fonte do Sites, construir a partir do mesmo commit E.Lab e empacotar `dist/` com o manifesto na raiz do tar. Segredos ficam exclusivamente nas variáveis de ambiente do Sites.

Perfis enviados por clientes ficam no Supabase; operações e históricos existentes permanecem no D1. Painel da recepção consulta respostas automaticamente a cada 3 segundos. O frontend nunca recebe a chave de assinatura nem chaves de servidor.

A recuperação histórica embutida foi sanitizada para o repositório público. Registros já consolidados permanecem no D1; esta versão não copia os históricos pessoais para o GitHub.
