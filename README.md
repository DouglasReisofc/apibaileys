📞 API WhatsApp com Baileys – Projeto #apibaileys
Crie uma API robusta para integração com o WhatsApp usando a biblioteca Baileys, com foco em múltiplos agentes (sessions), envio de mensagens, recebimento de eventos e controle via HTTP.

🛠️ Requisitos
Node.js 18+

TypeScript (opcional, mas recomendado)

Yarn ou NPM

MongoDB ou SQLite (para armazenar sessões)

Redis (opcional, para filas/eventos em tempo real)

🚀 Começando o Projeto
1. Inicialize o Projeto
bash
Copiar
Editar
mkdir apibaileys
cd apibaileys
npm init -y
npm install @whiskeysockets/baileys express cors qrcode-terminal
2. Estrutura Básica
Crie a estrutura inicial:

pgsql
Copiar
Editar
apibaileys/
├── index.js
├── sessions/
│   └── sessionManager.js
├── controllers/
│   └── messageController.js
├── routes/
│   └── index.js
└── utils/
    └── logger.js

## Executando

Instale as dependências e inicie o servidor:

```bash
npm install
node index.js
```

Acesse `http://localhost:3000` para visualizar o painel.

### Endpoints principais

- `POST /api/session` – cria uma nova sessão.
- `GET /api/session/:id/status` – retorna o status da sessão.
- `GET /api/session/:id/qr` – obtém o QR code para autenticação.
- `POST /api/session/:id/restart` – reinicia a sessão.
- `POST /api/message` – envia uma mensagem.
