# CRM Diogo das Virgens

Sistema de CRM para gerenciar leads e funil de vendas dos dois negócios: **Shows contratados** e **Eventos próprios**.

- **Fase 1**: cadastro manual de lead, kanban por funil, login multiusuário com papéis, etiquetas livres e tela de administração.
- **Fase 2** (atual): conexão com um número real de WhatsApp (via Baileys) e caixa de entrada dentro do CRM, onde a equipe lê as conversas e decide o que virar lead. Mensagem nova **não** cria lead sozinha — isso fica pra Fase 3, quando um agente de IA assume essa triagem.

## Stack

- **Backend**: Node.js, Express, TypeScript, Prisma, PostgreSQL (hospedado no Supabase), JWT, [Baileys](https://github.com/WhiskeySockets/Baileys) para a conexão com o WhatsApp.
- **Frontend**: React, TypeScript, Vite, React Query, Zustand, @hello-pangea/dnd para o drag and drop do kanban.

## Estrutura

```
backend/     API REST, Prisma, autenticação, regras de permissão e a conexão com o WhatsApp
frontend/    Aplicação React (kanban, caixa de entrada, cadastro de lead, administração)
```

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Um projeto Postgres no [Supabase](https://supabase.com) (o `DATABASE_URL` do backend aponta pra lá)
- Um número de WhatsApp pra parear (recomendado: um número dedicado ao negócio, não o pessoal — veja o aviso na seção de pareamento abaixo)

Se `node --version` não funcionar num terminal novo, baixe o instalador em [nodejs.org](https://nodejs.org) (versão LTS) e instale normalmente, ou instale via [nvm](https://github.com/nvm-sh/nvm) se preferir gerenciar versões.

## Instalação e execução local

Backend e frontend rodam juntos num único endereço: `http://localhost:3333`. O backend serve a API (em `/api`) e também os arquivos do frontend já compilado.

### Primeira vez

```bash
cd backend
cp .env.example .env
```

Edite `backend/.env` e troque `[YOUR-PASSWORD]` no `DATABASE_URL` pela senha do seu projeto Supabase (Project Settings → Database → Database Password).

```bash
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

## Como parear o WhatsApp pela primeira vez

1. Suba o sistema (`npm start` ou o modo desenvolvimento) e faça login com um usuário **Gestor**.
2. Vá em **Administração → WhatsApp**.
3. Um QR Code aparece na tela em poucos segundos. No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho, e escaneie o código.
4. Assim que escanear, a tela muda pra "Conectado" e mostra o número pareado. A partir daí, mensagens novas já aparecem na Caixa de entrada (`/conversas`).

A sessão fica salva em `backend/whatsapp-session/` (uma pasta local, fora do controle de versão — nunca comite esse conteúdo, ele equivale a estar logado no WhatsApp daquele número). Reiniciar o servidor não pede novo QR Code: ele reconecta sozinho usando essa sessão salva. Só é preciso escanear de novo se a sessão for encerrada — pelo botão "Desconectar" na própria tela, ou se o celular desvincular o aparelho do lado do WhatsApp. Se isso acontecer, a tela de administração mostra claramente "Sessão encerrada — é preciso parear de novo", nunca falha em silêncio.

**Sobre qual número conectar**: o Baileys simula uma sessão de WhatsApp Web — não é a API oficial da Meta. Ele funciona com o número pessoal, mas todo contato daquele número (familiar, pessoal, etc.) passa a poder gerar mensagens que aparecem na caixa de entrada do CRM. Nada disso vira lead sozinho (é preciso um humano clicar em "Criar lead" e escolher a frente), mas se isso for indesejado, considere um número dedicado só ao negócio.

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
| Gestor | Total: os dois funis, todos os leads, caixa de entrada do WhatsApp, tela de pareamento, administração de usuários, etapas, etiquetas e edições de evento |
| Atendente / Vendedor | Vê todos os leads dos dois funis e todas as conversas da caixa de entrada. Só edita, move ou apaga leads sem responsável ou que já são dele — mesma regra vale pra criar lead a partir de uma conversa e pra responder mensagens. Pode se autoatribuir um lead, mas não pode reatribuir um lead de outra pessoa |
| Financeiro | Vê tudo nos dois funis, inclusive valores. Acesso somente leitura: não cria, edita, move nem apaga lead. **Sem acesso à caixa de entrada do WhatsApp** — não conversa com contatos, só vê o histórico de mensagens já dentro do card de um lead |

Essas regras são aplicadas no backend (não só escondidas na interface), então uma tentativa de burlar pela API também é bloqueada.

## O que já funciona nesta fase

Tudo da Fase 1, mais:

- Conexão com WhatsApp real via Baileys, com sessão persistente (sobrevive a reinício do servidor) e tela de status/pareamento exclusiva do Gestor.
- Caixa de entrada (`/conversas`): lista de conversas por contato, ordenada pela mais recente, com marcação de não lida.
- Responder uma conversa pelo CRM envia a mensagem de verdade no WhatsApp.
- "Criar lead" a partir de uma conversa: escolhe a frente (Show contratado ou Evento próprio), o lead nasce na primeira etapa daquele funil e fica ligado à conversa dali em diante.
- Se a conversa já é de um lead existente, as mensagens aparecem direto dentro do card do lead (mesmo modal de detalhe da Fase 1) — inclusive pra quem só tem acesso de leitura (Financeiro).
- Arquivar conversa (some da lista principal sem apagar nada — útil pra contato pessoal que não é cliente).
- Um mesmo contato pode virar lead mais de uma vez em épocas diferentes: o modelo de dados guarda o telefone num `Contact` separado do `Lead`, e cada lead sabe a qual contato pertence.
- Fotos, áudios (inclusive gravar e enviar direto do navegador, sem precisar do celular) e documentos: aparecem na conversa (imagem em miniatura, áudio com player, documento como botão de baixar) e dá pra enviar os três de volta pelo CRM.
- Busca por leads e por conversas tolerante a erro de digitação e sem distinção de acento ("joao" encontra "João"), e filtro de conversas por etapa do funil (inclusive "sem lead vinculado").
- Responsável do lead é atribuído automaticamente pra quem move um lead sem dono pra outra etapa, ou pra quem cria o lead a partir de uma conversa — sem sobrescrever um responsável que já existe.

## Decisões técnicas relevantes

- **Origem do lead**: é um dos quatro valores fixos (indicação, redes sociais, recorrência, tráfego pago) ou "Outro" com texto livre, conforme pedido no escopo. Lead criado a partir de uma conversa do WhatsApp nasce com origem "Outro / Caixa de entrada do WhatsApp" por padrão — o vendedor ajusta depois se souber a origem real.
- **Contato x Lead**: telefone mora no `Contact`, não solto no `Lead` (migrado nesta fase). Cada `Contact` tem um `currentLeadId` apontando pro lead "atual" daquela conversa — é ele que recebe as mensagens novas enquanto ninguém criar um lead novo pra esse contato.
- **Mensagem sem lead**: mensagem nova de um contato sem lead vinculado fica só no `Contact` (`leadId` nulo) até alguém decidir criar o lead. Esse desenho já é o que a Fase 3 (agente de IA) vai usar pra fazer a triagem automática.
- **Armazenamento de mídia**: fotos, áudios e documentos ficam salvos em disco local (`backend/media-storage/`, fora do controle de versão, igual `whatsapp-session/`) — nome do arquivo é o id da `Message` dona dele. Servido só por trás de autenticação (`GET /api/media/:messageId`), nunca como arquivo estático público. Áudio gravado no navegador sai no formato que o navegador gerar (geralmente `audio/webm`); o WhatsApp recebe e toca normalmente, mas pode não aparecer com a "bolha" nativa de mensagem de voz do app oficial.
- **Lista de convidados da edição**: hoje é composta pelos leads vinculados àquela edição (nome e telefone). Se no futuro um lead único puder representar várias pessoas na porta (por exemplo, compra de dois ingressos), vale revisar esse modelo para guardar uma lista de nomes por lead.
- **Enums no Postgres**: papel, frente de negócio, origem, tipo de histórico e direção de mensagem são campos `String` validados na camada de aplicação (zod), não `enum` nativo do Postgres — mantém a mesma convenção usada desde a Fase 1, fácil de promover a enum de verdade depois se fizer falta.
- **Usuário nunca é apagado, só desativado**: preserva a integridade do histórico de mudanças (que guarda quem alterou o quê).

## Arquitetura pensada para as próximas fases

Não foi construído agora, mas o modelo de dados não trava:

- **Fase 3** (agente de IA e Pix): a caixa de entrada e o modelo de `Contact`/`Message` desta fase são exatamente o que o agente vai usar pra ler e responder conversas antes de um humano entrar, junto com confirmação automática de pagamento Pix via Mercado Pago.
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
