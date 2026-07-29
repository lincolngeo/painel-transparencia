# Painel de Transparência da SEDEC — Recursos de Resposta a Desastres

Painel público digital interativo para o **acompanhamento dos recursos e processos
federais** das ações de resposta a desastres, repassados/geridos pela SEDEC/MIDR —
voltado ao **controle social e à transparência**. Segue a arquitetura e a
identidade visual do Painel ICM (Defesa Civil Brasil), mas com o **dashboard no
centro** e o **mapa como painel auxiliar**.

> **Piloto:** ações de **resposta** (socorro, assistência e restabelecimento),
> recorte **2026**. Reconstrução será avaliada para inclusão posterior (aba própria).

## O que o painel entrega

- **Dados desagregados**: por município (com busca nominal), UF e região; por fase
  da ação (socorro/assistência × restabelecimento); por finalidade (custeio ×
  investimento); por situação do processo (funil de admissibilidade).
- **Filtros com cruzamento interativo** que reagem em todos os cards, no mapa, no
  ranking e no **detalhamento (tabelão)**; exportação em **CSV** e **relatório PDF**
  do recorte selecionado.

## Indicadores

- **Recurso liberado** e **valor solicitado** (R$), por qualquer recorte.
- **Acesso ao recurso** — % das solicitações analisadas pela SEDEC que chegaram ao
  repasse (leitura *neutra/diagnóstica*).
- **Dificuldade do ente** — % de processos financeiros em rascunho ou excluídos
  pelo ente (tentativas que não avançaram).
- **Funil de admissibilidade** — rascunho → em análise → devolvido ao ente →
  excluído pelo ente → indeferido pela SEDEC → formalização → recurso transferido →
  prestação de contas (+ OCP como trilha própria).
- **Evolução mensal** — solicitações do ente × processos com liberação ao longo do ano.
- **Dificuldade por UF** — % que não avançou (ente) × % indeferido (SEDEC).
- **Desempenho de prazos** (medianas, em dias): esforço do **ente** (desastre →
  solicitação) × tempo interno da **SEDEC** (análise e liberação).
- **Mapa** com quatro métricas: R$ liberado, nº de processos, % de acesso e
  **dificuldade do ente**.
- **Detalhamento (tabelão)**: todos os processos do recorte, com protocolo, datas,
  prazos, valores, situação, município, UF e desastre — ordenável e exportável.

## Operação Carro Pipa (OCP)

As solicitações de OCP (resposta à estiagem/seca) são **encaminhadas ao Exército
Brasileiro** — repasse a outra instituição, sem transferência financeira direta
pela SEDEC. Por isso **entram na contagem geral de processos** (como trilha própria,
rotulada), mas ficam **fora dos indicadores financeiros** (valor liberado e taxa de
acesso). A planilha dedicada de Kits está vazia no recorte; casos pontuais de kits
em ajuda humanitária são liberações financeiras normais e permanecem como tal.

## Dados

Gerados por `scripts/etl/etl_transparencia.py` a partir das seis tabelas
gerenciais do S2iD em `dados/brutos/s2id/acoes_de_resposta/2026/` (arquivos `.xls`
que são, na verdade, OOXML/`.xlsx`). A tabela **Acompanhamento de Processos** é a
espinha; as demais (Recursos Liberados, Prazo de Análise, Prazo de Solicitação,
Prazo de Liberação) são cruzadas pelo **nº de Processo (SEI)**. O **código IBGE**
do município é extraído do Protocolo (`RES-UF-DDDDDDD-…`).

Regras aplicadas (ver cabeçalho do ETL):
- **Deduplicação por processo**: múltiplos protocolos do mesmo nº de processo são
  revisões do mesmo pleito e colapsam para a versão mais avançada — evita dupla
  contagem financeira. (Total liberado reconcilia com a fonte: ~R$ 359,5 mi.)
- Pleitos **"Grupo de municípios"** (estaduais/multimunicipais, sem IBGE único)
  agregam no nível da UF.
- Classificação de `Status` em situação/funil é **neutra**. `sit`/`grp` separam
  rascunho, excluído (ente), indeferido (SEDEC), devolvido, em análise,
  formalização, transferido, prestação de contas e OCP.
- **Todos os ~1.862 registros** (após colapsar revisões) contam: rascunhos e
  excluídos sem nº de processo (só protocolo) integram a estatística de
  **dificuldade do ente**; OCP entra na contagem, fora do financeiro (`trilha`).
- Fase da ação e finalidade só existem para processos que avançaram
  (solicitação/liberação); os demais ficam como **"não informada"**.

Saída: `dados/dados.json` = `{ meta, processos[] }` (um registro por processo,
chaves compactas). Todas as agregações e filtros são feitos no navegador.
Malhas: `dados/uf.geojson` e `dados/mun/<UF>.geojson` (IBGE 2025), reaproveitadas
do Painel ICM.

## Como abrir / atualizar / publicar

- **Abrir local**: duplo-clique em **`abrir_painel.bat`** (servidor em
  `http://127.0.0.1:8767/`). Não abra o `index.html` direto (`file://` bloqueia os
  dados).
- **Atualizar dados**: substitua os `.xls` em
  `dados/brutos/s2id/acoes_de_resposta/2026/` (mantendo os nomes) e duplo-clique em
  **`atualizar_painel.bat`** — ele reprocessa e regenera `dados/dados.json`.
- **Publicar**: subir a pasta para **GitHub Pages** — 100% estático. O mapa base é
  o próprio vetor (sem dependência de tiles externos).

## Identidade visual

Manual de Marca — Defesa Civil Brasil: marca quadrada no cabeçalho, azul `#272F68`,
laranja `#F4A44C`, fonte **Mukta** (livre). Paleta de situação semântica sempre
acompanhada de rótulo textual (acessibilidade). Gráficos em ECharts; mapa em
Leaflet. Tudo vendorizado — sem CDNs.

## Roadmap

- Aba **Reconstrução** (dados S2iD), alternável com Resposta.
- Novos recortes temporais (intervalos de 365 dias) conforme extração no S2iD.
- Avaliar migração do mapa para **PMTiles + MapLibre** (vetor mais rico).
- Versão responsiva para tablet/celular (após validação da versão desktop).

## Licença e autoria

Elaboração: **Lincoln Duques de Barros** — Analista de Infraestrutura, SEDEC/MIDR.
Protótipo em avaliação. Dados públicos (S2iD/SEDEC); malha territorial IBGE.

© 2026 Lincoln Duques de Barros. Este trabalho está licenciado sob
**Creative Commons Attribution 4.0 International (CC BY 4.0)** — veja o arquivo
[`LICENSE`](LICENSE) e o [`NOTICE`](NOTICE). Você pode copiar, redistribuir e
adaptar para qualquer finalidade, inclusive institucional, **desde que mantenha a
atribuição ao autor**, indique se houve modificações e referencie a licença.

**Intenção de migração:** protótipo elaborado no âmbito da SEDEC/MIDR, destinado à
eventual incorporação institucional. A CC BY 4.0 permite essa migração preservando
o crédito de autoria. A licença recai sobre o painel (código, organização e
textos), não sobre os dados oficiais de origem (S2iD/SEDEC e malha do IBGE).
