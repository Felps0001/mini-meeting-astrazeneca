# 📋 Mini-Meeting Dashboard

Dashboard para gestão de mini-meetings com sistema de convites e assinatura digital de participantes.

---

## 🛠️ Tecnologias

| Camada       | Stack                               |
| ------------ | ----------------------------------- |
| Frontend     | React 19 + Vite 8 + React Router    |
| Backend      | Node.js + Express 5 + MongoDB Atlas |
| Autenticação | JWT (jsonwebtoken) + bcryptjs       |
| E-mail       | Nodemailer                          |
| Assinatura   | react-signature-canvas              |

---

## 🚀 Como rodar

### Pré-requisitos

- Node.js 18+
- Conta no MongoDB Atlas (já configurada)

### 1. Backend

```bash
cd backend
npm install
npm run dev        # porta 5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # porta 3000
```

### 3. Criar o admin inicial (apenas na primeira vez)

```bash
cd backend
node scripts/seedAdmin.js
```

Credenciais geradas:

```
Email: admin@mini-meeting.com
Senha: Admin@2026
```

> ⚠️ Altere a senha após o primeiro login.

---

## ⚙️ Variáveis de ambiente

Arquivo: `backend/.env`

```env
MONGO_URI=mongodb+srv://...
JWT_SECRET=sua_chave_secreta
PORT=5000
CLIENT_URL=http://localhost:3000

# Configurar para envio real de e-mail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=seu@email.com
EMAIL_PASS=sua-senha-de-app

# Validação real de CRM (Infosimples). Sem este token a validação fica
# indisponível (retorna 503), pois a API pública do CFM exige reCAPTCHA.
# Crie a conta em https://api.infosimples.com/cadastro e cole o token aqui.
INFOSIMPLES_TOKEN=LVRLYi_brpi1FwPy9SHO-bycvCz0wNTzM3kdFoB0
```

> Se o e-mail não estiver configurado, o link de convite ainda aparece na tela do admin para ser copiado manualmente.

---

## 👥 Perfis de acesso

### Admin

- Vê **todos** os mini-meetings de todos os usuários
- Edita e exclui qualquer meeting
- Gerencia usuários (ativar, desativar, remover)
- Envia convites por e-mail para novos usuários

### Usuário comum

- Acessa apenas os **próprios** mini-meetings
- Pode ter **1 meeting ativo por vez**
- Cria o link de convite para participantes externos

---

## 📋 Funcionalidades

### Cadastro de usuários

- Cadastro somente por **convite do admin via e-mail**
- Link de convite com validade de **48 horas**
- Roles: `admin` e `user`

### Cadastro de mini-meeting

- Campos: título, descrição, local, data, horário de início e fim
- Cada usuário pode ter **1 meeting ativo por vez**
- Status: `ativo`, `encerrado`, `cancelado`

### Convite para participantes

- Botão gera um **link público** de inscrição
- Formulário externo com: nome, e-mail e **assinatura digital**
- Participantes ficam listados no detalhe do meeting com a assinatura

---

## 🗂️ Estrutura do projeto

```
mini-meeting/
├── backend/
│   ├── config/
│   │   └── db.js                  # Conexão MongoDB Atlas
│   ├── middleware/
│   │   └── auth.js                # JWT + verificação de role
│   ├── models/
│   │   ├── User.js
│   │   ├── Invite.js
│   │   └── MiniMeeting.js
│   ├── routes/
│   │   ├── auth.js                # Login, registro, info de convite
│   │   ├── users.js               # CRUD usuários (admin)
│   │   └── meetings.js            # CRUD meetings + inscrição pública
│   ├── scripts/
│   │   └── seedAdmin.js           # Cria o admin inicial
│   ├── utils/
│   │   └── mailer.js              # Envio de e-mail de convite
│   ├── .env
│   └── server.js
│
└── frontend/
    ├── index.html                 # Entry point Vite
    ├── vite.config.js
    └── src/
        ├── main.jsx               # Renderização React
        ├── App.jsx                # Rotas
        ├── context/
        │   └── AuthContext.jsx    # Estado global de autenticação
        ├── services/
        │   └── api.js             # Axios com interceptors JWT
        ├── components/
        │   ├── Navbar.jsx
        │   └── PrivateRoute.jsx
        └── pages/
            ├── Login.jsx
            ├── Register.jsx       # Cadastro via convite
            ├── Dashboard.jsx
            ├── Meetings.jsx       # Listagem de meetings
            ├── MeetingForm.jsx    # Criar / editar meeting
            ├── MeetingDetail.jsx  # Detalhes + lista de participantes
            ├── AdminUsers.jsx     # Gestão de usuários (admin)
            └── EventRegister.jsx  # Formulário público de inscrição
```

---

## 🌐 Rotas da API

| Método | Rota                                   | Acesso      | Descrição                            |
| ------ | -------------------------------------- | ----------- | ------------------------------------ |
| POST   | `/api/auth/login`                      | Público     | Login                                |
| POST   | `/api/auth/register`                   | Público     | Cadastro via token de convite        |
| GET    | `/api/auth/invite-info/:token`         | Público     | Valida convite                       |
| GET    | `/api/users`                           | Admin       | Lista usuários                       |
| POST   | `/api/users/invite`                    | Admin       | Envia convite por e-mail             |
| PATCH  | `/api/users/:id`                       | Admin       | Ativa/desativa usuário               |
| DELETE | `/api/users/:id`                       | Admin       | Remove usuário                       |
| GET    | `/api/meetings`                        | Autenticado | Lista meetings (filtro por role)     |
| GET    | `/api/meetings/:id`                    | Autenticado | Detalhes do meeting                  |
| POST   | `/api/meetings`                        | Autenticado | Cria meeting                         |
| PUT    | `/api/meetings/:id`                    | Autenticado | Edita meeting                        |
| DELETE | `/api/meetings/:id`                    | Autenticado | Remove meeting                       |
| GET    | `/api/meetings/invite/:token`          | Público     | Dados do evento para inscrição       |
| POST   | `/api/meetings/invite/:token/register` | Público     | Inscreve participante com assinatura |
