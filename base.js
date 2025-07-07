const express = require('express');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// ─── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────
const SESSION_DIR = process.env.SESSION_DIR || './auth';
const OWNER_NUMBER = process.env.OWNER_NUMBER || '559295333643'; // Número que receberá notificações
const API_KEY = process.env.API_KEY || ''; // Chave global para autenticar rotas
const PORT = parseInt(process.env.PORT, 10) || 3000;
const QR_MODE = process.env.QR_MODE === 'true'; // true → imprime QR no terminal
const LOG_LEVEL = process.env.LOG_LEVEL || 'silent'; // 'silent', 'info', 'debug', etc.

// ─── LOGGER ─────────────────────────────────────────────────────────────────────
const logger = pino({
    level: LOG_LEVEL,
    transport:
        process.env.NODE_ENV === 'development'
            ? {
                target: 'pino-pretty',
                options: { colorize: true, translateTime: 'SYS:standard' }
            }
            : undefined
});

// ─── FUNÇÕES AUXILIARES ─────────────────────────────────────────────────────────
async function pergunta(prompt) {
    return new Promise(resolve => {
        process.stdout.write(prompt);
        process.stdin.once('data', data => resolve(data.toString().trim()));
    });
}

// ─── INICIALIZA BOT WHATSAPP ──────────────────────────────────────────────────────
async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const sock = makeWASocket({
        printQRInTerminal: QR_MODE,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        logger
    });

    // Se não estiver registrado, solicita número e gera QR/código
    if (!state.creds.registered) {
        const numero = await pergunta('📱 Digite seu número com DDI (ex: 5599999999999): ');
        try {
            const qrOrCode = await sock.requestPairingCode(numero);
            console.log('🆔 Código de emparelhamento:', qrOrCode);
        } catch (err) {
            logger.error({ err }, 'Falha ao solicitar código de emparelhamento');
            process.exit(1);
        }
    }

    let notificou = false;

    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect } = update;
        logger.debug({ update }, 'connection.update');

        if (connection === 'close') {
            const statusCode = new DisconnectReason(lastDisconnect?.error)?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                logger.warn('🔒 Sessão deslogada. Apague %s e reinicie.', SESSION_DIR);
                process.exit(0);
            } else {
                logger.info('🔄 Reconectando em 5s…');
                setTimeout(iniciarBot, 5000);
            }
        }

        if (connection === 'open') {
            console.log('✅ Conectado como', sock.user?.id || sock.user);
            if (!notificou && OWNER_NUMBER) {
                notificou = true;
                const jid = `${OWNER_NUMBER}@s.whatsapp.net`;
                try {
                    await sock.sendMessage(jid, { text: '🤖 Bot iniciado com sucesso!' });
                    logger.info('✔️ Mensagem de início enviada para %s', jid);
                } catch (err) {
                    logger.error({ err }, '❌ Erro ao enviar mensagem de início');
                }
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
    return sock;
}

// ─── SERVIDOR EXPRESS PARA ROTAS HTTP ────────────────────────────────────────────
function startServer(sock) {
    const app = express();
    app.use(express.json());

    // Middleware de autenticação por API Key
    app.use((req, res, next) => {
        const key = req.headers['x-api-key'] || req.query.api_key;
        if (!key || key !== API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    });

    // Rota de health check
    app.get('/health', (req, res) => res.json({ status: 'ok' }));

    // Rota para enviar mensagem
    app.post('/send-message', async (req, res) => {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ error: 'Missing "to" or "message" in body' });
        }
        try {
            const jid = `${to}@s.whatsapp.net`;
            await sock.sendMessage(jid, { text: message });
            return res.json({ status: 'success' });
        } catch (err) {
            logger.error({ err }, 'Falha ao enviar mensagem');
            return res.status(500).json({ error: 'Failed to send message' });
        }
    });

    app.listen(PORT, () => console.log(`🚀 API server running on port ${PORT}`));
}

// ─── TRATAMENTO DE SINAIS PARA SHUTDOWN ─────────────────────────────────────────
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando bot…');
    process.exit(0);
});
process.on('uncaughtException', err => {
    logger.error({ err }, '💥 Exceção não capturada');
    process.exit(1);
});

// ─── INÍCIO ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log('🚀 Inicializando instância Baileys…');
    const sock = await iniciarBot();
    startServer(sock);
})();