# Otimizações + Modos Gráfico Alto/Baixo

---

## Parte 1 — Otimizações Invisuais (sem mudar nada visível)

Estas mudanças **não alteram nenhum pixel** do resultado final ao olho humano, mas eliminam trabalho desnecessário a cada frame.

---

### 1. Substituir `shadowBlur` por contorno pré-renderizado em sprite

**Onde:** [`canvas2d-renderer.js` L171–179](file:///c:/Users/WINDOWS/Downloads/Card/src/render/canvas2d-renderer.js#L171-L179) e [`L512–518`](file:///c:/Users/WINDOWS/Downloads/Card/src/render/canvas2d-renderer.js#L512-L518)

**O problema:**
```js
// Acontece toda frame para QUALQUER carta hovered ou no selectableZone
ctx.shadowColor = '#00ffff';
ctx.shadowBlur = 20;         // ← Gaussian blur por pixel, toda frame
```

**A solução:** pré-renderizar o halo de hover em um `OffscreenCanvas` de 128×196px (carta + margem do blur) com `shadowBlur` aplicado UMA VEZ durante o setup. A cada frame, apenas `drawImage` desse sprite translúcido na posição da carta. O visual fica **idêntico** ao olho humano — a única diferença é que o blur não vai "respirar" com micro-variações de pixel, o que ninguém percebe.

```js
// No setup: criar um sprite de halo para cada "tipo de hover" (ciano/vermelho)
function buildHaloSprite(color, blurPx) {
    const pad = blurPx * 2;
    const c = document.createElement('canvas');
    c.width = CARD_W + pad * 2; c.height = CARD_H + pad * 2;
    const g = c.getContext('2d');
    g.shadowColor = color; g.shadowBlur = blurPx;
    g.fillStyle = color;
    g.beginPath(); g.roundRect(pad, pad, CARD_W, CARD_H, RADIUS); g.fill();
    return c; // ← rasterizado uma vez
}
// No draw: apenas drawImage(hoverSprite, drawX - pad, drawY - pad)
```

**Impacto estimado no G14:** +8 a 12fps na tela de preparação (o estado mais comum, onde o jogador fica mais tempo parado).

---

### 2. Particle System — eliminar iteração dos 2000 slots inativos + string interpolation

**Onde:** [`particle-system.js` L202–226](file:///c:/Users/WINDOWS/Downloads/Card/src/render/particle-system.js#L202-L226) e [`L236–290`](file:///c:/Users/WINDOWS/Downloads/Card/src/render/particle-system.js#L236-L290)

**O problema:**
```js
// update() e draw() iteram SEMPRE 2000 slots, mesmo com 0 partículas ativas
for (let i = 0; i < this.maxParticles; i++) {  // 2000 iterações todo frame
    if (this.active[i] === 1) { ... }
}

// E dentro do draw, string interpolation por partícula (alocação GC):
ctx.fillStyle = `rgba(${this.r[i]}, ${this.g[i]}, ${this.b[i]}, ${alpha})`;
```

**A solução — 3 mudanças juntas:**

```js
// 1) Manter contador de partículas ativas
this.activeCount = 0;

// 2) Em emit(): activeCount++; em death: activeCount--
// 3) Early-exit no update/draw:
update(dt) {
    if (this.activeCount === 0) return; // ← zero custo quando inativo
    // ...loop
}

// 4) Pré-montar as strings de cor UMA VEZ no emit, guardar em array
this.colorStr = new Array(maxParticles).fill('rgba(255,255,255,1)');
// No emit: this.colorStr[idx] = `rgba(${r},${g},${b},1)`;
// No draw: ajustar só alpha via globalAlpha (1 propriedade numérica, sem string):
ctx.globalAlpha = this.life[i] / this.maxLife[i]; // número, sem alloc
ctx.fillStyle = this.colorStr[i];                   // string montada no emit, não aqui
```

**Impacto estimado no G14:** +3 a 5fps constantes. Maior benefício: eliminar os GC pauses que causam micro-jank a cada ~2s (o GC coleta as strings descartadas do frame anterior).

---

### 3. Usar `globalAlpha` em vez de `rgba()` onde o único valor que muda é o alpha

**Onde:** Múltiplos pontos no [`canvas2d-renderer.js`](file:///c:/Users/WINDOWS/Downloads/Card/src/render/canvas2d-renderer.js), [`fx-layer.js`](file:///c:/Users/WINDOWS/Downloads/Card/src/render/fx-layer.js) e [`card-effects-arcane.js`](file:///c:/Users/WINDOWS/Downloads/Card/src/render/card-effects-arcane.js)

Quando a cor é sempre a mesma e só o alpha muda por frame:

```js
// ❌ Antes: monta nova string rgba todo frame
ctx.strokeStyle = `rgba(57, 255, 20, ${0.25 + pulse * 0.3})`;

// ✅ Depois: cor pré-definida (string constante), alpha via propriedade numérica
ctx.globalAlpha = 0.25 + pulse * 0.3;  // número, sem alloc
ctx.strokeStyle = AMBUSH_GREEN;          // string constante, sem alloc
```

Isso não precisa de nenhuma mudança visual — `globalAlpha` × `strokeStyle` opaco produz exatamente a mesma cor.

**Impacto estimado no G14:** pequeno individualmente (+1–2fps), mas é uma prática de higiene que elimina dezenas de micro-alocações por frame em todo o render path.

---

### 4. Contagem ativa no FxLayer — early-exit nos loops de ring/tether/seal

**Onde:** [`fx-layer.js` L380–402](file:///c:/Users/WINDOWS/Downloads/Card/src/render/fx-layer.js#L380-L402) e [`L427–457`](file:///c:/Users/WINDOWS/Downloads/Card/src/render/fx-layer.js#L427-L457)

Durante 90% do tempo de jogo (fora de cinemáticas de cartas arcanas), todos os rings, tethers e seals estão inativos. Mesmo assim, `update()` e `draw()` iteram todos os slots toda frame:

```js
// Manter contadores: this.ringCount, this.tetherCount, this.sealCount
// No ring(): this.ringCount++; no death: this.ringCount--
// No draw():
if (this.ringCount === 0 && this.tetherCount === 0 && this.sealCount === 0
    && this.vigAmount <= 0 && this.appLife <= 0) return; // zero custo fora de cinemáticas
```

**Impacto estimado no G14:** +2 a 4fps durante gameplay normal (fases de preparação, escolha).

---

### 5. `drawPaintSelected` — usar `performance.now()` cacheado, não chamado por frame

**Onde:** [`canvas2d-renderer.js` L512](file:///c:/Users/WINDOWS/Downloads/Card/src/render/canvas2d-renderer.js#L512)

```js
// ❌ Antes: performance.now() chamado por carta por frame (não é caro, mas é desnecessário)
const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);

// ✅ Depois: usar this.time que já é calculado UMA vez no início do draw()
const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
```

Também deve substituir o `shadowBlur` dentro de `drawPaintSelected` pela mesma técnica de sprite da otimização #1.

**Impacto:** mínimo individualmente, mas elimina um padrão ruim.

---

### 6. Limitar `MAX_DPR` a 1.5 em vez de 2

**Onde:** [`constants.js` L145](file:///c:/Users/WINDOWS/Downloads/Card/src/config/constants.js#L145)

```js
// Atual:
MAX_DPR: 2,

// Proposta:
MAX_DPR: 1.5,  // reduz o backbuffer em ~44% no G14 sem perda visual notável a distância de mão
```

O G14 tem tela de 720×1600 com DPR declarado de 2. Com MAX_DPR 2, o canvas tem **~1,15 megapixels**. Com 1.5, tem **~648 kilopixels** — **44% menos** pixels a processar por frame. A diferença de nitidez é imperceptível na prática: a maioria dos jogos mobile usa DPR 1–1.5 exatamente por isso. Esta é uma das mudanças de maior impacto relativo ao custo de implementação.

> [!NOTE]
> Poderia ser configurável no modo "Baixo" como `MAX_DPR: 1` (metade exata dos pixels), o que reduziria o backbuffer em 75% comparado ao atual.

**Impacto estimado no G14:** +6 a 10fps constantes se o gargalo for fill rate (que no G14 é o caso).

---

### 7. Consolidar múltiplos `ctx.save()/ctx.restore()` aninhados na per-card loop

**Onde:** [`canvas2d-renderer.js` L171–203](file:///c:/Users/WINDOWS/Downloads/Card/src/render/canvas2d-renderer.js#L171-L203)

Para cada carta no draw loop:
- `ctx.save()` / `ctx.restore()` principal (já existe)
- `drawCardGlow` → outro `ctx.save()` / `ctx.restore()`
- `drawPlayableOutline` → não salva, mas seta estado
- `drawColorRimGlow` → outro `ctx.save()` / `ctx.restore()`

`save/restore` não são gratuitos — eles copiam o estado completo do contexto (transform, clip, globalAlpha, compositeOp, strokeStyle...). Com 15 cartas na mesa, isso são 30–45 save/restore por frame. A solução é "aplanar" — usar uma sequência de setagens explícitas em vez de save/restore onde possível, especialmente dentro dos métodos de glow que são chamados por carta.

**Impacto estimado no G14:** +2 a 4fps.

---

### 8. Caching do resultado de `pool.sortDrawOrder()` — só reordenar quando necessário

**Onde:** [`canvas2d-renderer.js` L162](file:///c:/Users/WINDOWS/Downloads/Card/src/render/canvas2d-renderer.js#L162)

```js
pool.sortDrawOrder(); // chamado toda frame
```

A ordem de desenho das cartas só muda quando: uma carta é arrastada, uma cinemática começa/termina, ou uma carta vai para um novo slot. No restante do tempo (90% dos frames), a ordem é a mesma do frame anterior. Um flag `drawOrderDirty` no pool evitaria o sort na maioria dos frames.

**Impacto estimado no G14:** +1 a 3fps (sort é O(n log n), mas com n ≤ 20 é pequeno; o benefício real é a previsibilidade de frame time).

---

## Parte 2 — Modo "Alto" (full gráficos + as 8 otimizações invisuais)

O modo **Alto** é o jogo como está hoje, mais as 8 técnicas acima aplicadas. **Nenhuma feature visual é removida.** Ele seria o padrão para qualquer dispositivo.

**Ganho estimado total no G14 com todas as 8:**

| Otimização | Ganho isolado no G14 |
|---|---|
| #1 shadowBlur → sprite | +8–12fps |
| #2 ParticleSystem ativo count + sem string alloc | +3–5fps |
| #3 globalAlpha em vez de rgba() | +1–2fps |
| #4 FxLayer early-exit | +2–4fps |
| #5 performance.now() cacheado | +0–1fps |
| #6 MAX_DPR 1.5 | +6–10fps |
| #7 save/restore consolidado | +2–4fps |
| #8 drawOrder dirty flag | +1–3fps |
| **TOTAL ESTIMADO** | **+23–41fps** |

O G14 hoje roda em ~15–30fps. Com o modo Alto, estimativa de **38–55fps**. Não garante 60fps estável em cenas com Fantasma+Maldição+partículas simultâneas, mas resolve o problema percebido de jogo "pesado demais".

---

## Parte 3 — Modo "Baixo" (cortar o pesado)

O modo **Baixo** mantém toda a lógica de jogo intacta e visualmente o jogo ainda fica bonito, mas remove as camadas de efeito mais custosas em termos de fill rate. São cortes que o jogador **vai perceber**, mas que são toleráveis em troca de fluência.

---

### Corte B1 — Desativar efeitos animados de carta (FX / foil / laminado)

**Custo atual:** cada carta com efeito animado (Relâmpago, Fantasma, Espelho, Maldição, Reviver, Pintar) executa `CardEffects.draw()` todo frame, que inclui bandas de foil via `drawImage`, faíscas, e funções `extra` como `drawEthereal`, `drawMirrorFx`, `drawCurseFx`.

**No modo Baixo:** `visual.fx` é ignorado — a face pintada em cache (que já fica ótima por si só) é renderizada sem nenhuma camada animada por cima.

**O que fica:** a arte da carta (Reviver dourado, Fantasma com moldura, Relâmpago com raio incandescente...) — só o laminado/animação por cima some.

**Impacto estimado no G14:** +5 a 8fps. Maior em rodadas com Relâmpago (FOIL_STORM é o mais pesado) e Maldição (FOIL_CURSE tem névoa, crânios, chamas e correntes).

---

### Corte B2 — Desativar `globalCompositeOperation: 'lighter'` nos efeitos de carta

**Custo atual:** ETHEREAL (Fantasma), FOIL_MIRROR, FOIL_CURSE, AMBUSH_EYE — todos usam modo aditivo que força a GPU a ler+escrever cada pixel afetado duas vezes.

**No modo Baixo:** substituir `'lighter'` por `'source-over'` em todos os efeitos de carta (não nas cinemáticas, que são temporárias e rápidas). Visualmente, as auras ficam levemente diferentes em cores de sobreposição, mas o resultado ainda é muito bonito.

**Impacto estimado no G14:** +3 a 6fps com cartas arcanas em campo.

---

### Corte B3 — Reduzir partículas (max 500 em vez de 2000, bursts menores)

**Custo atual:** `new ParticleSystem(2000)` — o pool inteiro é iterado, e bursts de combate emitem 110–150 partículas por evento.

**No modo Baixo:**
```js
new ParticleSystem(500) // pool menor = menos memória e iteração
// Nos emitBurst/emitDamageWave: count = Math.floor(count * 0.35)
```

O efeito visual de impacto fica mais "limpo" (menos partículas), não desaparece — ainda há explosão e feedback visual claro.

**Impacto estimado no G14:** +3 a 5fps durante cinemáticas de combate.

---

### Corte B4 — Desativar plasma background (CSS animations dos blobs)

**Custo atual:** 3 `<div>` com animação CSS de `transform` + `scale` contínuos (CSS animations são compositor-thread no Chrome, então não bloqueiam a main thread — mas no G14 com 1 cluster de GPU, o compositor também compete pelo mesmo recurso de composição).

**No modo Baixo:** remover os blobs animados, manter só o `plasma-base` com `background-color` sólida. O fundo fica estático mas ainda colorido e muda de cor entre rodadas.

```js
// No modo Baixo: adicionar classe 'graphics-low' no body
// No CSS: .graphics-low .plasma-blob { display: none; }
```

**Impacto estimado no G14:** +2 a 4fps. Parece pequeno, mas no G14 o compositor compartilha recursos com o rasterizador do canvas.

---

### Corte B5 — `MAX_DPR: 1` (em vez de 2 do Alto, ou 1.5 do Alto otimizado)

**No modo Baixo:** canvas em resolução 1:1 CSS, sem escalar para pixels físicos. No G14 com tela 720p, o canvas fica em 360×200px CSS ≈ 360×200 pixels físicos.

> [!WARNING]
> Este é o corte mais visível de todos — o canvas fica levemente "pixelado" nas bordas curvas das cartas. Num celular em posição normal (40–60cm dos olhos), com tela de 6.5 polegadas, a diferença é perceptível mas tolerável. É o trade-off mais agressivo.

**Impacto estimado no G14:** +10 a 16fps. É o maior ganho único do modo Baixo.

---

### Corte B6 — Desativar FxLayer inteiramente (anéis, correntes, selos, vinheta)

**Custo atual:** FxLayer.draw() roda toda frame e desenha (quando ativos) anéis expansivos, correntes da Maldição/Emboscada, selos de espinhos e vinhetas de tela em modo aditivo sobre pixels grandes.

**No modo Baixo:** `scene.fx = null` — o bloco `if (scene.fx)` no renderer simplesmente não executa. As cinemáticas ainda rodam (animações de carta, partículas), mas sem os efeitos de camada extra por cima.

**Impacto estimado no G14:** +2 a 4fps durante cinemáticas de cartas arcanas.

---

## Resumo de Impacto Total por Modo

| | Baseline (hoje) | Modo Alto | Modo Baixo |
|---|---|---|---|
| FPS tela normal (sem cinemática) | 15–30fps | 38–55fps | 50–65fps |
| FPS durante Relâmpago/Maldição | 8–18fps | 25–40fps | 40–58fps |
| Visual | Full | Full | Sem laminado, sem plasma, canvas "menor", sem FxLayer |
| G14 joga confortável? | ❌ Não | ✅ Sim (quase sempre) | ✅ Sim (quase sempre) |

> [!IMPORTANT]
> O modo Baixo **não é "o jogo feio"** — é o jogo sem as camadas de efeito de GPU que o G14 não aguenta. As artes das cartas (que são ricas e detalhadas, pintadas em cache de alta resolução), as animações de tween, as cinemáticas de combate e as partículas continuam funcionando.

---

## Onde Adicionar a Opção no Código

O ponto ideal é no [`SettingsPanel`](file:///c:/Users/WINDOWS/Downloads/Card/src/ui/settings-panel.js) — já existe a infraestrutura de persistência em `localStorage` (`STORAGE_KEY`). Adicionar um `select` ou `toggle` de "Qualidade Gráfica: Alto / Baixo" que salva no mesmo objeto e é lido pelo `Canvas2DRenderer`, `ParticleSystem` e `viewport` na inicialização (ou no resize, para DPR). 

Um singleton `GraphicsPreset` em `/src/config/` com flags booleanas (`enableFoil`, `enableFxLayer`, `enablePlasma`, `maxDpr`, `maxParticles`) tornaria a leitura trivial em todos os sistemas sem acoplar nada diretamente ao SettingsPanel.
