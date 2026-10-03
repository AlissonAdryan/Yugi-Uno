import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Relay WebSocket puro entre os 2 jogadores de UMA sala — não entende nada do jogo em si, só
 * repassa o que chega de um lado pro outro, na ordem, como um cabo virtual. Camada 3 (último
 * recurso) do Yugi-Uno: só entra em cena se o WebRTC P2P (Trystero) falhar por completo antes de
 * qualquer par conectar (ver src/network/adapters/fallback-adapter.js no jogo).
 *
 * Servidor único e simples de propósito (Pilar 7 do CLAUDE.md do jogo): sem framework, sem banco,
 * sem dependência além de `ws`. Pensado pra rodar de graça no Render (free web service, sem cartão)
 * — ver README.md nesta pasta pro passo a passo de deploy.
 *
 * Protocolo (texto = controle, prefixado "__relay"; binário = dado de jogo puro, sem envelope):
 *   servidor -> cliente: {__relay:'joined'} | {__relay:'peer-joined'} | {__relay:'peer-left'} |
 *                        {__relay:'room-full'} | {__relay:'pong', id}
 *   cliente -> servidor: {__relay:'ping', id}  (qualquer outro texto/binário é repassado pro par)
 * URL de conexão: wss://<host>?room=<codigo>&role=host|client
 */

const PORT = process.env.PORT || 8080;
const ROOM_CODE_RE = /^[A-Za-z0-9]{1,32}$/;
// Teto defensivo: uma sala "esquecida" só existe enquanto os 2 sockets estiverem abertos (limpeza
// automática no fechamento, ver detach()) — isso aqui só protege contra um pico anormal de salas
// simultâneas (bot/abuso) enchendo a memória do processo único.
const MAX_ROOMS = 5000;

/** @type {Map<string, { host: import('ws').WebSocket|null, client: import('ws').WebSocket|null }>} */
const rooms = new Map();

const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`yugi-uno-relay ok — ${rooms.size} sala(s) ativa(s)\n`);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const room = url.searchParams.get('room') || '';
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'client';

    if (!ROOM_CODE_RE.test(room)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }
    if (!rooms.has(room) && rooms.size >= MAX_ROOMS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
        attach(ws, room, role);
    });
});

function attach(ws, room, role) {
    let slot = rooms.get(room);
    if (!slot) {
        slot = { host: null, client: null };
        rooms.set(room, slot);
    }

    if (slot[role]) {
        console.warn(`[RoomRelay] Sala ${room}: papel "${role}" já ocupado — recusando.`);
        safeSend(ws, { __relay: 'room-full' });
        ws.close(1008, 'room-full');
        return;
    }

    slot[role] = ws;
    console.log(`[RoomRelay] Sala ${room}: "${role}" entrou (${occupancy(slot)}/2).`);

    safeSend(ws, { __relay: 'joined' });
    const other = peerOf(slot, role);
    if (other) {
        safeSend(other, { __relay: 'peer-joined' });
        safeSend(ws, { __relay: 'peer-joined' });
    }

    ws.on('message', (data, isBinary) => relay(room, slot, role, data, isBinary));
    ws.on('close', () => detach(room, slot, role));
    ws.on('error', () => detach(room, slot, role));
}

function relay(room, slot, role, data, isBinary) {
    if (!isBinary) {
        const msg = tryParse(data.toString());
        if (msg && msg.__relay === 'ping') {
            safeSend(slot[role], { __relay: 'pong', id: msg.id });
            return;
        }
    }

    const other = peerOf(slot, role);
    if (!other) return;
    if (isBinary) other.send(data);
    else other.send(data.toString());
}

function detach(room, slot, role) {
    if (slot[role] === null) return;
    slot[role] = null;
    console.log(`[RoomRelay] Sala ${room}: "${role}" saiu (${occupancy(slot)}/2).`);

    const other = peerOf(slot, role);
    if (other) safeSend(other, { __relay: 'peer-left' });

    if (occupancy(slot) === 0) {
        rooms.delete(room);
        console.log(`[RoomRelay] Sala ${room}: vazia, removida (${rooms.size} sala(s) ativa(s)).`);
    }
}

function peerOf(slot, role) {
    return role === 'host' ? slot.client : slot.host;
}

function occupancy(slot) {
    return (slot.host ? 1 : 0) + (slot.client ? 1 : 0);
}

/** @param {import('ws').WebSocket} ws @param {object} data */
function safeSend(ws, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
        ws.send(JSON.stringify(data));
    } catch (err) {
        console.warn('[RoomRelay] Falha ao enviar (par provavelmente já caiu):', err.message);
    }
}

function tryParse(text) {
    try {
        return JSON.parse(text);
    } catch (err) {
        return null;
    }
}

server.listen(PORT, () => console.log(`[RoomRelay] Ouvindo na porta ${PORT}.`));
