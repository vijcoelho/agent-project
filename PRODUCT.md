# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Cockpit organiza projetos, missões e agentes de IA em CLIs locais. O usuário acompanha trabalho em paralelo, abre arquivos e mantém o contexto entre agentes.

## Users

O usuário deste projeto quer operar seus agentes com pouca informação na tela inicial e abrir os detalhes por clique.

## Capabilities and Constraints

React, TypeScript, Vite, Express, WebSocket e terminais xterm sobre PTY. Preservar processos, histórico dos terminais, proteção de edições, projetos, missões, squads, políticas de IA, voz e continuidade. Não fabricar progresso semântico a partir de atividade do terminal.

## Brand Commitments

Redesign autorizado em 10/09/2026 a partir de PLANO-REDESIGN-UI.md: base preta, cinza e branca; cor apenas como identidade de cada agente. Referências expressas: vijcoelho.com, x.ai/bot e bridgemind.ai.

Correção de rumo pedida pelo usuário em 10/09/2026, prevalece sobre as ilhas do plano original: as missões moram numa lateral estilo VS Code, como uma árvore de pastas, para dez missões coexistirem; a tela principal é o terminal e nada mais — sem grade de cartões de agente; controles secundários (arquivos, atividade, ajustes, idioma do ditado, microfone) ficam na lateral. Cada agente tem um mascote (SVG próprio no modelo do bloub.vercel.app: forma por hash do id, expressão vinda do estado real do painel, cor de identidade) animado na lateral, no cabeçalho do terminal e no canto do palco; as missões ficam numa ilha. Referência visual entregue pelo usuário: Downloads/veja-aqui.png. Implementar progressivamente e registrar checkpoints.

## Evidence on Hand

README.md, web/App.tsx, web/api.ts, web/Pane.tsx e PLANO-REDESIGN-UI.md. Referências externas consultadas por texto; reprodução visual exata não foi solicitada nem validada.
