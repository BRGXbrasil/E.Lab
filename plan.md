# E.Lab — integridade da fila e histórico

## Abordagem
- Centralizar elegibilidade e rotação em `queue-logic.js`.
- Diferenciar ocupada (temporária, preserva `nextUp`) de ausente (perde a vez).
- Registrar eventos reais de status, passagem, atendimento e agenda no estado sincronizado.
- Remover o botão/evento “Único disponível”; a condição de uma única elegível será derivada dos status.
- Manter compatibilidade com `elab_state` e adicionar revisão otimista para reduzir sobrescritas concorrentes.
- Preservar dados legados, marcando eventos antigos sem reclassificação automática.

## Design
A interface existente será preservada, com uma linha do tempo de eventos filtrável e legenda operacional. O tom permanece editorial/boutique: fundo quente, marrom profundo, verde para disponibilidade e pêssego para operações.

## Estrutura
- `lista-da-vez.html`: aplicação publicada, interface, persistência e integração Realtime.
- `queue-logic.js`: regras centrais reutilizáveis no navegador.
- `queue-logic-node.js` / `queue-logic.test.js`: espelho testável e testes automatizados.
- Supabase `elab_state`: estado sincronizado e eventos embutidos, com revisão.
