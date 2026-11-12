# Elab Hub — operação gratuita

## Status verificado

- O sistema já está implantado no Supabase existente; **nenhum serviço Railway foi ativado**.
- Versão homologada publicada na branch `main` em 12/11/2026, após merge do PR #1. A Lista da Vez também foi publicada no GitHub Pages e na Edge Function `elab-lista-da-vez` versão 2.
- 59 rotinas importadas **e ativas**. 53 seguem calendário explícito; 4 são atividades por ocorrência (podem ser registradas várias vezes por dia); 2 são mensais sem data definida (uma conclusão por mês, com início/fim como indicação textual, sem inventar dia específico).
- 3 operadores existentes vinculados: `dieggob` proprietário; `bruna nunes` recepção; `gabriele` gerência. As senhas não foram alteradas.
- 9 funcionários estão cadastrados como **pendentes**, sem criar contas ou senhas por adivinhação. O proprietário emite convites individuais para primeiro acesso.
- O estado original da Lista da Vez (id `lista-da-vez-principal`) é preservado no Supabase `public.elab_state`, com histórico e revisão próprios.

## Links publicados

- **Portal operacional e direção:** https://yrmsnykdxxqomkvxqnki.supabase.co/functions/v1/elab-rotinas
- **Lista da Vez — consulta pública e edição por função:** https://yrmsnykdxxqomkvxqnki.supabase.co/functions/v1/elab-lista-da-vez
- **Lista da Vez no GitHub Pages:** https://brgxbrasil.github.io/E.Lab/lista-da-vez.html
- API autenticada: `/functions/v1/operational`.
- Login por nome: `/functions/v1/elab-login`.
- Primeiro acesso com código do proprietário: `/functions/v1/elab-register`.
- Recuperação de senha com código do proprietário: `/functions/v1/elab-reset`.

## Acessos

- Proprietário: administração de funções, convites, recuperação, dashboard completo e todos os setores.
- Direção, Administração e RH: dashboard completo, leitura de equipe, registros e Lista da Vez, além dos acessos operacionais da direção. **Não podem reatribuir o proprietário nem gerar convites de proprietário.**
- Gerência: operações e Lista da Vez, sem painel de diretoria nem privilégios de atribuição de perfis.
- Recepção: rotinas de recepção e edição da Lista da Vez.
- Estoque: somente tarefas e eventos do estoque.
- Limpeza: somente tarefas e eventos da limpeza.
- Profissional: sem permissão para dados operacionais.
- Anônimo: pode consultar a Lista da Vez, **não pode alterar**.

O cadastro inicial exige um código de 64 caracteres emitido pelo proprietário, válido por 48 horas. A redefinição usa código distinto, válido por 24 horas. Ambos são armazenados somente como hash SHA-256. O funcionário escolhe senha com no mínimo 12 caracteres, letra, número e símbolo, sem incluir o primeiro nome. Contas sem endereço de e-mail próprio usam identificador interno do Auth; **a recuperação nesse caso depende do proprietário**.

## Histórico e calendário

- Rotinas diárias: aparecem todos os dias; horários são orientações textuais.
- Semanal: aparece somente no dia da semana definido.
- Três vezes por semana: aparece nos três dias confirmados.
- Mensal com dia definido: somente no dia indicado.
- Mensal sem dia definido: visível como **janela mensal flexível**; uma conclusão por mês.
- Por ocorrência: visível em sessão separada; múltiplas ocorrências e observações na mesma data.
- Eventos são registrados em transação com auditoria e ordem monotônica. Tarefas de calendário rejeitam dia incorreto; registros futuros são rejeitados.
- Painel da direção apresenta os totais operacionais, áreas, acessos, indicadores de fila por serviço e até 100 eventos recentes da Lista da Vez. O histórico completo permanece consultável na Lista da Vez.

## Testes e proteção de dados

- Foram executados no banco testes transacionais de proprietário, recepção, Administração, RH, estoque, limpeza e profissional, incluindo permissões, conclusão, reabertura, idempotência, dia incorreto, eventos repetíveis, auditoria e acesso público de leitura. **Todos foram revertidos**, não gerando históricos fictícios.
- Testes de regressão executados no GitHub Actions: **61 testes aprovados** no commit `09d4f62` e novamente após ajuste de teste, incluindo todas as dez filas e cenários de concorrência. A execução fica documentada em https://github.com/BRGXbrasil/E.Lab/actions/runs/43227770557 . Foi verificada em homologação a rejeição de gravação com revisão obsoleta, em transação revertida sem resíduo de teste.
- A publicação das funções está ativa segundo o painel Supabase; **não houve teste HTTP completo de ponta a ponta nem teste humano no navegador**. Este ambiente não conseguiu resolver DNS para o domínio de execução.
- As contas dos 9 funcionários pendentes ainda precisam receber convites e registrar suas senhas.
- A leitura pública da Lista da Vez pode expor dados de clientes e profissionais presentes no JSON existente. Isto atende à solicitação de consulta sem senha, mas requer avaliação de privacidade/LGPD se o link for distribuído indiscriminadamente.
- O Supabase sinaliza funções `SECURITY DEFINER` acessíveis a usuários autenticados; são usadas com verificação explícita de papel, mas ainda exigem revisão de segurança continuada.
- O recurso Supabase *Leaked Password Protection* é exclusivo de planos pagos; está desativado para respeitar o requisito de custo zero. A política de senha forte no cadastro é uma mitigação, **não equivalência**.
- Uso gratuito está sujeito às cotas e à possibilidade de pausa do projeto, sem garantia de disponibilidade ininterrupta. Não contratar overages ou serviços pagos.

## Manutenção e rollback

Todos os SQL estão versionados em `v2/free/001_*.sql` até `014_*.sql`. Nunca remover tabelas nem apagar `public.elab_state` para reverter. Antes de trocar o comportamento de produção, exportar o estado corrente, confirmar as permissões e comparar a revisão do JSON. O merge de 12/11/2026 foi expressamente autorizado. Antes de futuras alterações em produção, verificar o CI, o histórico da fila e o status da publicação.
