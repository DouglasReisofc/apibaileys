📞 API WhatsApp com Baileys – Projeto #apibaileys
Crie uma API robusta para integração com o WhatsApp usando a biblioteca Baileys,
 com foco em múltiplos agentes (sessions), envio de mensagens, recebimento de eventos e controle via HTTP.

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

- `GET /api/sessions` – lista sessões ativas.
- `POST /api/session` – cria ou atualiza uma sessão `{ id, webhook }`.
- `PUT /api/session/:id` – atualiza dados da sessão.
- `DELETE /api/session/:id` – remove a sessão.
- `POST /api/session/:id/reconnect` – reconecta a sessão.
- `GET /api/session/:id/status` – retorna o status da sessão.
- `GET /api/session/:id/qr` – obtém o QR code para autenticação.
- `POST /api/message` – envia uma mensagem informando `sessionId`.

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
