# E.Lab Hub no Sites

Fonte canônica da publicação Sites, mantida no repositório BRGXbrasil/E.Lab.

Execute `npm ci`, `npm run build` e `npm test` nesta pasta. O formulário em `public/meu-perfil/index.html` é uma cópia idêntica de `../meu-perfil/index.html`, conferida antes da publicação. Produz Worker em `dist/server/index.js`, mantendo o manifesto de projeto e bindings existentes.

Publicação: espelhar esta pasta no repositório fonte do Sites, construir a partir do mesmo commit E.Lab e empacotar `dist/` com o manifesto na raiz do tar. Segredos ficam exclusivamente nas variáveis de ambiente do Sites.

Perfis enviados por clientes ficam no Supabase; operações e históricos existentes permanecem no D1. Painel da recepção consulta respostas automaticamente a cada 3 segundos. O frontend nunca recebe a chave de assinatura nem chaves de servidor.

A recuperação histórica embutida foi sanitizada para o repositório público. Registros já consolidados permanecem no D1; esta versão não copia os históricos pessoais para o GitHub.

## Acesso sem login durante os testes

A variável de ambiente de produção `ELAB_TEST_ACCESS=enabled` libera todos os módulos do Hub com perfil de gestão, inclusive gravações e consulta dos perfis recebidos, conforme autorização do proprietário. A tela identifica o acesso de teste e as gravações usam o ator `teste-sem-login@elab.invalid`. A conta proprietária continua protegida contra alterações pelo painel.

Para reativar o login, defina `ELAB_TEST_ACCESS=disabled` (ou remova a variável) e reimplante a versão salva. O valor padrão exige login. A ativação depende exclusivamente da variável do servidor; cabeçalhos e parâmetros enviados pelo visitante não a habilitam. Nenhuma política de leitura pública é adicionada ao Supabase.

## Lista da Vez, setores e performance

A Agenda usa a ordem futura de todo o cadastro operacional, sem filtrar nem exibir presença do dia. Agora usa a presença atual: “Passou a vez” avança quem está na vez; “Ausente” registra saída após uma chegada, preserva o horário de entrada e sincroniza a indisponibilidade em todas as filas pelo histórico de presença.

O Comercial possui painel, cronograma, execução e histórico próprios e é responsável por conversões D0–D7, ativações, reativações e pós-atendimento. As rotinas `reception-003` e `reception-005` mantêm seus IDs e frequências, mas passam ao Comercial. A propriedade das execuções históricas é resolvida pelo ID da rotina, sem regravar registros ou revisões. Agenda, atendimento presencial e caixa ficam na Recepção. A função `commercial` permite atuar no setor, consultar Resultados/Meu Perfil e não concede operação de fila, estoque ou importações.

Resultados usa as linhas normalizadas do AVEC 0031 para visão executiva, performance por profissional, evolução mensal, categorias/serviços, carteira e oportunidades observadas. Receita de serviços não representa recebimento de caixa. Ticket é calculado por comanda/unidade/data; primeira visita e retorno são observações do histórico importado. Rotatividade, canais e informações não presentes no 0031 não são inventados. A carteira completa do salão continua independente do filtro do comparativo operacional.


Resultados reproduz o modelo individual de cinco páginas do Drive `Relatório_de_Performance.html` (ID `1UIlMBoKQ1Ug_4P_kc-3qjKwk4JPL6OxM`), com visual branco/dourado, filtros e impressão PDF. Os exemplos do modelo não são dados operacionais. Retornos 30/60 dias usam clientes com janela completa; frequência usa intervalos entre datas distintas. Segmentação exclusiva: em risco (>60 dias), VIP (>=5 comandas), recorrente (>=2), ativa. Oportunidades exibem receita histórica, sem previsão. Nível, ocupação e avaliação interna permanecem não informados por falta dos critérios/dados correspondentes.


Agenda possui ponteiro próprio, separado de Agora. Reservas ficam separadas em futuras, para conferência na data, encerradas e recuperadas sem data conhecida. Cancelamento ou não comparecimento devolve a vez uma única vez; conclusão exige data já alcançada e não duplica contagens de atendimentos. A recuperação combina os registros e as auditorias existentes sem reabrir reservas encerradas nem inventar datas.

Conferência de vitrine fica no Estoque (abertura diária); limpeza das vitrines mantém frequência semanal e ID histórico, agora no setor Limpeza. O círculo de progresso usa o setor/data selecionados e exclui rotinas não aplicáveis do denominador. Presença inclui Diego e Déia; o horário de Déia permanece a definir e pode ser informado para cada jornada na primeira marcação. Nenhuma chegada é marcada automaticamente.
