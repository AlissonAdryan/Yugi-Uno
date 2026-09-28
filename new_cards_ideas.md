# 🃏 Propostas de 4 Novas Cartas Especiais

> Cada carta foi pensada para preencher um nicho estratégico que o jogo ainda não cobre, sem invalidar as existentes. As descrições incluem mecânica completa, visual da carta, efeitos cinematográficos e interações com todas as cartas já existentes.

---

## 🗡️ CARTA DE COMBATE 1 — **Fantasma** *(Normal, com cor)*

### Conceito
Uma carta que engana o oponente. Ela entra no campo como uma carta comum, mas no momento do combate ela se revela como uma ilusão: atravessa a carta inimiga sem colidir e ataca a vida diretamente, como se o campo do oponente estivesse vazio.

### Visual da Carta
- **Fundo:** Gradiente escuro de roxo-profundo (`#1a0a2e`) para preto, com uma neblina etérea flutuando dentro da carta.
- **Ícone central:** Uma silhueta de carta fantasmagórica, semi-transparente, com bordas desfocadas que pulsam suavemente — como se a carta estivesse "fora de fase" com a realidade.
- **Moldura:** Fina, prata-envelhecida com cantos que se dissolvem em fumaça. As bordas da moldura tremem levemente (um micro-shake de 0.5px a cada 2s).
- **Cor:** Possui cor (vermelha, azul, verde ou amarela). A cor aparece como uma **aura fantasmagórica** em volta do ícone central, em vez de preencher o fundo como nas cartas numéricas.
- **Sem laminado** — o visual etéreo já é marcante o suficiente.

### Mecânica

| Situação | Comportamento |
|---|---|
| **Colisão normal** | A carta do Fantasma se torna translúcida, **atravessa** a carta inimiga como um espectro e vai direto para a vida. A carta inimiga permanece no campo intacta (não é destruída). O Fantasma causa **3 de dano fixo** na vida e depois se dissipa (vai para o descarte, não volta pra mão). |
| **Contra pilha (combo/+2/+4)** | Atravessa a pilha inteira. Nenhuma carta da pilha é afetada. |
| **Contra Block** | O Block não consegue bloquear o que não pode tocar. O Fantasma **ignora o Block** e atravessa. O Block permanece no campo. |
| **Contra Reverso** | O Reverso **não consegue roubar** um Fantasma (ele é intangível). O Fantasma atravessa e o Reverso fica no campo. |
| **Contra Relâmpago** | O Relâmpago **fulmina o Fantasma** normalmente — energia elétrica dispersa ectoplasma. O Relâmpago é o counter natural. |
| **Fantasma vs Fantasma** | Os dois atravessam simultaneamente e ambos causam 3 de dano na vida do oponente. Nenhum é destruído pelo outro. |
| **Na Defesa** | Pode ser colocado na Defesa. Se a defesa for ativada, ele atravessa a carta sobrevivente inimiga da mesma forma. |
| **Dano Direto (já na vida)** | Se o Fantasma chegar à vida por não haver oponente (campo vazio), ele causa os mesmos 3 de dano fixo. |
| **Combo de Fantasmas** | Fantasmas idênticos (mesma cor) podem ser empilhados. Cada um atravessa e causa 3 de dano individual em série. |

### Cinemática de Combate
1. **Revelação:** A carta se revela normalmente, mas ao aparecer a face, uma onda de distorção radial (como calor) pulsa a partir dela.
2. **Ataque:** Em vez de avançar como uma carta normal, ela **se dissolve em partículas de neblina roxa** que flutuam através do campo, atravessam a carta inimiga (que treme ao sentir a presença), e se recompõem brevemente sobre a barra de vida do oponente.
3. **Impacto na vida:** A silhueta do Fantasma aparece gigante e translúcida sobre a vida do oponente por 0.3s, depois explode em partículas etéreas que se dissipam como fumaça.
4. **Som:** Um sussurro reverberante ao atravessar, seguido de um "whoosh" grave ao atingir a vida.

### Valor na Loja/Lixeira
- **Preço Loja:** 5 moedas

---

## ⚔️ CARTA DE COMBATE 2 — **Espelho Sombrio** *(Laminada, com cor)*

### Conceito
Uma carta camaleônica e laminada que copia o poder da carta inimiga no instante da colisão, garantindo no mínimo um empate — mas com um twist sombrio: ela rouba +1 de poder além da cópia, vencendo por 1 ponto. O preço? Se ela sobreviver e atingir a vida, o dano que ela causa é **também infligido ao seu próprio dono** (dano espelhado).

### Visual da Carta
- **Fundo:** Negro-espelhado, como obsidiana polida. O centro da carta é literalmente um **reflexo distorcido e sombrio** — um espelho escuro que mostra uma versão invertida e maligna da carta que está à frente (antes do combate, mostra um "?" distorcido).
- **Moldura:** Dupla, de prata-negra com runas gravadas nas bordas que brilham em púrpura quando a carta é segurada/arrastada.
- **Laminado: `FOIL_MIRROR`** — um efeito espelhado escuro que reflete as cores do ambiente ao inclinar; em vez do arco-íris do holográfico, reflete em tons de roxo-escuro, prata e negro. As runas da moldura cintilam como estrelas distantes dentro do reflexo.
- **Cor:** Possui cor. A cor aparece como uma **veia de energia** que pulsa nas bordas do espelho, como rachaduras de luz colorida na obsidiana.

### Mecânica

| Situação | Comportamento |
|---|---|
| **Colisão com número** | Copia o valor da carta inimiga **+1**. Ex: inimigo joga um 8, o Espelho assume valor 9. Ganha o clash por 1 e sobrevive com valor 1. |
| **Colisão com outro Espelho** | Ambos tentam copiar o outro → paradoxo → destruição mútua (empate). Partículas de vidro estilhaçado explodem em todas as direções. |
| **Contra Block** | Copia a "essência" do Block: ambos se anulam (destruição mútua, como Block vs Block). |
| **Contra Reverso** | O Reverso age primeiro e rouba/troca normalmente. O Espelho não tem tempo de copiar. |
| **Contra Relâmpago** | O Relâmpago é mais rápido e fulmina o Espelho antes da cópia. |
| **Contra +2/+4** | O +2/+4 explode e invoca cartas antes do clash. O Espelho copia a primeira carta invocada que de fato lutar contra ele. |
| **Contra Fantasma** | O Fantasma atravessa; o Espelho não tem o que copiar (fica parado com valor 0 e é descartado). |
| **Dano Direto (vida)** | Causa o dano do seu valor copiado na vida do oponente, MAS o dono do Espelho **também perde a mesma quantidade de vida**. Se o Espelho sobreviveu com 1 (caso mais comum), ambos perdem 1 HP. |
| **Combo** | Espelhos idênticos (mesma cor) empilham. Cada um copia individualmente a carta que enfrentar. |

### Cinemática de Combate
1. **Revelação:** A carta se vira e a superfície espelhada brilha com um flash — o reflexo distorcido do oponente aparece brevemente no espelho.
2. **Cópia:** Ondas de energia negra fluem da carta inimiga até o Espelho. O número do inimigo aparece no Espelho em vermelho-sangue, e depois pulsa para +1 em branco. Efeito de "glitch" digital por 0.2s durante a absorção.
3. **Clash:** O Espelho avança com uma **trilha de estilhaços de vidro flutuando** atrás dele. Ao colidir, a carta inimiga se estilhaça como um espelho quebrado (em vez da destruição normal).
4. **Dano espelhado:** Quando atinge a vida do oponente, um flash escuro pulsa. Meio segundo depois, o mesmo flash pulsa na vida do dono, com estilhaços voando na direção contrária e o texto "-X" aparecendo em ambos os lados.
5. **Som:** Tinido cristalino na cópia, som de vidro se estilhaçando na colisão, eco sombrio grave no dano espelhado.

### Valor na Loja/Lixeira
- **Preço Loja:** 7 moedas
- **Valor Lixeira:** 5 moedas

---

## 🧪 CONSUMÍVEL 1 — **Emboscada** *(Normal, sem cor)*

### Conceito
Um consumível que transforma sua carta de Defesa numa **armadilha oculta**: se o oponente destruir sua carta de Ataque e a Defesa for ativada, a Defesa **ganha +3 de poder temporário** antes de lutar. Mas se sua carta de Ataque vencer sozinha (a Defesa nunca é ativada), a emboscada é desperdiçada.

### Visual da Carta
- **Fundo:** Preto-esverdeado (`#0a1a0a`), com um padrão sutil de teias ou armadilhas em verde-tóxico translúcido.
- **Ícone central:** Um **olho semi-aberto** dentro de um triângulo invertido, rodeado por fios espinhosos. O olho pisca lentamente (animação sutil de 3s).
- **Moldura:** Verde-venenoso (`#39ff14`) fina, com cantos que parecem garras/espinhos.
- **Sem laminado**, sem cor. Consumível puro.

### Mecânica

| Situação | Comportamento |
|---|---|
| **Ativação** | Slot USE durante a Preparação. O oponente vê apenas o verso explodindo. |
| **Efeito** | Se o jogador tiver uma carta na Defesa E a carta de Ataque for destruída neste turno, a carta de Defesa recebe **+3 de poder temporário** no instante em que é revelada (antes do clash). O bônus desaparece ao final do turno. |
| **Sem Defesa** | Se o jogador não colocou Defesa, a carta é desperdiçada (só quem usou sabe). |
| **Ataque vence** | Se o Ataque vencer sem precisar da Defesa, a Emboscada é desperdiçada. |
| **Defesa é especial** | Se a carta na Defesa for um Block, Reverso, Relâmpago, Fantasma ou Espelho, o +3 não se aplica (essas cartas não têm "poder numérico" de clash). A Emboscada é desperdiçada. |
| **Combo na Defesa** | O +3 se aplica apenas à carta do topo da pilha de Defesa. |
| **Limite** | Só 1 Emboscada ativa por rodada. |
| **Com Troca de Guarda** | Se a Troca de Guarda mover a Defesa para o Ataque, o bônus da Emboscada acompanha a carta — ela ganha +3 mesmo na posição de Ataque (a "armadilha" já foi plantada). |

### Cinemática
1. **Ativação (USE):** A carta cai no slot e se dissolve em fumaça verde-tóxica. Fios verdes brilhantes correm sutilmente do slot USE até o slot de Defesa do jogador e desaparecem (só o jogador que usou vê).
2. **Emboscada ativada!:** Quando a Defesa é revelada após o Ataque ser destruído, antes de ela lutar:
   - Os fios verdes reaparecem em volta da carta de Defesa, constringindo-a brevemente.
   - O número da carta pulsa e sobe: ex. "5" → flash verde → "8". Partículas verdes sobem em espiral.
   - Texto "EMBOSCADA!" aparece em verde-néon por 1s.
   - Som de mola/armadilha disparando + rugido grave.
3. **Desperdiçada:** Nenhum efeito visual (segredo mantido).

### Valor na Loja/Lixeira
- **Preço Loja:** 4 moedas
- **Valor Lixeira:** 2 moedas

---

## 💀 CONSUMÍVEL 2 — **Maldição** *(Laminada, sem cor)*

### Conceito
Um consumível laminado e raro que amaldiçoa a **mão do oponente**: no início do próximo turno (não o atual), **2 cartas aleatórias da mão do oponente têm seu valor reduzido em 3** (mínimo 1). Se forem cartas especiais sem valor numérico, elas são **corrompidas** e viram cartas de número 1 da cor da rodada atual. Uma maldição poderosa que enfraquece o arsenal futuro do inimigo.

### Visual da Carta
- **Fundo:** Preto-púrpura profundo (`#0d0015`) com padrões de caveiras e correntes translúcidas que flutuam dentro da carta.
- **Ícone central:** Uma **caveira estilizada** com olhos de fogo roxo, dentro de um pentagrama invertido feito de correntes. As correntes balançam levemente.
- **Moldura:** Dupla, roxa-escura e prata-envelhecida, com inscrições arcanas que brilham em roxo pulsante.
- **Laminado: `FOIL_CURSE`** — um efeito de névoa roxa que se move lentamente dentro da carta, como se houvesse uma tempestade contida lá dentro. De vez em quando, mini-relâmpagos roxos piscam dentro da névoa. As caveiras no fundo parecem girar levemente quando a carta é inclinada.
- **Sem cor.** Consumível puro.

### Mecânica

| Situação | Comportamento |
|---|---|
| **Ativação** | Slot USE durante a Preparação. O oponente vê apenas o verso explodindo. |
| **Timing** | O efeito NÃO é imediato. A maldição é "plantada" e dispara no **início da próxima rodada**, logo após o sorteio de cor e antes da preparação. |
| **Efeito** | 2 cartas aleatórias da mão do oponente sofrem -3 de valor (mínimo 1). Cartas especiais (Block, Reverso, +2, +4, Relâmpago, Fantasma, Espelho) são **corrompidas**: viram cartas de Número com valor 1 e cor da rodada atual. Consumíveis na mão são imunes (não são corrompidos). |
| **Mão pequena** | Se o oponente tiver menos de 2 cartas na mão, a maldição atinge o que houver. Com 0 cartas, é desperdiçada. |
| **Revelação** | No início do turno seguinte, ambos os jogadores veem o efeito: o oponente vê suas cartas serem corrompidas; o jogador que amaldiçoou vê os versos das cartas do oponente brilhando em roxo (mas não sabe quais foram). |
| **Não acumulável** | Só 1 Maldição ativa por vez. Usar uma segunda enquanto a primeira ainda não disparou substitui a anterior (não empilha). |
| **Limite por partida** | Máximo 2 usos por partida. No terceiro, a carta treme e volta para a mão. |

### Cinemática
1. **Ativação (USE):** A carta cai no slot e é consumida por chamas roxas que se erguem e formam uma caveira gigante translúcida por 0.5s antes de se dissipar. Um sussurro maligno ecoa. O jogador vê um ícone de caveira pulsando sutilmente na HUD até o efeito disparar.
2. **Disparo (início do próximo turno, após sorteio de cor):**
   - A tela escurece levemente (vinheta roxa nas bordas).
   - Correntes roxas fantasmagóricas emergem do chão e envolvem 2 cartas da mão do oponente.
   - As cartas afetadas tremem violentamente, racham com fissuras roxas brilhantes.
   - O número da carta pulsa e cai: ex. "7" → flash roxo → "4". Se for especial, o ícone se distorce, racha, e é substituído por um "1" soturno.
   - Texto "MALDIÇÃO!" em roxo-néon com letras que tremem e gotejam.
   - As correntes se estilhaçam e as partículas roxas se dissipam lentamente.
   - Som: risada sombria abafada + som de correntes + estalo de ossos.
3. **Para o amaldiçoador:** Ele vê os versos das cartas do oponente brilharem brevemente em roxo (2 cartas), confirmando que a maldição funcionou, mas sem saber quais cartas foram atingidas.

### Valor na Loja/Lixeira
- **Preço Loja:** 9 moedas
- **Valor Lixeira:** 5 moedas

---

## 📊 Resumo Comparativo

| Carta | Tipo | Cor? | Laminado? | Nicho Estratégico | Counter Natural |
|---|---|---|---|---|---|
| **Fantasma** | Combate (normal) | ✅ Sim | ❌ | Bypass total — ignora tudo e vai direto na vida | Relâmpago |
| **Espelho Sombrio** | Combate (laminado) | ✅ Sim | ✅ `FOIL_MIRROR` | Anti-cartas altas — garante vitória mas com custo | Reverso, Relâmpago |
| **Emboscada** | Consumível (normal) | ❌ | ❌ | Defesa reativa — potencializa a Defesa surpresa | Troca de Guarda (move a defesa, mas o bônus acompanha) |
| **Maldição** | Consumível (laminado) | ❌ | ✅ `FOIL_CURSE` | Sabotagem futura — enfraquece o oponente a longo prazo | Pintar (repinta cartas corrompidas), mão grande (dilui o impacto) |

---

## 🧩 Interações Cruzadas (Novas × Novas)

| Situação | Resultado |
|---|---|
| Fantasma vs Espelho Sombrio | O Fantasma atravessa. O Espelho não tem o que copiar (valor 0), é descartado sem causar dano. |
| Maldição corrompe um Fantasma na mão | O Fantasma vira um Número 1. O oponente perde uma ferramenta de bypass. |
| Maldição corrompe um Espelho na mão | O Espelho vira um Número 1. Perda catastrófica. |
| Emboscada + Espelho Sombrio na Defesa | Se ativado, o Espelho recebe +3 antes de copiar? Não — o +3 só se aplica a cartas numéricas. O Espelho na Defesa copia normalmente sem o bônus. |
| Emboscada + Fantasma na Defesa | O Fantasma não tem valor numérico para receber +3. A Emboscada é desperdiçada; o Fantasma atravessa normalmente. |

