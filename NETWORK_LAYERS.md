# Camadas 2 e 3 de rede (opcionais, sem cartão)

O jogo funciona sem nada disto — Camada 1 (Open Relay Project) já vem configurada, grátis, sem
conta, sem cartão. As duas camadas abaixo são melhorias opcionais: enquanto não forem configuradas
em `src/config/constants.js`, o jogo simplesmente não as usa (`TURN_SERVERS_OWN` vazio e
`RELAY_WS_ENDPOINT` vazio = camada desligada, sem quebrar nada). Nenhuma delas pede cartão de
crédito em momento nenhum — os dois provedores usados abaixo (Metered e Render) têm planos free
genuínos, sem verificação de cartão no cadastro.

---

## Camada 2 — TURN dedicado (Metered.ca, seu próprio free plan)

A Camada 1 já usa TURN do Metered, mas com uma credencial **pública e compartilhada** com todo
mundo que usa a lib Trystero no planeta — sob carga pesada global ela pode ficar instável. A
Camada 2 é uma conta gratuita **sua**, com cota própria (não dividida com ninguém).

1. Crie uma conta grátis em <https://dashboard.metered.ca/signup> (só email, sem cartão).
2. No dashboard: **TURN Server → Add Credential** (ou "Click Here to Generate Your First
   Credential" se for a primeira vez).
3. Clique em **Instructions** na credencial criada — ela mostra o array de ICE servers pronto,
   algo como:
   ```json
   [
     { "urls": "stun:SEU-SUBDOMINIO.metered.live:80" },
     { "urls": "turn:SEU-SUBDOMINIO.metered.live:80", "username": "...", "credential": "..." },
     { "urls": "turn:SEU-SUBDOMINIO.metered.live:443", "username": "...", "credential": "..." },
     { "urls": "turns:SEU-SUBDOMINIO.metered.live:443?transport=tcp", "username": "...", "credential": "..." }
   ]
   ```
4. Copie essas entradas pra `TURN_SERVERS_OWN` em `src/config/constants.js` (já tem o formato
   comentado lá, é só descomentar e preencher usuário/senha/subdomínio).

**Sobre expor usuário/senha no código do cliente:** o jogo não tem backend, então qualquer
credencial usada no navegador fica visível pra quem inspecionar o bundle publicado — é o mesmo
território da credencial pública da Camada 1. O risco real é alguém consumir sua cota gratuita do
mês, nunca cobrança (não há cartão cadastrado no plano free). Pra um jogo de cartas 2P pequeno,
esse risco é baixo.

---

## Camada 3 — Relay WebSocket (`relay-server/`, hospedado grátis no Render)

Fallback de última instância — só entra em ação se o WebRTC falhar antes de qualquer par conectar
(e mesmo assim o jogo continua tentando sozinho indefinidamente, ver `fallback-adapter.js`; essa
camada só torna esse cenário raro mais rápido de contornar).

1. Suba a pasta `relay-server/` pro GitHub (ela já está dentro deste repositório, então um
   `git push` normal já é suficiente).
2. Crie uma conta grátis em <https://render.com> (login com GitHub, sem cartão).
3. **New → Web Service**, conecte o repositório do jogo.
4. Configure:
   - **Root Directory**: `relay-server`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. Deploy. A URL final vai ser algo como `https://yugi-uno-relay.onrender.com`.
6. Em `src/config/constants.js`, troque `https://` por `wss://` e preencha:
   ```js
   RELAY_WS_ENDPOINT: 'wss://yugi-uno-relay.onrender.com',
   ```

**Sobre o plano free do Render "dormir":** um serviço free do Render hiberna depois de ~15 min sem
tráfego, e leva de 30 a 60 segundos pra acordar na próxima conexão. Isso não quebra nada — a Camada
3 só é usada como último recurso, e o `FallbackAdapter` do jogo já tenta de novo indefinidamente a
cada poucos segundos (ver Pilar do CLAUDE.md sobre a conexão "nunca desistir sozinha"), então na
pior hipótese o jogador só espera uns 30-60s a mais na primeira vez que essa camada precisa acordar.
Se isso incomodar, dá pra configurar um serviço externo de ping (ex.: UptimeRobot, grátis) batendo
na URL a cada poucos minutos pra manter o relay sempre acordado — não é necessário, só uma
melhoria opcional de latência.

## Testando

Depois de preencher as duas configurações, um novo `git push` (GitHub Pages atualiza sozinho) e
teste uma partida online normal — nada deve mudar visualmente. Acompanhe o console do navegador
(`?debug` na URL): todo passo sai logado (`[TrysteroAdapter]`, `[FallbackAdapter]`,
`[WebSocketAdapter]`), então dá pra confirmar qual camada está em uso em cada conexão. Pra testar
o relay do zero, acesse a URL do Render num navegador — deve responder `yugi-uno-relay ok — 0
sala(s) ativa(s)`.

## Custo

Metered free: sem cartão, cota própria mensal (não expira, não cobra). Render free: sem cartão,
750h de instância/mês (mais que suficiente pra um serviço único rodando o mês inteiro). Nenhum dos
dois pede dados de pagamento em momento nenhum do cadastro.
