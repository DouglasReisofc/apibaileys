📞 API WhatsApp com Baileys – Projeto #apibaileys
Crie uma API robusta para integração com o WhatsApp usando a biblioteca Baileys,
 com foco em múltiplos agentes (sessions), envio de mensagens, recebimento de eventos e controle via HTTP.

🛠️ Requisitos
Node.js 18+

TypeScript (opcional, mas recomendado)

Yarn ou NPM

Defina `GLOBAL_API_KEY` para proteger as rotas da API.
Crie um arquivo `.env` definindo `GLOBAL_API_KEY`, `PORT` e `MONGO_URI`.

MongoDB em `mongodb://admin:Shinobi7766@150.230.85.70:27017/?authSource=admin` (para armazenar sessões e o store de mensagens; altere usando a variável `MONGO_URI`)

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
 As instâncias disponíveis são atualizadas a cada 5 segundos, facilitando a seleção de conexões ativas. Todas elas ficam salvas em MongoDB e são restauradas quando o servidor inicia. O store de mensagens também é persistido no banco, permitindo descriptografar mensagens e enquetes. O servidor testa a conexão com o banco ao iniciar e encerra caso não consiga se conectar.
 Após escanear o QR code e a conexão abrir pela primeira vez, a sessão é reiniciada automaticamente para completar o pareamento.

Todas as rotas exigem o cabeçalho `x-api-key` com a chave definida em `GLOBAL_API_KEY`. As rotas que manipulam uma instância também exigem o cabeçalho `x-instance-key` com a chave própria daquela instância.

### Endpoints principais

- `GET /api/instances` – lista todas as instâncias salvas no banco com seu status.
- `POST /api/instance` – cria uma instância `{ name, webhook?, apiKey }`.
- `PUT /api/instance/:id` – atualiza dados da instância.
- `DELETE /api/instance/:id` – remove a instância.
- `POST /api/instance/:id/reconnect` – reconecta a instância.
- `GET /api/instance/:id/status` – retorna o status da instância.
- `GET /api/instance/:id/qr` – obtém o QR code para autenticação.
- `POST /api/message` – envia texto `{ instance, number, message, ghost?, quotedId? }`.
- `POST /api/message/media` – envia mídia base64 `{ instance, number, mimetype, media, caption?, ghost?, quotedId? }`.
- `POST /api/message/poll` – envia enquetes `{ instance, number, question, options[], multiple? }`.
- `POST /api/message/delete` – remove uma mensagem `{ instance, number, messageId }`.

#### Ações de Grupos

- `POST /api/group` – cria um grupo passando `instance`, `subject` e `participants`.
- `GET /api/group/:id` – obtém dados do grupo usando `instance` na query.
- `POST /api/group/:id/subject` – altera o assunto do grupo.
- `POST /api/group/:id/add` – adiciona participantes.
- `POST /api/group/:id/remove` – remove participantes.
- `POST /api/group/:id/promote` – promove participantes.
- `POST /api/group/:id/demote` – rebaixa participantes.
- `POST /api/group/:id/leave` – sai do grupo.
 
#### Ações de Contatos
- `GET /api/contact/:id/status` – busca o status do contato informando `instance` na query.
- `POST /api/contact/:id/block` – bloqueia o contato.
- `POST /api/contact/:id/unblock` – desbloqueia o contato.
