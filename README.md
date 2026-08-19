# CRM Diogo das Virgens

Sistema de CRM para gerenciar leads e funil de vendas dos dois negócios: **Shows contratados** e **Eventos próprios**. Fase 1: cadastro manual de lead, kanban por funil, login multiusuário com papéis, etiquetas livres e tela de administração. Sem integração com WhatsApp ainda.

## Stack

- **Backend**: Node.js, Express, TypeScript, Prisma, SQLite, JWT.
- **Frontend**: React, TypeScript, Vite, React Query, Zustand, @hello-pangea/dnd para o drag and drop do kanban.

O banco é SQLite para começar. O schema Prisma foi escrito para trocar para PostgreSQL sem reescrever o resto do código: basta trocar o `provider` do `datasource` em `backend/prisma/schema.prisma` e a `DATABASE_URL`.

## Estrutura

```
backend/     API REST, Prisma, autenticação e regras de permissão
frontend/    Aplicação React (kanban, cadastro de lead, administração)
```

## Pré-requisitos

- Node.js 20 ou superior
- npm

Esta máquina não tem Node.js instalado (nem Homebrew). Antes de seguir os passos abaixo, baixe o instalador em [nodejs.org](https://nodejs.org) (versão LTS) e instale normalmente, ou instale via [nvm](https://github.com/nvm-sh/nvm) se preferir gerenciar versões. Depois confirme com `node --version` num terminal novo.

## Instalação e execução local

Backend e frontend rodam juntos num único endereço: `http://localhost:3333`. O backend serve a API (em `/api`) e também os arquivos do frontend já compilado.

### Primeira vez

```bash
cd backend
cp .env.example .env
cd ..
npm run setup
```

O `npm run setup` instala as dependências das duas partes, roda as migrações do banco e cria os usuários e etapas iniciais (o comando de seed).

### Rodar o sistema

```bash
npm start
```

Isso compila o frontend, compila o backend e sobe tudo. Acesse `http://localhost:3333` no navegador. Só existe essa uma porta.

### Modo desenvolvimento (com hot reload)

Se for mexer no código e quiser recarregamento automático, rode backend e frontend separados, em dois terminais:

```bash
# terminal 1
cd backend
npm run dev        # API em http://localhost:3333

# terminal 2
cd frontend
npm run dev         # interface em http://localhost:5173, já configurada para conversar com a API acima
```

Nesse modo use `http://localhost:5173` durante o desenvolvimento. Quando terminar de mexer, volte a usar `npm start` na raiz para o modo de porta única.

## Logins de teste

Todos os usuários iniciais nascem com a mesma senha provisória e são obrigados a trocá-la no primeiro login.

| Nome | E-mail | Papel | Senha provisória |
|---|---|---|---|
| Diogo | diogo@diogodasvirgens.com.br | Gestor | `Trocar@123` |
| Mauricio | mauricio@diogodasvirgens.com.br | Atendente / Vendedor | `Trocar@123` |
| Secretária | secretaria@diogodasvirgens.com.br | Atendente / Vendedor | `Trocar@123` |

Os e-mails são placeholders, ainda não correspondem a caixas de e-mail reais. Troque-os na tela de administração quando quiser usar e-mails de verdade.

## Papéis e permissões

| Papel | Acesso |
|---|---|
| Gestor | Total: os dois funis, todos os leads, administração de usuários, etapas, etiquetas e edições de evento |
| Atendente / Vendedor | Vê todos os leads dos dois funis. Só edita, move ou apaga leads sem responsável ou que já são dele. Pode se autoatribuir um lead, mas não pode reatribuir um lead de outra pessoa |
| Financeiro | Vê tudo nos dois funis, inclusive valores. Acesso somente leitura: não cria, edita, move nem apaga lead |

Essas regras são aplicadas no backend (não só escondidas na interface), então uma tentativa de burlar pela API também é bloqueada.

## O que já funciona nesta fase

- Login multiusuário com papéis diferentes e troca de senha obrigatória no primeiro acesso.
- Dois funis kanban (Shows contratados e Eventos próprios) com as etapas migradas das listas do WhatsApp Business, na ordem original.
- Criar, editar, mover (arrastar entre etapas) e apagar lead.
- Etiquetas livres, criadas por qualquer usuário logado direto no card do lead.
- Histórico de mudança de etapa e de responsável em cada lead (quem mudou, o quê, quando).
- Tela de administração (`/admin`, exclusiva do Gestor): usuários (criar, editar papel, ativar/desativar, gerar nova senha provisória), etapas dos funis (criar, renomear, reordenar, apagar se vazia), etiquetas (criar, apagar) e edições de evento (criar, editar, apagar).
- Edição de evento gera lista de convidados exportável em CSV, pensada para conferência na portaria.

## Decisões técnicas relevantes

- **Origem do lead**: é um dos quatro valores fixos (indicação, redes sociais, recorrência, tráfego pago) ou "Outro" com texto livre, conforme pedido no escopo.
- **Lista de convidados da edição**: hoje é composta pelos leads vinculados àquela edição (nome e telefone). Se no futuro um lead único puder representar várias pessoas na porta (por exemplo, compra de dois ingressos), vale revisar esse modelo para guardar uma lista de nomes por lead.
- **Enums no SQLite**: o Prisma não suporta enum nativo em SQLite, então papel, frente de negócio, origem e tipo de histórico são campos `String` validados na camada de aplicação (zod). Ao migrar para PostgreSQL dá para promovê-los a enum de verdade sem tocar no resto do código.
- **Usuário nunca é apagado, só desativado**: preserva a integridade do histórico de mudanças (que guarda quem alterou o quê).

## Arquitetura pensada para as próximas fases

Não foi construído agora, mas o modelo de dados não trava:

- **Fase 2** (WhatsApp via Baileys): o campo `phone` do lead já está pronto para casar com o número de WhatsApp de quem escreve.
- **Fase 3** (agente de IA e Pix): a estrutura de lead e histórico já comporta anexar uma tabela de conversas no futuro sem redesenhar o resto.
- **Fase 4** (custo e receita por evento): `EventEdition` e `Lead` já existem como entidades separadas, prontas para receber lançamentos financeiros futuros.

## Comandos úteis

Na raiz do projeto:

```bash
npm run setup    # instala tudo, roda migração e seed (primeira vez)
npm run build     # compila frontend e backend
npm start          # builda e sobe tudo em http://localhost:3333
```

Dentro de `backend/`:

```bash
npm run prisma:studio    # abre uma interface visual do banco
npm run prisma:migrate   # cria uma nova migração após mudar o schema
```
