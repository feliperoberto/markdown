# Guia de Copy e Microcopy

Este guia registra a voz do produto e as convenções de terminologia usadas em
todo texto voltado ao usuário (botões, diálogos, toasts, estados vazios,
rótulos de acessibilidade). O objetivo é permitir que novas features
mantenham consistência sem exigir revisão de design para cada string.

## 1. Princípios de voz

A voz do app é intencional e diferenciada — não é o tom genérico de SaaS
corporativo. A referência é a tagline da splash screen:

> "Você marca com a mão. A máquina lê a estrutura."

Dessa tagline derivam quatro princípios:

1. **Direta** — frases curtas, verbos no imperativo ou no presente. Sem
   rodeios corporativos ("Sentimos muito, mas...", "Por gentileza...").
2. **Calorosa, não fofa** — o tom é acolhedor mas nunca infantilizado. Evite
   exclamações em excesso ou linguagem de app de consumo genérico
   ("Uhul!", "Prontinho!").
3. **Levemente literária** — o produto trata "marcar" (markup) quase como um
   gesto manual, análogo à escrita à mão. Onde fizer sentido (splash, estados
   vazios, título da página), é aceitável usar essa metáfora com moderação.
   Isso não deve extrapolar para copy operacional (toasts de erro, rótulos de
   input), que deve continuar direta e funcional.
4. **Nunca corporativa/genérica** — evite jargão de produto ("otimize seu
   fluxo", "leve sua produtividade ao próximo nível", "experiência
   perfeita"). Descreva o que a ação faz, sem inflar.

## 2. Glossário de termos canônicos

| Conceito | Termo canônico | Evitar |
|---|---|---|
| Unidade de texto markdown do usuário | **arquivo** | "documento", "nota", "item" |
| Agrupamento de arquivos | **projeto** | "pasta", "workspace", "coleção" |
| Remover um arquivo/projeto permanentemente | **excluir** | "deletar", "remover", "apagar" |
| Trocar o nome de um arquivo/projeto | **renomear** | "editar nome", "mudar nome" |
| Ação de escrever/formatar em Markdown | **marcar** (na voz de marca) / **escrever** (copy funcional) | "digitar", "codificar" |
| Botão que efetiva uma ação em diálogo | **Confirmar** (genérico) ou o verbo específico da ação ("Criar", "Renomear", "Excluir") | "OK", "Sim", "Enviar" |
| Botão que cancela um diálogo | **Cancelar** | "Voltar", "Fechar" (reservado para fechar modais sem ação pendente) |

Nota sobre "excluir" vs. "deletar": ambos aparecem na base de código por
terem sido introduzidos em PRs diferentes (#15 introduziu "Excluir arquivo"
nos rótulos ARIA; #16 introduziu "Deletar projeto" nos novos diálogos). Esta
revisão padronizou tudo para **excluir**, por ser o termo em português
corrente (sem anglicismo) e por já ser o termo usado nos rótulos de
acessibilidade existentes.

## 3. Formalidade

- Trate o usuário na segunda pessoa informal, sem pronome explícito sempre
  que possível ("Digite um nome", não "Você deve digitar um nome" nem
  "Digite o seu nome, por favor").
- Sem "por favor" em copy operacional — o tom direto já é cordial pelo
  contexto, não pela formalidade.
- Erros técnicos (ex.: falha de rede, erro de API) podem incluir a mensagem
  técnica original após dois-pontos, mas sempre precedida de uma frase em
  português claro: `"Erro ao salvar: " + err.message`.

## 4. Pontuação e capitalização

- **Títulos de diálogo**: substantivo ou frase nominal curta, sem ponto
  final. Ex.: "Novo projeto", "Renomear arquivo", "Excluir projeto".
- **Labels de input**: substantivo, sem ponto final. Ex.: "Nome do arquivo".
- **Placeholders de exemplo**: sempre no formato `Ex.: <exemplo>`. Ex.:
  `Ex.: Meu Projeto`, `Ex.: notas`.
- **Mensagens de validação inline**: frase completa, imperativa, terminada
  com ponto final. Ex.: "Digite um nome para o arquivo.",
  "Já existe um arquivo com esse nome."
- **Mensagens de confirmação (dialog message)**: frase interrogativa
  terminada com `?`, seguida de aviso de irreversibilidade quando aplicável,
  terminado com ponto final. Ex.: `Excluir o projeto "X" e todos os seus
  arquivos? Essa ação não pode ser desfeita.`
- **Toasts de sucesso**: frase curta, sem sujeito, no particípio ou
  substantivo + particípio. Pode usar emoji como reforço visual (não como
  substituto de texto). Ex.: "✅ Projeto criado", "🗑 Arquivo excluído",
  "📦 Projeto baixado".
- **Toasts de aviso** (`warning`): frase curta pedindo a ação que falta.
  Ex.: "Selecione um projeto", "Selecione um arquivo".
- **Toasts de erro** (`error`): sempre no formato "Erro ao <verbo no
  infinitivo>: <detalhe técnico>" quando há uma causa técnica disponível.
  Ex.: "Erro ao importar: ...", "Erro ao salvar: ...". Quando não há detalhe
  técnico útil para o usuário, usar frase direta sem dois-pontos: "Não foi
  possível copiar".
- **Estados vazios**: frase curta, tom levemente literário é aceitável aqui
  (é a "moldura" da tela, não uma ação). Ex.: "Nenhum arquivo aberto",
  "Nenhum projeto ainda. Marque o primeiro."
- **Rótulos ARIA (aria-label/title)**: sempre no infinitivo verbal + objeto,
  descrevendo a ação do botão, nunca o estado. Ex.: "Abrir menu de
  projetos", "Renomear arquivo notas.md", "Excluir arquivo notas.md". Nomes
  de arquivo/projeto dinâmicos entram no fim do rótulo, sem aspas.

## 5. Exemplos: bom vs. ruim

| Contexto | Bom | Ruim | Por quê |
|---|---|---|---|
| Botão de criar projeto | "Criar" | "Enviar" / "OK" | O verbo específico da ação é mais claro que um genérico de formulário |
| Erro de nome duplicado | "Já existe um projeto com esse nome." | "Nome inválido." | Diz exatamente qual é o problema |
| Toast de exclusão | "🗑 Arquivo excluído" | "Deletado com sucesso!" | Anglicismo + exclamação genérica de app |
| Estado vazio da lista de projetos | "Nenhum projeto ainda. Marque o primeiro." | "Você ainda não tem projetos. Clique abaixo para começar!" | Mantém o verbo "marcar" da marca, sem instrução redundante de UI |
| Erro de sincronização | "Falha ao sincronizar com o Drive: <detalhe>" | "Oops, algo deu errado!" | Nomeia a operação que falhou; evita "oops" genérico |
| Confirmação de exclusão | "Excluir o projeto \"X\" e todos os seus arquivos? Essa ação não pode ser desfeita." | "Tem certeza?" | Explicita o escopo e a irreversibilidade da ação |

## 6. Estados novos adicionados nesta revisão (#17)

- **Lista de projetos vazia** (`#projectsList` sem projetos): antes não
  existia copy — a lista simplesmente ficava em branco. Adicionado o estado
  `"Nenhum projeto ainda. Marque o primeiro."` (classe `.projects-list-empty`
  em `prototype/index.html`).
- **Falha de sincronização com o Drive** (`driveSyncNow`): o erro só ia para
  o console, sem feedback ao usuário. Adicionado o toast de erro
  `"Falha ao sincronizar com o Drive: " + err.message`.
- **ZIP sem arquivos válidos** (import ZIP): já existia
  (`"ZIP sem arquivos .md válidos"`); mantido como está — é o estado de
  "ZIP inválido" pedido pela issue #17, apenas confirmado/documentado aqui.

## 7. Correções de consistência aplicadas nesta revisão

- Unificado "deletar" → "excluir" em todos os diálogos de exclusão de
  projeto (título, mensagem, botão de confirmação, toast de sucesso), para
  alinhar com o termo já usado nos rótulos ARIA de exclusão de arquivo
  (introduzidos em #15).
- `"Selecione arquivo"` → `"Selecione um arquivo"` (faltava o artigo,
  quebrando o padrão de `"Selecione um projeto"`).
- `"Erro: " + err.message` (fallback de cópia) → `"Erro ao copiar: " +
  err.message`, para seguir o padrão `"Erro ao <verbo>: <detalhe>"` usado em
  todos os outros toasts de erro do app.
