# Documento de Design - Combos de Nível 3 (Supremos)

Este documento destrincha o funcionamento técnico, mecânico e visual dos Combos de Nível 3 (3 cartas idênticas de Especiais na mesma zona) para o **Reverso** e o **Bloqueio**. Estas mecânicas representam o ápice do controle de campo e punição no Yugi-Uno.

---

## 🌪️ Combo Triplo de Reverso: "Reverso Kármico" (Distorção Temporal)

Em vez de manipular o espaço (como o Reverso comum), 3 Reversos empilhados quebram as leis de causa e efeito do próprio combate, forçando o jogo a rebobinar a realidade adversária. É o ultimate do "*reset* tático".

### ⚙️ Mecânica Exata
* **Como Funciona:** Quando ativado para refletir um ataque, o Reverso Kármico devolve o golpe com **20% a mais de poder (Multiplicador 1.2x)**. Mas a verdadeira punição é temporal: a carta força imediatamente o oponente a **descartar toda a mão atual** e comprar a mesma quantidade de cartas do topo do baralho. Qualquer combo perfeito, emboscada premeditada ou defesa guardada à sete chaves é rasgado da mão do inimigo.
* **Impacto Direto na Vida (Se o oponente não se defender):** 
  * O oponente engole o golpe com multiplicador 1.2x. Se não o matar instantaneamente, ocorre uma pane no sistema dele. Como sua "linha do tempo" foi danificada pelo impacto paradoxal, o oponente fica desorientado, perdendo completamente o limite de tempo da próxima rodada (seu turno passará a ter apenas 5 segundos, simulando pânico).
* **Interações Notáveis:** Caso o oponente tente usar um "Reverso" contra esse Reverso Kármico, o Reverso simples é sobrecarregado pela anomalia, pifando (se desfazendo) instantaneamente, permitindo que o golpe passe reto.

### 🎬 Efeitos Visuais (VFX via Canvas/WebGL)
1. **Ativação:** A tela subitamente sofre um efeito severo de **Aberração Cromática** (os canais de cor RGB se separam, como uma fita de vídeo desgastada ou um monitor falhando) e pesadas linhas de estática (scanlines) passam de cima a baixo na tela.
2. **A Distorção:** Um gigantesco relógio translúcido (estilo holograma roxo neon ou da cor do Reverso) aparece girando rapidamente no sentido anti-horário no fundo da mesa.
3. **O Reset:** Em um único e violento espasmo gráfico, as cartas da mão do oponente são fisicamente "chutadas" para fora da tela (voam desordenadamente para cima e para fora), sendo instantaneamente substituídas por silhuetas de *glitch* que se materializam em novas cartas.
4. **Impacto na Vida:** Ao invés da animação suave do HP caindo (ex: 30 descendo gradativamente para 15), os números do oponente "bugam". Eles mudam aleatoriamente e em extrema velocidade (ex: 99, 12, 45, 03, 88) durante a duração da estática, apenas para congelar e piscar agressivamente no novo valor correto quando a anomalia termina.

### 🔊 Design Sonoro (SFX)
* **Ativação:** O estalo agudo de uma fita K7 sendo ejetada bruscamente (`CLICK-CLACK!`).
* **A Distorção (Rebobinando):** O som ruidoso e caótico de uma fita VHS velha sendo rebobinada em velocidade máxima (um ruído elétrico estridente e mecânico), sobreposto com o tique-taque de engrenagens grandes de um relógio andando para trás.
* **O Impacto:** Quando o dano entra na vida, não soa como uma pancada, mas sim como um ruído de curto-circuito pesado, parecido com uma interferência grave em um microfone (`BZZZZT-KRRRSH!`), seguido do som vazio e silenciado de uma sala isolada.

---

## 🛡️ Combo Triplo de Bloqueio: "A Prisão de Cristal" (Lockdown Absoluto)

3 Blocks deixam de ser um escudo para se tornarem uma sentença prisional. O jogador que usar este combo impõe uma ordem de silêncio no campo adversário, garantindo controle de turno quase total.

### ⚙️ Mecânica Exata
* **Como Funciona:** Em combate, anula instantaneamente a investida do oponente (independentemente da força ou de ser um Especial comum). O efeito primário, entretanto, ativa-se assim que o bloqueio é concretizado: os 3 Blocks causam um "Status Effect" massivo no lado adversário da mesa, **trancando completamente as zonas de Ataque e Defesa do oponente pelo próximo turno inteiro**.
  * No próximo turno do inimigo, ele será fisicamente proibido de arrastar qualquer carta de ataque, defesa ou especial para o campo. Ele precisará passar o turno ou utilizar apenas itens (consumíveis/lixeira).
* **Impacto Direto na Vida (Golpe Ofensivo):**
  * Se você for agressivo o suficiente para usar 3 Blocks em zona de Ataque contra o inimigo sem defesa: o combo não causará Dano de HP direto (afinal, é um bloqueio).
  * No entanto, o monólito esmaga a sanidade do inimigo e causa um "Trauma de Deck": o combo **destrói 1 carta COMPLETAMENTE ALEATÓRIA de dentro do Baralho principal do oponente**, triturando-a (o oponente perde o recurso sem nunca ver qual carta era). Além disso, o oponente não compra cartas na virada do turno. É um estrangulamento puro de recursos ocultos.
* **Interações Notáveis:** Imparável por ataques brutos. Apenas mecânicas intangíveis (como um Fantasma de nível superior) conseguiriam transpassar sem acionar as trancas de cristal. Se o inimigo tentar usar um "Espelho", o espelho reflete uma parede intransponível, não resultando em nada (ambos se dissipam).

### 🎬 Efeitos Visuais (VFX via Canvas/WebGL)
1. **Formação:** As 3 cartas de Block perdem suas molduras clássicas e começam a se aglutinar verticalmente no ar. Elas viram placas de vidro blindado/cristal brilhante, da mesma cor da rodada.
2. **A Queda:** Esse cristal se converte num obelisco gigante e pontiagudo que é arremessado brutalmente para a metade da mesa do oponente.
3. **Aprisionamento de Zona:** Ao colidir com o campo inimigo, o monólito afunda e rachaduras neon se espalham pelo tapete de batalha (chão). Gelo sólido (ou cristal espesso) cresce rapidamente cobrindo inteiramente a área onde os slots de Ataque e Defesa do oponente ficam. Cadeados luminosos surgem flutuando acima da área com a mensagem vermelha trêmula: "ZONAS ISOLADAS".
4. **Impacto na Vida (Se jogado no Ataque):** O monólito bate direto no avatar/fundo do jogador inimigo. Em vez de perder HP, a tela do oponente recebe rachaduras reais de "vidro quebrado" (como se a tela do celular/monitor deles estivesse estilhaçada por alguns segundos). Ao invés do dano de HP descer, um modelo 3D de uma carta sai do nada, do baralho inimigo, voa até o obelisco e se desfaz em pó instantaneamente na frente da tela, sem ser revelada.

### 🔊 Design Sonoro (SFX)
* **Ativação:** Som de um pilar de concreto pesadíssimo sendo arrastado contra o chão.
* **A Queda:** O assobio rápido de algo imenso caindo, seguido de um impacto (Sub-Bass) absurdamente grave que deve ser o som mais pesado do jogo, causando um eco que dura pelo menos 2 segundos ("KABOOOOOOM.......").
* **Congelamento:** Barulho agudo de cristais e estilhaços de vidro crescendo agressivamente ("Krrk-krrk-shhhhh").
* **Ao acertar a Vida (Desejo do Baralho):** O som angustiante de papel grosso sendo esmagado violentamente, seguido pela poeira dissipando num sussurro ecoado, com o estalo do obelisco se fixando.
