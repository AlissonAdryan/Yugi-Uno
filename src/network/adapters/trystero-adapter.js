import { CONFIG } from '../../config/constants.js';
import { NetworkAdapter } from '../network-adapter.js';

/**
 * TrysteroAdapter - WebRTC P2P usando brokers MQTT públicos apenas para a sinalização inicial.
 * O Trystero multiplexa todas as ações num único RTCDataChannel confiável e ordenado por par.
 * A biblioteca é carregada sob demanda para que o modo CPU funcione mesmo offline.
 */
export class TrysteroAdapter extends NetworkAdapter {
    constructor() {
        super();
        this.room = null;
        this.action = null;
    }

    async connect({ roomId, isHost }) {
        console.log(`[TrysteroAdapter] Carregando Trystero e entrando na sala ${roomId} como ${isHost ? 'HOST' : 'CLIENT'}...`);
        const { joinRoom } = await import(CONFIG.NETWORK.TRYSTERO_URL);

        const roomConfig = { appId: CONFIG.NETWORK.APP_ID };
        // Camada 1 (Open Relay, sempre) + Camada 2 (TURN próprio, se preenchido em TURN_SERVERS_OWN) —
        // ambas são listas estáticas, sem fetch nenhum: nunca atrasa nem bloqueia o joinRoom().
        const turnServers = [...CONFIG.NETWORK.TURN_SERVERS, ...CONFIG.NETWORK.TURN_SERVERS_OWN];
        if (turnServers.length > 0) roomConfig.turnConfig = turnServers;

        this.room = joinRoom(roomConfig, roomId, {
            onJoinError: (details) => {
                console.error('[TrysteroAdapter] Erro ao entrar na sala:', details);
                if (this.onError) this.onError(new Error(details.error));
            }
        });

        this.action = this.room.makeAction(CONFIG.NETWORK.ACTION_NAME);
        this.action.onMessage = (data, context) => {
            if (this.onMessage) this.onMessage(data, context.peerId);
        };

        this.room.onPeerJoin = (peerId) => {
            console.log(`[TrysteroAdapter] Par conectado: ${peerId}`);
            if (this.onPeerJoin) this.onPeerJoin(peerId);
        };
        this.room.onPeerLeave = (peerId) => {
            console.warn(`[TrysteroAdapter] Par desconectado: ${peerId}`);
            if (this.onPeerLeave) this.onPeerLeave(peerId);
        };
    }

    send(message, peerId) {
        if (!this.action || !peerId) return;
        this.action.send(message, { target: peerId }).catch((err) => {
            console.warn(`[TrysteroAdapter] Falha ao enviar para ${peerId}:`, err);
        });
    }

    ping(peerId) {
        if (!this.room) return Promise.reject(new Error('Sala não conectada'));
        return this.room.ping(peerId);
    }

    disconnect() {
        if (!this.room) return;
        this.room.leave().catch(() => {});
        this.room = null;
        this.action = null;
    }
}
