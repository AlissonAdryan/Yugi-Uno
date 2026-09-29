# Livro de Regras Oficiais do Jogo

## 1. Visão Geral e Campo de Batalha
- **Jogadores:** 2 Jogadores (1v1).
- **Cartas Iniciais:** 9 cartas aleatórias.
- **Vida (HP):** Cada jogador começa a partida com **30 de Vida**. Esta informação deve ficar permanentemente visível na tela, ao lado de cada jogador.
- **Visibilidade:** O jogador enxerga apenas as frentes de suas próprias cartas (na mão e no campo antes da revelação). As cartas do oponente são vistas apenas pelo verso.
- **O Grid/Campo:** Cada jogador possui áreas específicas para posicionar suas cartas durante a fase de preparação:
  - **Slot de Ataque:** A carta é posicionada na vertical (posição de ataque).
  - **Slot de Defesa:** A carta é posicionada na horizontal, logo atrás da carta de Ataque.

## 2. Fase de Preparação (Turno)
- Cada jogador escolhe as cartas da sua mão e as posiciona no Grid.
- **Obrigatoriedade:** É obrigatório colocar uma carta no Slot de Ataque.
- **Opcionalidade:** A carta no Slot de Defesa é opcional.
- **Finalização:** Após posicionar as cartas, o jogador clica no botão "Finalizar Turno". O jogo aguarda até que ambos os jogadores finalizem seus turnos.

## 3. Fase de Combate (Resolução Automática)
Quando ambos os jogadores finalizam o turno, o combate se inicia de forma automática, com animações em velocidade normal/lenta para acompanhamento tático.

### 3.1 O Clash de Ataque Principal
1. As cartas de Ataque de ambos os jogadores são reveladas simultaneamente.
2. A carta que possuir o **maior número (Atributo unificado de Vida/Ataque)** aumenta de tamanhando (para dar impressão de a carta estar levantando), da um leve movimento apra trás e avança em direção à carta do oponente enquanto volta ao tamanho normal, para dar impressão que ela levantou e avançou atacando, e em seguida voltando ao normal para sua posção.
3. A carta com o menor número é destruída (com particulas e efeito de destruição) e removida do jogo.
4. **Cálculo de Dano (Sobrevivência):** A carta vencedora sobrevive, porém seu número é reduzido permanentemente. O novo valor será: `(Valor da Vencedora) - (Valor da Perdedora)`.
   - *Exemplo:* P1 (Carta 6) vs P2 (Carta 9). A Carta 9 ataca e destrói a Carta 6. A Carta 9 sobrevive, mas passa a valer 3 (9 - 6 = 3).
5. **Situação de Empate:** Se ambas as cartas de Ataque tiverem o mesmo valor, elas avançam até o meio do campo com a animação, colidem e se destroem mutuamente. Se os jogadores possuírem cartas de Defesa, ambas são reveladas após 1,5s e combatem entre si.

### 3.2 Engajamento da Linha de Defesa
1. O jogador que teve sua carta de Ataque destruída e possuir uma carta no Slot de Defesa, terá essa carta de defesa revelada.
2. Inicia-se imediatamente um novo confronto entre a Carta Sobrevivente do oponente e esta recém-revelada Carta de Defesa. A regra de subtração se repete.
   - *Continuando o Exemplo:* P1 teve sua carta (6) destruída. Sua carta de Defesa (7) é revelada. Ela confronta a carta sobrevivente do P2 (que agora vale 3). A carta (7) vence, destrói a carta (3) e sobrevive valendo 4 (7 - 3 = 4).
3. Se o jogador adversário (que acabou de ter o seu sobrevivente destruído) também possuir uma Carta de Defesa não revelada, ela é revelada e o fluxo de combate continua.

### 3.3 Dano Direto (HP) e Fim do Combate
O combate termina quando pelo menos um dos lados ficar sem vida ou sem cartas.
1. **Dano Direto:** Se a carta de um jogador vencer todos os embates no centro da mesa (destruindo o Ataque e a Defesa do inimigo, ou apenas o Ataque caso o inimigo não tenha Defesa), o **valor restante** daquela carta ataca os Pontos de Vida (HP) do jogador oponente.
   - *Importante:* Uma carta de defesa que sobrou no campo SÓ ataca a vida do oponente se a carta de ataque inimiga (e sua respectiva defesa) foram destruídas. 
2. **Retorno à Mão (Sobreviventes revelados):** Qualquer carta que lutou no centro do campo, sobreviveu, e causou dano direto, **volta para a mão do seu dono** para ser usada no próximo turno, **mantendo o novo valor de vida/ataque degradado**.
3. **Retorno à Mão (Defesa intacta):** Se um jogador colocou uma carta de Defesa, mas a sua carta de Ataque venceu o combate inicial e o turno acabou sem que a Defesa precisasse intervir, esta carta de Defesa **retorna para a mão do jogador, intacta, com o HP cheio e sem nunca ter sido revelada ao oponente**.
4. **Retorno à Mão (Defesa intacta):** Após o fim da rodada, o jogador vencedor recebe 2 cartas enquanto o perdedor recebe apenas 1.

## 4. Limite de Mão e Sistema de Descarte Forçado (Doação)
- **Limite Máximo:** O limite máximo de cartas na mão de qualquer jogador é de **15 cartas**.
- **Regra de Doação:** Imediatamente após o fim do combate (e do retorno das cartas sobreviventes para as mãos), o jogo calcula quantas cartas cada jogador irá comprar. Se a quantidade atual de cartas + as cartas a serem compradas exceder 15, o jogador é OBRIGADO a descartar o excesso **ANTES** da compra.
- Durante o descarte, o jogo é interrompido. O jogador deve clicar em uma carta da sua própria mão.
- Ao descartar uma carta, em vez de ir para uma pilha de descarte, ela é **doada diretamente para a mão do oponente**, dando uma vantagem a ele.
- **Exceção de Destruição:** Se no momento da doação o oponente já possuir 15 cartas na mão, a carta não é doada, e sim **destruída** (removida do jogo permanentemente).

## 5. Sorteio de Cor e Descarte Forçado
- **Seleção de Cor:** No início de cada rodada (antes da fase de preparação), o jogo faz uma verificação das cores disponíveis na mão de ambos os jogadores. Uma cor que seja comum a ambos é sorteada aleatoriamente.
- **Escolha do Perdedor:** Se na rodada anterior um jogador perdeu levando **pelo menos 1 de dano na vida (-X ♥)**, é ele quem escolhe a cor da nova rodada, em vez do sorteio.
  - Aparece no centro da tela uma carta de "Trocar Cor" com as 4 cores nas mesmas posições da carta. Só as cores **comuns aos dois jogadores** ficam acesas e podem ser escolhidas; as demais ficam em cinza escuro e não reagem.
  - Enquanto isso, o oponente vê o aviso de que a cor está sendo escolhida.
  - Block e Reverso atingindo a vida não causam dano numérico, então não dão direito à escolha. Sem dano na rodada, a cor é sorteada.
  - Quando a vez de escolher é da CPU, ela escolhe ao acaso entre as cores disponíveis.
  - Se houver só uma cor em comum, ela é usada direto (não há o que escolher).
  - O jogador tem 20 segundos para escolher; depois disso a cor é sorteada entre as disponíveis.
  - Se não houver nenhuma cor em comum, acontece o Descarte Forçado normalmente e o direito à escolha continua valendo para o próximo sorteio.
- **Mudança de Fundo:** O fundo do cenário muda para refletir a cor sorteada (ou escolhida) e o nome da cor pisca no centro da tela.
- **Restrição de Jogada:** Durante aquele turno, os jogadores SÓ podem posicionar cartas no tabuleiro que sejam da cor sorteada (tentar jogar outra cor faz a carta tremer e voltar para a mão).
- **Cartas Especiais (Sem Cor):** Cartas Especiais (como Coringa ou +4) não possuem cor vinculada, portanto podem ser jogadas sobre qualquer cor escolhida na rodada. No entanto, elas não contam como "Cores em comum" durante o sorteio do sistema.
- **Espelho de Defesa (Mesma Carta, Outra Cor):** Se a carta posicionada no Slot de Ataque possuir cor, o Slot de Defesa passa a aceitar também a **mesma carta em qualquer outra cor**, mesmo fora da cor sorteada.
  - *Exemplo:* A cor da rodada é verde. O jogador coloca um 7 verde no Ataque. Agora ele pode colocar na Defesa um 7 vermelho, azul ou amarelo.
  - "Mesma carta" significa mesmo tipo e mesmo valor atual, variando apenas a cor. Vale para números e para qualquer carta com cor (Block, Reverso, +2, etc.), inclusive cartas adicionadas no futuro.
  - A carta de Ataque precisa ser posicionada primeiro. Cartas sem cor (+4, Trocar Cor) no Ataque não liberam o Espelho.
  - Se a carta de Ataque for retirada do slot, uma Defesa espelhada que não seja da cor da rodada volta automaticamente para a mão.
  - A Defesa continua aceitando normalmente qualquer carta da cor da rodada (ou sem cor).
- **Descarte Forçado:** Se na hora do sorteio os jogadores **não possuírem NENHUMA cor em comum** na mão:
  1. A rodada não inicia e nenhum jogador pode baixar cartas.
  2. Ambos os jogadores entram na Fase de Descarte Forçado.
  3. Cada jogador deve obrigatoriamente descartar 2 cartas da sua mão. (Se o jogador tiver menos de 2 cartas, ele descarta todas as que tiver).
  4. Diferente do descarte por excesso (que doa a carta ao oponente), no Descarte Forçado a carta é completamente descartada do jogo/enviada para a pilha de descarte.
  5. Após ambos finalizarem o descarte, o sistema devolve o valor equivalente (quem descartou 2 compra 2; quem descartou 1 compra 1).
  6. Um novo sorteio de cor é feito. Esse processo se repete até que uma cor comum seja encontrada.

### 5.1 Combos (Empilhamento de Cartas Idênticas)
- É possível empilhar múltiplas cartas no mesmo slot de combate (Ataque ou Defesa), formando um Combo.
- Para empilhar, as cartas devem ser **exatamente idênticas**: mesma cor, mesmo tipo e mesmo valor. A única exceção é a carta "+4", que **não pode** ser empilhada em combos.
- O limite máximo de empilhamento é de **3 cartas por slot**.
- **Ocultação de Combo:** Durante a Fase de Preparação, o servidor oculta a informação de combo. O oponente vê apenas 1 carta posicionada no slot, e não vê as cartas adicionais saindo da mão do jogador.
- **Revelação:** Assim que o combate se inicia, a real quantidade da pilha é revelada para todos e as cartas são mostradas normalmente.
- Durante a resolução do combate, a pilha luta em série (do topo até a base), enfrentando a defesa oponente ou atacando diretamente a vida de forma sucessiva.

## 6. Cartas Especiais e Interações
Durante o jogo, os jogadores obtêm cartas com mecânicas únicas que alteram o fluxo do combate e da rodada. As cartas especiais (+2, +4, Reverso e Block) possuem comportamentos distintos dependendo da situação (Combate de Mesa ou Dano Direto na Vida).

### 6.1 Cartas de Invocação (+2 e +4)
* **Ativação no Combate:** Ao entrarem em combate com outra carta, elas não possuem força numérica para colidir. Em vez disso, no momento em que deveriam atacar/defender, a carta explode e "puxa" do topo do baralho 2 ou 4 cartas aleatórias.
* **Resolução em Cadeia:** As cartas invocadas são empilhadas no mesmo slot onde a carta original estava. Elas passam a combater contra o inimigo uma a uma (sempre a carta do topo liderando). 
* **Acúmulo (Combo em Cadeia):** Se uma carta +2/+4 puxar outra carta +2/+4, o efeito é engatilhado novamente de forma imediata, trazendo ainda mais cartas para o campo de batalha antes do combate recomeçar.
* **Consumíveis na Puxada:** Se dentre as cartas puxadas por um +2/+4 houver uma carta Consumível (ex.: Trocar Cor), ela é automaticamente reorganizada para o fundo da pilha recém-formada, sendo sempre a última daquela puxada a entrar em combate (a ordem entre as demais cartas puxadas, e entre múltiplas Consumíveis puxadas juntas, não muda).
* **Dano Direto na Vida:** Cartas +2 e +4 nunca atacam a vida do jogador diretamente como "Especiais". Quando chegam à linha de vida oponente, elas sempre explodem para invocar cartas. Após serem processadas em cartas, caso haja um exército de múltiplas cartas formadas no campo, elas atacarão a vida do oponente sucessivamente e em série até a pilha acabar, causando enormes perdas.

### 6.2 O Bloqueio (Block)
* **Colisão (Combate de Mesa):** O Bloqueio é a defesa suprema (representado por um ícone de proibido/bloqueado). Quando colide contra uma carta inimiga (seja uma carta numérica forte ou fraca), ambas se destroem mutuamente. Se colidir contra uma pilha de cartas (criada por +2 ou +4), o Block anula **todas as cartas presentes na pilha adversária** de uma única vez, sacrificando-se e limpando o campo naquele slot inteiro.
* **Colisão Especial (Block vs Reverse):** Ambas as cartas são imunes aos efeitos secundários uma da outra. Se chocarem na mesa, elas se anulam e se destroem instantaneamente (empate limpo).
* **Contra o Relâmpago:** O Relâmpago é mais rápido e fulmina o Block antes de ele agir (§6.10).
* **Dano Direto na Vida (Lock-Out de Turno):** Caso um Block cruze o campo inteiro e atinja os Pontos de Vida inimigos, ele **não causa dano numérico (-X ♥)**. Em vez disso, ele aplica uma maldição de "Lock-Out". Um símbolo vermelho circular permanecerá gravado sobre o **Slot de Defesa** daquele inimigo, impedindo fisicamente que o oponente utilize aquele slot na rodada de ataques seguinte, arruinando sua defesa passiva temporariamente.

### 6.3 O Reverso (Reverse)
* **Colisão (Combate de Mesa):** O Reverso é representado por ícones de setas. Ao colidir com uma carta numérica ou pilha de cartas (invocadas) inimigas:
   * **Roubo Simples:** Se o Reverso for jogado sozinho (sem pilha própria), ele **rouba todo o stack inimigo** e puxa para o controle do seu dono, deixando uma carta fraca (Número 1) no campo original do oponente como compensação pífia.
   * **Inversão Total:** Se o Reverso for invocado a partir do topo de uma pilha já existente no jogador dono dele (ex: um +4 chamou o Reverso), ele inverte todos de lado: troca **todas** as cartas do seu stack de lugar com **todas** as cartas do stack do inimigo.
* **Dano Direto na Vida (O Grande Roubo):** Se um Reverso não for interceptado e atingir os Pontos de Vida do oponente diretamente, **ele não causa dano numérico (-X ♥)**. O Reverso se desintegra e aciona seu Efeito Supremo: as **mãos inteiras (hand)** de ambos os jogadores são fisicamente e integralmente **trocadas**. Todas as cartas do oponente são movidas para sua mão (reveladas) e as suas cartas ocultas vão para ele, reiniciando o controle da rodada imediatamente.

### 6.4 Consumíveis - Trocar de Cor (Change Color)
* **Ativação (Slot USE):** Esta carta não é jogada nos slots de Combate (Ataque/Defesa). Existe um slot isolado chamado "USE" (transparente) destinado para consumíveis.
* **Consumo Imediato:** Assim que arrastada para o slot USE durante a fase de Preparação, a carta é consumida instantaneamente e explode, não indo para o tabuleiro.
* **Efeito Visual Oculto:** Quando um jogador joga um Trocar de Cor, o oponente vê apenas o verso da carta caindo no slot USE e explodindo. Ele não sabe qual consumível foi usado.
* **O Efeito (Coringa de Turno):** Imediatamente após a explosão, o jogador que a usou recebe o status de "Arco-Íris". A cor de fundo da sua tela mudará para uma mistura das 4 cores e, a partir daquele momento até o fim do turno, ele estará livre para colocar cartas de **qualquer cor** na mesa (ignorando a cor padrão sorteada no início da rodada).
* **Reset:** Após o combate terminar e uma nova cor ser sorteada, o efeito de Arco-Íris acaba e ambos os jogadores voltam a seguir a nova cor da rodada.

### 6.5 Consumível - Cura (Heal)
* **Visual:** Carta de fundo preto com uma cruz de cura branca. Sem cor (pode ser usada em qualquer cor).
* **Ativação:** Slot USE, durante a Preparação, como qualquer consumível (o oponente só vê o verso explodindo).
* **Efeito:** Se o jogador causar dano na vida do oponente nesta rodada, ao fim do combate ele recupera **metade do dano total causado, arredondado para baixo** (ex.: causou 9 → cura 4). A vida nunca passa do máximo (30).
* **Desperdício:** Se não causar dano (ou já estiver com a vida cheia), a carta é desperdiçada — só quem usou fica sabendo.
* Só uma Cura pode estar ativa por rodada.

### 6.6 Consumível - Escudo (Shield)
* **Visual:** Carta de fundo preto com um escudo branco. Sem cor.
* **Ativação:** Slot USE, durante a Preparação.
* **Efeito:** Até a rodada seguinte começar, cada golpe de dano direto que o jogador receber é reduzido pela metade (o dano que entra é arredondado para baixo: um golpe de 9 tira 4).
* **Segredo:** Só quem usou vê o efeito: a caixa de vida ganha um campo de força ciano animado, e cada golpe absorvido faz o escudo brilhar. O oponente só vê o número de dano final.
* Só um Escudo pode estar ativo por rodada.

### 6.7 Consumível - Reviver (Revive)
* **Visual:** Carta branca com moldura e emblema dourados (coração alado com auréola) e efeito laminado dourado animado. Sem cor.
* **Limite:** Cada jogador só pode usar **1 Reviver por partida**. Um segundo Reviver na mão não pode mais ser usado (ele treme e volta para a mão).
* **Ativação:** Slot USE, durante a Preparação, com um som divino. Enquanto o efeito estiver ativo, a vida do jogador fica dourada, com uma auréola e o número de rodadas restantes (só ele vê).
* **Duração:** 5 rodadas de combate (rodadas de Descarte Forçado, sem combate, não contam).
* **Efeito:** Se o jogador receber um golpe que o mataria, ele fica com **1 de vida**. Pelo resto daquela rodada, qualquer outro golpe (ex.: uma sequência de cartas atacando) também para em 1 de vida. Depois dessa rodada, o efeito acaba.
* **Revelação:** Quando o Reviver salva o jogador, os dois veem uma luz divina com partículas sobre a vida do alvo e um som angelical; em seguida a carta do Reviver aparece gigante no centro da tela, racha e se despedaça.
* **Ordem com o Escudo:** O Escudo reduz o golpe primeiro; o Reviver só age se o dano já reduzido ainda for letal.

### 6.8 Consumíveis dentro de Invocações
* Qualquer consumível (Trocar Cor, Cura, Escudo, Reviver, Pintar, Troca de Guarda, Emboscada, Maldição) puxado por um +2/+4 não ativa seu efeito: luta como uma carta de valor 0 e vai para o fundo da pilha recém-puxada (§6.1).

### 6.9 Consumível - Pintar (Paint)
* **Visual:** Carta preta com uma paleta de pintura em néon e efeito holográfico animado. Sem cor.
* **Ativação:** Slot USE, durante a Preparação. Só pode ser usada com **pelo menos 2 cartas coloridas na mão** (sem contar a própria Pintar); senão ela treme e volta para a mão.
* **Efeito:** Ao ser usada, aparece "PINTAR!" em tinta arco-íris e as cartas coloridas da mão ganham um contorno arco-íris. O jogador escolhe **2 cartas** (clicando de novo desmarca) e em seguida a **nova cor** num seletor igual ao do Trocar Cor. Clicar fora do seletor desfaz a seleção das cartas.
* **Pintura:** As duas cartas sobem da mão e a tinta nova escorre sobre elas de cima para baixo, com gotas pingando, até cobrir a carta inteira. Tipo e valor não mudam, só a cor.
* **Restrições:** Não pinta cartas sem cor (+4, consumíveis). Pela mesma proteção da lixeira (§8.2), cores que tirariam a última carta que pode atacar ficam cinza no seletor (a cor da rodada sempre fica disponível). Enquanto a pintura não for concluída, o jogador não pode finalizar o turno. Uma pintura que não foi concluída não passa para a rodada seguinte.
* **Segredo:** O oponente só vê o verso da carta explodindo no slot USE; nunca sabe quais cartas foram pintadas nem de que cor.

### 6.10 Relâmpago (Lightning) — Especial de Campo Laminado
* **Visual:** Carta **com cor** (vermelha, azul, verde ou amarela) com um raio incandescente dentro de um anel de energia, moldura dupla elétrica e um laminado próprio de **tempestade**: véu elétrico varrendo a carta, faíscas e raios vivos que caem das bordas no anel, fazendo a carta piscar.
* **Jogada:** É jogada no Ataque ou na Defesa como Block e Reverso, obedecendo à cor da rodada. Vale Espelho de Defesa e Combo (Relâmpagos idênticos, mesma cor).
* **Colisão (Relâmpago em Cadeia):** Ao chocar com a carta da frente inimiga, o Relâmpago a fulmina e o raio **salta para mais uma carta**: a próxima da mesma pilha inimiga (combo/invocação) ou, se não houver, a do topo da **Defesa** inimiga (revelada no instante do golpe). As cartas atingidas são destruídas e o Relâmpago se descarrega (também é destruído). Não há subtração de valores.
* **Salto na vida:** Se o inimigo só tiver a carta da frente (sem combo e sem Defesa), o salto que sobra atravessa até a vida e **queima 1 carta aleatória da mão** do oponente (uma Sobrecarga parcial, sem dano numérico).
* **Contra o Block:** O Relâmpago é mais rápido — fulmina o Block antes de ele agir (e ainda salta para a próxima carta). É o counter natural do Block.
* **Contra o Reverso:** O Reverso age primeiro e **puxa o Relâmpago** junto com a pilha (Roubo Simples ou Inversão Total, §6.3). O Relâmpago passa a lutar pelo dono do Reverso.
* **Relâmpago x Relâmpago:** Os dois se anulam (destruição mútua).
* **Dano Direto na Vida (Sobrecarga):** Não causa dano numérico (-X ♥). Raios caem sobre **2 cartas aleatórias da mão do oponente**, que são queimadas (destruídas). Não dá direito à escolha de cor.
* **Cinemática:** A carta se carrega crepitando, dispara um raio de verdade até a carta inimiga (estalo de trovão + clarão de tela) e o raio salta para a próxima.

### 6.11 Consumível - Troca de Guarda (Guard Swap)
* **Visual:** Carta preta com uma carta em pé (Ataque) e uma deitada (Defesa) envoltas por duas setas girando. Sem laminado: só a moldura de aço-ciano com cantos chanfrados a diferencia. Sem cor.
* **Ativação:** Slot USE, durante a Preparação. O oponente só vê o verso explodindo.
* **Efeito secreto (só quem usou vê):** A energia corre até o campo inimigo, as cartas de lá estremecem e aparece "TROCA DE GUARDA!". Enquanto a preparação durar, uma órbita tracejada com setas gira em volta do Ataque e da Defesa do oponente, lembrando que a troca está armada.
* **Efeito (início do combate, antes de qualquer revelação):** No **campo do oponente**, se ele tiver Ataque e Defesa, as duas pilhas **trocam de lugar inteiras** (o combo é preservado): o que estava no Ataque vai para a Defesa e o que estava na Defesa vai para o Ataque. Sem Defesa, nada muda. A carta que foi para a Defesa pode voltar para a mão sem nunca ser revelada (§3.3).
* **Estratégia:** O oponente que guardou uma carta na Defesa "por segurança" a vê ir para a linha de frente, e a carta que ele escolheu para atacar fica escondida atrás.
* **Com a Emboscada do oponente:** Se ele tiver armado uma Emboscada, o bônus acompanha a antiga Defesa até a frente (§6.14).
* **Os dois veem a troca:** As pilhas sobem, fazem meia-volta em órbita (girando de pé para deitada e vice-versa) e assentam no slot oposto. Ninguém fica sabendo quem usou a carta.
* **Duas Trocas se anulam:** Se os dois jogadores usarem Troca de Guarda na mesma rodada, as pilhas giram até se chocarem e voltam ao lugar ("TROCAS ANULADAS!"). Um jogador só pode ter uma Troca armada por vez.
* **Falha:** Se nenhum campo tiver Defesa, a carta não tem o que trocar e se desfaz.

### 6.12 Fantasma (Ghost) — Especial de Campo
* **Visual:** Carta **com cor**, de fundo roxo profundo para preto com neblina etérea. No centro, uma silhueta de carta fantasmagórica e translúcida, de bordas desfocadas e base se desfazendo em fiapos, envolta por uma **aura na cor da carta**. Moldura fina de prata envelhecida com cantos se dissolvendo em fumaça. Sem laminado, mas viva: a neblina se move, a silhueta e a aura respiram e a moldura dá uma micro-tremida a cada 2 s.
* **Jogada:** Ataque ou Defesa, obedecendo à cor da rodada. Vale Espelho de Defesa e Combo (Fantasmas idênticos, mesma cor).
* **Colisão:** O Fantasma **atravessa** a carta da frente inimiga sem tocá-la (ela fica intacta no campo) e causa **3 de dano fixo** direto na vida do oponente. Depois se dissipa (não volta para a mão). A carta inimiga intacta segue o combate normalmente contra a sua próxima carta, a sua Defesa ou a sua vida.
* **Atravessa tudo:** pilhas (combo/invocações), **Block** (não bloqueia o que não pode tocar) e **Reverso** (não rouba o que é intangível) — todos ficam no campo.
* **Contra o Relâmpago:** O Relâmpago fulmina o Fantasma normalmente. É o counter natural.
* **Contra o Espelho Sombrio:** O Fantasma atravessa e o Espelho, sem o que copiar, se desfaz.
* **Fantasma x Fantasma:** Os dois atravessam ao mesmo tempo e os dois causam 3 de dano. (Se os dois golpes forem letais ao mesmo tempo, o vencedor é sorteado.)
* **Na vida:** Com o campo inimigo vazio, causa os mesmos 3 de dano fixo.
* **Dano de verdade:** Conta como dano numérico: o Escudo reduz à metade, o Reviver segura, conta para a Cura e para a escolha de cor do perdedor.
* **Cinemática:** Na revelação, uma onda de distorção pulsa da carta. Ao atacar, ela fica translúcida, vira neblina roxa à deriva, atravessa a carta inimiga (que estremece), se recompõe **gigante e translúcida sobre a vida** do oponente e explode em partículas etéreas. Sussurro reverberante ao atravessar e um "whoosh" grave no golpe.

### 6.13 Espelho Sombrio (Dark Mirror) — Especial de Campo Laminado
* **Visual:** Carta **com cor** de obsidiana polida. No centro, um espelho oval escuro que mostra um "?" distorcido — ou o valor que ele copiou. A cor da carta aparece como **veias de luz** rachando a obsidiana. Moldura dupla prata-negra com **runas gravadas**.
* **Laminado próprio (espelho sombrio):** um reflexo escuro gira dentro do espelho, véus prata e roxos varrem a carta, as veias pulsam na cor e as runas cintilam como estrelas distantes. Com a carta **sob o seu cursor na mão, as runas acendem todas em roxo**.
* **Jogada:** Ataque ou Defesa, obedecendo à cor da rodada. Vale Espelho de Defesa e Combo (cada Espelho copia sozinho a carta que enfrentar).
* **Colisão com número:** Copia o valor inimigo **+1** e vence por 1: a inimiga se estilhaça e o Espelho sobrevive valendo **1**. Contra consumíveis invocados (valor 0) ele também vence. Como cada choque é uma cópia nova, ele vence todas as cartas de número que enfrentar.
* **Contra especiais:** Espelho x Espelho e Espelho x Block são **paradoxos**: os dois se estilhaçam. O **Reverso** age antes e rouba/inverte a pilha com o Espelho. O **Relâmpago** fulmina o Espelho antes da cópia. Contra o **Fantasma** ele se desfaz. +2/+4 explodem antes; o Espelho copia a carta invocada que de fato lutar.
* **Dano Direto (vida) — dano espelhado:** Causa na vida do oponente o valor que carrega e, **meio segundo depois, metade do dano causado \(arredondado para baixo, m.nimo 1\) volta para o pr.prio dono**. O Escudo e o Reviver de cada lado valem normalmente. Se o golpe já matar o oponente, não há reflexo (a partida acaba). Se o reflexo matar o dono, o oponente vence. Um Espelho que nunca copiou nada (valor 0) copia uma carta aleatória da mão inimiga (+1) antes de atacar o HP (ou se desfaz se não achar). O Espelho não volta para a mão.
* **Cinemática:** Na revelação, um clarão espelhado com glitch. Na cópia, energia escura corre da carta inimiga até o espelho, o número dela aparece em **vermelho-sangue**, glitch digital, e pulsa para o +1 em branco. O Espelho avança deixando **estilhaços de vidro** flutuando e a inimiga se estilhaça como um espelho quebrado. Na vida, um clarão escuro no alvo e, meio segundo depois, o mesmo clarão no dono, com estilhaços voando de volta.

### 6.14 Consumível - Emboscada (Ambush)
* **Visual:** Carta preto-esverdeada com teia translúcida verde-tóxica, um **olho semiaberto** num triângulo invertido cercado de arame farpado. O olho vigia em volta e **pisca a cada 3 s**. Moldura fina verde-veneno com garras nos cantos. Sem laminado, sem cor.
* **Ativação:** Slot USE, durante a Preparação. O oponente só vê o verso explodindo. Quem usou vê fumaça tóxica e fios verdes correndo até o próprio slot de Defesa, que fica com fios espinhosos pulsando em volta enquanto a armadilha estiver armada.
* **Efeito:** Quando a carta do **topo da sua Defesa entrar na linha de frente** (o seu Ataque caiu, ou houve empate na frente), ela ganha **+3 de força** antes de lutar. Os dois veem a armadilha disparar: fios verdes constringem a carta, o número salta (ex.: 5 → 8) com um clarão verde, partículas sobem em espiral e aparece **"EMBOSCADA!"**.
* **Temporário:** Se a carta reforçada sobreviver e voltar para a mão, ela nunca fica acima do valor original (ex.: 5+3 = 8 contra um 1 sobra 7, mas volta como 5).
* **Picada venenosa (slot USE bloqueado):** Se a carta reforçada chegar à vida do oponente, além do dano ela **bloqueia o slot de consumível dele na próxima rodada**. Os dois veem: o dano aparece em verde-veneno, um fio farpado sai da vida do alvo até o slot USE dele, tece uma teia de espinhos e o olho da Emboscada abre no centro ("ITEM BLOQUEADO!"). A teia fica sobre o slot enquanto o bloqueio durar.
* **Desperdiçada (em segredo):** Sem Defesa, se o Ataque vencer sozinho ou se o topo da Defesa não for uma carta de número (Block, Reverso, Relâmpago, Fantasma, Espelho, +2, +4).
* **Combo na Defesa:** Só a carta do topo ganha o +3.
* **Com a Troca de Guarda do oponente:** Se ele trocar o seu campo, o bônus acompanha a antiga Defesa: ela ganha +3 logo depois da revelação, já na posição de Ataque.
* **Limite:** Uma Emboscada armada por vez.

### 6.15 Consumível - Maldição (Curse) — Laminado
* **Visual:** Carta preto-púrpura com crânios e correntes translúcidos no fundo, uma **caveira** de olhos em **fogo roxo** dentro de um pentagrama invertido feito de correntes. Moldura dupla roxa e prata envelhecida com inscrições arcanas. Sem cor.
* **Laminado próprio (tempestade roxa contida):** névoa roxa rodando dentro da carta, **mini-relâmpagos roxos** piscando de vez em quando, os crânios do fundo girando, o fogo dos olhos tremulando, as inscrições pulsando e correntes balançando nos cantos.
* **Ativação:** Slot USE, durante a Preparação. O oponente só vê o verso explodindo. Quem usou vê chamas roxas formando uma **caveira gigante translúcida** que se dissipa, ouve um sussurro maligno e passa a ver uma caveira pulsando sobre a vida do oponente até a maldição disparar.
* **Quando dispara:** No **início da próxima rodada**, logo após o sorteio (ou escolha) da cor e **antes** da preparação abrir — ninguém chega a jogar uma carta prestes a mudar.
* **Efeito:** Até **2 cartas aleatórias da mão do oponente** entre as que de fato sofrem: **números perdem 3** (mínimo 1); **especiais** (Block, Reverso, +2, +4, Relâmpago, Fantasma, Espelho) são **corrompidas** e viram Número 1 na cor da rodada. **Consumíveis são imunes**, e números que já estão em 1 são poupados. Se a mão não tiver nada que sofra, a Maldição se perde (só quem usou vê).
* **Revelação:** Os dois veem: a tela escurece em roxo, correntes emergem da borda e envolvem as cartas atingidas, que tremem e racham com fissuras roxas, o valor cai com um estalo de ossos e as correntes se estilhaçam. O oponente vê as próprias cartas mudando; quem amaldiçoou só vê os versos brilhando em roxo, sem saber quais eram. **"MALDIÇÃO!"** aparece em roxo-néon tremendo e gotejando.
* **Limites:** Uma Maldição plantada por vez (uma segunda carta treme e volta para a mão enquanto a primeira não disparar) e **no máximo 2 por partida** (a terceira treme e volta).
* **Contra-jogo:** O Pintar pode repintar cartas corrompidas; mãos grandes diluem o impacto.

### 6.16 Fusão de Combo (1+0 → 10, 2+0 → 20)
* **Exceção ao Combo (§5.1):** um **0** pode ser empilhado em cima de um **1 ou 2 da mesma cor** (o contrário não vale, nem 0 sobre 0).
* No início do combate, antes de lutar, o 0 do topo **se funde** com o número de baixo: o 1 vira **10**, o 2 vira **20**. O 0 é absorvido e some. Os dois veem: o 0 sobe, mergulha girando no número, um anel de choque dourado explode, o número pulsa com o valor novo e aparece **"FUSÃO!"**.
* Vale tanto para a pilha montada pelo jogador quanto para um +2/+4 que puxe essa sequência (0 logo acima de um 1/2 da mesma cor). A carta fundida mantém a cor original.
* **O 20 é instável:** a carta fundida a partir de um 2 causa o dano normalmente, mas ao acertar a vida do oponente ela se despedaça (vai pro descarte) em vez de voltar para a mão.
* **Block e Reverso desfazem a fusão:** se a carta fundida enfrentar um Block ou um Reverso do adversário, ela volta a valer seu número original (1 ou 2) e o 0 absorvido reaparece. O Block destrói os dois junto com o resto da pilha; o Reverso rouba só o 0 para o próprio campo.

### 6.17 Prioridade entre Especiais de Campo
Quando duas especiais se chocam, vale a primeira regra da lista que se aplicar:
1. **Relâmpago** fulmina qualquer uma (Block, Fantasma, Espelho, números) — só o **Reverso** age antes dele e o puxa. Relâmpago x Relâmpago se anulam.
2. **Fantasma** atravessa todas as outras (Block, Reverso, Espelho). Fantasma x Fantasma: os dois atravessam.
3. **Reverso** rouba/inverte (inclusive o Espelho). Reverso x Block e Reverso x Reverso se anulam.
4. **Block** anula a pilha. Block x Block se anulam; Block x Espelho é paradoxo (os dois se estilhaçam).
5. **Espelho** copia o número +1 e vence. Espelho x Espelho é paradoxo.

## 7. Revanche
- Ao fim da partida, a tela de Vitória/Derrota oferece o botão **Revanche**, acima de "Voltar ao Menu".
- Quando um jogador pede revanche, o oponente recebe um aviso no canto da tela.
- Se os dois pedirem, uma nova partida começa imediatamente na mesma sala (mesmos jogadores e nomes, sem precisar de um novo link): vida, mãos, baralho e rodadas são reiniciados do zero.
- No modo contra a CPU, a CPU sempre aceita a revanche.
- Se a partida terminou por abandono (oponente desconectado), não há revanche.

## 8. Economia: Lixeira, Moedas e Loja
Cada jogador tem sua própria carteira de **moedas**, visível só para ele (ao lado do botão da loja, no topo da tela, e dentro da loja). O oponente nunca vê suas moedas nem sua loja.

### 8.1 Moedas
- Todo jogador começa a partida com **3 moedas**.
- **Fim de cada rodada de combate:** quem **perdeu** a rodada ganha **2 moedas** e quem **venceu** ganha **1** (o oposto das compras de carta, para equilibrar). Em empate, os dois ganham 1.

### 8.2 Lixeira (vender cartas)
- Acima da vida de cada jogador existe uma **lixeira**. Durante a preparação (antes de finalizar o turno), arraste uma carta da mão até ela para destruí-la e receber moedas.
- **Cartas de número** valem o seu **valor atual** em moedas (um 7 vale 7).
- **Cartas especiais** têm valor próprio, configurável: +2 = 2, +4 = 4, Block = 3, Reverso = 3, Trocar Cor = 2, Cura = 2, Escudo = 2, Reviver = 5, Pintar = 3, Troca de Guarda = 3, Relâmpago = 5, Fantasma = 3, Espelho Sombrio = 5, Emboscada = 2, Maldição = 5.
- **Cartas compradas na loja revendem pela metade** (arredondado para baixo). Sem isso, comprar um 9 por 8 e vendê-lo por 9 daria dinheiro infinito.
- Ao passar a carta sobre a lixeira, aparece quanto ela vale. O oponente vê o verso da carta indo para a lixeira dele, mas não o valor.
- **Proteção contra travar o turno:** como Finalizar Turno exige uma carta no Ataque, **não é possível vender a última carta que ainda pode atacar nesta rodada** (carta não consumível na cor da rodada, contando mão, Ataque e Defesa). Ao passar essa carta sobre a lixeira, a tampa tranca em vermelho com o aviso "Última carta que pode atacar!"; se soltar, a lixeira treme e a carta volta para a mão. Quem já não tinha nenhuma opção de Ataque continua podendo vender (não piora nada).

### 8.3 Loja
- Botão com ícone de carrinho no topo da tela. A loja **só abre durante a preparação** e fecha sozinha quando o combate começa.
- Cada jogador tem a **sua própria loja, com 3 itens**, diferente da do oponente. O servidor guarda os itens de cada um e valida toda compra (preço, estoque, moedas e mão).
- **Números** na loja são **sempre 8 ou 9**, custando **1 moeda a menos** que o valor na maioria das vezes (às vezes 2 a menos).
- Os outros itens são **cartas especiais**, com preço de catálogo (+2 = 5, +4 = 8, Block = 6, Reverso = 6, Trocar Cor = 4, Cura = 5, Escudo = 5, Reviver = 11).
- **Ofertas:** de vez em quando um item vem com desconto de 1 ou 2 moedas (selo "OFERTA!" e preço cheio riscado).
- A carta comprada vai direto para a mão. Não dá para comprar com a mão cheia (15 cartas) nem o mesmo item duas vezes.
- **Renovação automática:** a loja é trocada a cada **2 rodadas de combate**.
- **Renovar (pago):** troca os itens na hora. Custa 1 moeda e fica 1 mais cara a cada uso; volta a 1 na renovação automática.
- **Congelar:** um item congelado sobrevive a qualquer renovação (paga ou automática) até a próxima renovação automática, quando descongela sozinho. Só **1 item por vez** pode estar congelado (é preciso descongelar um para congelar outro), e ao descongelar sozinho na renovação automática ele fica **2 moedas mais caro**. Congelar/descongelar em si é grátis.

### 8.4 Catálogo e etiquetas
- Cada tipo de carta tem etiquetas no catálogo (`CONFIG.CARD_CATALOG`): **DECK** (sai do baralho), **SHOP** (pode aparecer na loja) e **SELLABLE** (pode ir para a lixeira).
- Uma carta **só de loja** é uma carta com SHOP e sem DECK; uma **especial não comprável** é uma carta sem SHOP. Nenhuma outra regra precisa mudar.
