# Entrega Meu Perfil — 17/11/2026

- Sites: versão 18 implantada com sucesso, deployment appgdep_6afc549de9948191984bdefc850c7c27.
- Fonte E.Lab/main: 3f2d248cf68c05cb0fdc22e7c51338ed5638b56f; fonte de publicação Sites: 319dee05208165463843aa8edd50e3cf27129e37, com proveniência registrada. Workers construídos nas duas fontes têm SHA-256 d7d9a9227632afb24cc37b91c8ced5dfb4b4eaa8b4c07e16f8817eda12fb83b4.
- Meu-perfil/main: fb4f6df09584d303bf1b06c061f69373706fe725. Formulário idêntico às cópias E.Lab e Sites.
- Recepção/main: 1bc0804; estoque/main: 43f0377; limpeza/main: cec611b. Links para operação compartilhada adicionados sem descartar registros locais.
- Produção Supabase: armazenamento com RLS, função de envio e leitura assinada implantados; publicação Realtime habilitada.
- Verificação: 179 testes Sites aprovados e 2 pulados por ausência dos arquivos locais legados; 10 testes Meu-perfil aprovados; 7 testes E.Lab aprovados; testes SQL de salvamento, repetição, conflito, limite e permissões passaram com fixtures revertidas. Inspeção Chromium móvel local sem excesso horizontal.
- Revisão independente: corrigidas rotas históricas de manutenção expostas por constantes e retenção de respostas em sessão revogada. Sem achados menores pendentes.

## Limites de validação

Implantação confirmada pelas ferramentas nativas Sites e Supabase. A rede do ambiente bloqueia o acesso HTTP ao Sites, GitHub Pages e Supabase; a ferramenta web também não abriu esses links. O fluxo completo pelo navegador em produção, um envio fictício real pelo endpoint e a abertura anônima em Painel › Todos não puderam ser validados. Não anunciar o Hub como disponível sem login. Respostas pessoais continuam restritas à equipe autorizada.

## Decisões de integração

O Hub Sites usa identidade própria; sua leitura é assinada no servidor, sem credenciais de banco no navegador. Os dados operacionais permanecem no D1/R2 original. Dados de clientes ficam no Supabase, nunca nos repositórios públicos. O pacote de recuperação histórica do Sites foi sanitizado antes de entrar no E.Lab público; dados já consolidados não foram alterados.
