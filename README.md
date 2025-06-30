📞 API WhatsApp com Baileys – Projeto #apibaileys
Crie uma API robusta para integração com o WhatsApp usando a biblioteca Baileys,
 com foco em múltiplos agentes (sessions), envio de mensagens, recebimento de eventos e controle via HTTP.

🛠️ Requisitos
Node.js 18+

TypeScript (opcional, mas recomendado)

Yarn ou NPM

MongoDB em `mongodb://localhost:27017/baileys` (para armazenar sessões e o store de mensagens, altere usando a variável `MONGO_URI`)

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

O painel possui uma aba **Docs** que carrega este README automaticamente.
As sessoes disponiveis sao atualizadas a cada 5 segundos, facilitando a selecao de instancias ativas. Todas elas ficam salvas em MongoDB e sao restauradas quando o servidor inicia. O store de mensagens tambem eh persistido no banco, permitindo descriptografar mensagens e enquetes. O servidor testa a conexao com o banco ao iniciar e encerra caso nao consiga se conectar.

### Endpoints principais

- `GET /api/sessions` – lista todas as sessões salvas no banco com seu status.
- `POST /api/session` – cria ou atualiza uma sessão `{ id, webhook }`.
- `PUT /api/session/:id` – atualiza dados da sessão.
- `DELETE /api/session/:id` – remove a sessão.
- `POST /api/session/:id/reconnect` – reconecta a sessão.
- `GET /api/session/:id/status` – retorna o status da sessão.
- `GET /api/session/:id/qr` – obtém o QR code para autenticação.
- `POST /api/message` – envia texto `{ sessionId, number, message, ghost?, quotedId? }`.
- `POST /api/message/media` – envia mídia base64 `{ sessionId, number, mimetype, media, caption?, ghost?, quotedId? }`.
- `POST /api/message/poll` – envia enquetes `{ sessionId, number, question, options[], multiple? }`.
- `POST /api/message/delete` – remove uma mensagem `{ sessionId, number, messageId }`.

#### Ações de Grupos

- `POST /api/group` – cria um grupo passando `sessionId`, `subject` e `participants`.
- `GET /api/group/:id` – obtém dados do grupo usando `sessionId` na query.
- `POST /api/group/:id/subject` – altera o assunto do grupo.
- `POST /api/group/:id/add` – adiciona participantes.
- `POST /api/group/:id/remove` – remove participantes.
- `POST /api/group/:id/promote` – promove participantes.
- `POST /api/group/:id/demote` – rebaixa participantes.
- `POST /api/group/:id/leave` – sai do grupo.
 
#### Ações de Contatos
- `GET /api/contact/:id/status` – busca o status do contato informando `sessionId` na query.
- `POST /api/contact/:id/block` – bloqueia o contato.
- `POST /api/contact/:id/unblock` – desbloqueia o contato.
