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

## Assistente E.Lab no painel

O chat do painel só fica disponível para membros identificados e autorizados. A flag de teste e o link temporário não dão acesso aos novos endpoints. Perfis RH e ADM usam o painel de acompanhamento das áreas sem adquirir os controles administrativos da gestão. O acesso do aplicativo continua usando a sessão do Sites.

- Salve a chave como segredo do servidor com o nome OPENAI_API_KEY. PROCEDURE_AI_MODEL e ELAB_WEB_MODEL são opcionais.
- A baixa por chat considera as rotinas aplicáveis na data de São Paulo, o setor selecionado, a identidade real e a chave de ocorrência já usada pelo Hub. Mensagens ambíguas não alteram o registro. Orientação externa requer um novo clique após ausência de resposta interna. A busca externa recebe um tema público predefinido, sem o texto enviado no chat.
- ELAB_DRIVE_INDEXES é um objeto JSON de IDs de bases privadas indexadas, separado por escopo: shared, management, reception, commercial, controls e cleaning. Use somente documentos próprios de cada audiência. O código consulta esses índices quando configurados. Ele não sincroniza automaticamente a pasta do Drive nem publica arquivos. Sem os índices, consulta só o catálogo instalado no Hub.
- ELAB_MONDAY_TOKEN é um segredo do servidor, de uma credencial autorizada no quadro E.Lab da conta BRGXbrasil. A integração é limitada ao quadro 18416621523 e projeta as colunas de status, responsável, prazo e prioridade. A baixa de um item exige confirmação, autoriza só o status Concluído e registra o ator no Hub. Por padrão só gestão pode confirmar no Hub. Use ELAB_MONDAY_TEAM_WRITES=enabled apenas se todos os perfis autorizados no painel tiverem permissão para alterar o quadro compartilhado. Sem a credencial, aparece apenas o acesso direto ao quadro.

## Agente externo do Monday

Callback de produção: /api/monday/webhook. Somente POST autenticado por HMAC sobre os bytes originais, ID do agente e janela de cinco minutos. O identificador de reenvio não guarda o corpo ou o token da conversa. O agente não baixa anexos enviados ao webhook e não interpreta a assinatura do serviço como login de um membro do Hub.

- ELAB_MONDAY_AGENT_ID: identificador do agente autorizado
- ELAB_MONDAY_SIGNING_SECRET: segredo de assinatura fornecido pelo Monday após configurar o callback
- ELAB_MONDAY_AGENT_TOKEN: credencial do agente para responder às conversas e postar nas threads do quadro E.Lab
- ELAB_MONDAY_MCP_TOKEN: opcional se o host MCP exigir uma credencial distinta. O comando "verificar MCP" confere a negociação e a disponibilidade de ferramentas em modo somente leitura.

Sem os primeiros parâmetros, o webhook fica indisponível, sem aceitar chamadas anônimas. Mensagens no Monday não podem consultar dados privados do Hub nem registrar rotinas em nome da equipe. Os segredos do webhook não substituem o ELAB_MONDAY_TOKEN usado pelo painel.


## Atualização operacional — painel, permissões e reposição

O Painel abre em Todos e aceita todos os setores autorizados, incluindo Comercial. A faixa de progresso resume ativações em acompanhamento, ações com prazo, rotinas pendentes e registros que exigem atenção. Indicadores de performance ficam na aba Indicadores; disponibilidade mostra previstos e presentes, sem presumir atendimentos em andamento. O quadro Monday é apresentado em tabela dentro do Hub, via leitura do quadro autorizado. A conexão existente do agente pode fazer consultas, sem habilitar mutações por essa credencial.

Configuração de rotinas, catálogos, política de estoque e ativações estruturais exige Gestão/Proprietário. Operadores executam tipos configurados e criam ocorrências na própria área; evolução das ativações tem eventos imutáveis. Assistentes usam identidade autenticada ou escopo aleatório em cookie privado no modo de teste; respostas e rascunhos locais são limpos na troca de identidade. Classes ficam ocultas temporariamente.

Reposição utiliza movimentos datados por produto e medida, consumo médio na janela do próprio produto, posição histórica e projeções para hoje e para a chegada. Prazo padrão: 10 dias; atenção até 15 dias de cobertura e urgência no prazo de entrega ou abaixo. Quantidade depende de cobertura pós-chegada validada e série confiável; não existe compra automática sem consumo. Consumo manual exige validação por produto/medida, não pode ser global. Posições recebidas sem data de emissão permanecem identificadas para conferência. Movimentações locais geram registros individuais com saldo anterior/posterior, motivo e autoria.

Meu Perfil oferece convite e link copiáveis do formulário verificado. O domínio elab.boutique ainda precisa de verificação externa; não foi assumido como publicado. Arquivamento de perfis exige ID, data de criação e nome exatos, guarda a cópia privada no bucket e mantém apenas metadados na auditoria. Homônimos e os cadastros reais da equipe permanecem independentes. A Central AVEC permite importação manual com validação e histórico; integração autenticada futura não é simulada.


A consulta de Procedimentos reconhece títulos do catálogo diretamente e devolve somente etapas cadastradas. Se o serviço de IA não responder, a área continua consultável pelo catálogo; não é inventada uma orientação substituta. A Central AVEC carrega tipos permitidos e histórico ao abrir, e atualiza esse histórico após a consolidação dos arquivos. Sugestões de relacionamento do Comercial não são exibidas no painel de Estoque ou Limpeza.
