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

## 7. Revanche
- Ao fim da partida, a tela de Vitória/Derrota oferece o botão **Revanche**, acima de "Voltar ao Menu".
- Quando um jogador pede revanche, o oponente recebe um aviso no canto da tela.
- Se os dois pedirem, uma nova partida começa imediatamente na mesma sala (mesmos jogadores e nomes, sem precisar de um novo link): vida, mãos, baralho e rodadas são reiniciados do zero.
- No modo contra a CPU, a CPU sempre aceita a revanche.
- Se a partida terminou por abandono (oponente desconectado), não há revanche.
