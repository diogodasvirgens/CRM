# CRM Diogo das Virgens

Sistema de CRM para gerenciar leads e funil de vendas dos dois negócios: **Shows contratados** e **Eventos próprios**.

- **Fase 1**: cadastro manual de lead, kanban por funil, login multiusuário com papéis, etiquetas livres e tela de administração.
- **Fase 2**: conexão com um número real de WhatsApp e caixa de entrada dentro do CRM, onde a equipe lê as conversas e decide o que virar lead. Mensagem nova **não** cria lead sozinha — isso fica pra Fase 3, quando um agente de IA assume essa triagem.

## Stack

- **Frontend**: React, TypeScript, Vite, React Query, Zustand, @hello-pangea/dnd para o drag and drop do kanban. Aplicação 100% estática (sem backend próprio), hospedada na Vercel.
- **Dados/autenticação**: [Supabase](https://supabase.com) — Postgres com Row Level Security, Supabase Auth, Storage (mídia do WhatsApp) e Edge Functions (ações privilegiadas: administração de usuários e integração com WhatsApp).
- **WhatsApp**: [UAZAPI](https://uazapi.com), uma API hospedada que mantém a conexão com o WhatsApp do lado dela — o CRM só fala REST/webhook com ela, sem precisar de processo próprio sempre ligado.

## Estrutura

```
src/          Aplicação React (kanban, caixa de entrada, cadastro de lead, administração)
public/       Arquivos estáticos servidos como estão
supabase/
  functions/  Edge Functions (Deno) — admin-users, whatsapp-send, whatsapp-webhook, whatsapp-connection
```

Todo o schema do banco (tabelas, RLS, triggers, funções RPC) vive só no projeto Supabase — não há pasta de migrations neste repositório.

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Um projeto no [Supabase](https://supabase.com)
- Uma instância na [UAZAPI](https://uazapi.com) (ou outro provedor de API hospedada de WhatsApp) já conectada a um número

Se `node --version` não funcionar num terminal novo, baixe o instalador em [nodejs.org](https://nodejs.org) (versão LTS) e instale normalmente, ou instale via [nvm](https://github.com/nvm-sh/nvm) se preferir gerenciar versões.

## Instalação e execução local

```bash
cp .env.example .env
```

Edite `.env` com a URL e a chave publicável (`anon`/`publishable`) do seu projeto Supabase (Project Settings → API).

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`.

### Build de produção

```bash
npm run build     # gera a pasta dist/
npm run preview   # serve o build localmente pra conferir
```

## Hospedagem (Vercel)

Não existe mais backend — é só um app estático.

1. Importe o repositório na Vercel normalmente (Root Directory = raiz do repo).
2. Em **Project Settings → Environment Variables**, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. `vercel.json` já redireciona qualquer rota pro `index.html` — necessário porque o app usa rotas do lado do cliente (`/conversas`, `/admin/etapas` etc.), senão recarregar a página numa rota que não seja `/` dá 404.

## Configuração da UAZAPI e das Edge Functions

O envio de mensagem/mídia, o status/QR de conexão e o recebimento de mensagens não passam pelo frontend nem por nenhum backend próprio — são três Edge Functions do Supabase que falam com a UAZAPI:

| Função | O que faz | Quem chama |
|---|---|---|
| `whatsapp-send` | Envia texto/mídia pela UAZAPI e grava a mensagem no banco | Frontend (usuário logado, exceto Financeiro) |
| `whatsapp-connection` | Status da conexão, gerar QR, desconectar | Frontend, só Gestor |
| `whatsapp-webhook` | Recebe mensagens novas da UAZAPI e grava no banco | UAZAPI (chamada pública, protegida por segredo próprio na URL) |

As credenciais da UAZAPI (URL da instância, token, segredo do webhook) ficam guardadas criptografadas no **Supabase Vault**, nunca em variável de ambiente do frontend nem hardcoded no código. As Edge Functions leem esses valores através da função `get_whatsapp_config()` (RPC restrita a `service_role`).

Pra apontar o webhook da UAZAPI pra este projeto:

```bash
curl -X POST "https://SEU-DOMINIO.uazapi.com/webhook" \
  -H "token: SEU_TOKEN_DE_INSTANCIA" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "url": "https://SEU_PROJETO.supabase.co/functions/v1/whatsapp-webhook?key=SEU_SEGREDO",
    "events": ["messages"],
    "excludeMessages": ["wasSentByApi"]
  }'
```

Mídia (fotos, áudios, documentos) fica num bucket privado do Supabase Storage (`whatsapp-media`), com o nome do arquivo igual ao id da `Message` dona dele — mesma convenção usada antes com disco local.

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

Essas regras são aplicadas via Row Level Security no Postgres (não só escondidas na interface), então uma tentativa de burlar direto pela API do Supabase também é bloqueada.

## Como parear o WhatsApp

1. Faça login com um usuário **Gestor**.
2. Vá em **Administração → WhatsApp**.
3. Se a instância da UAZAPI ainda não estiver conectada, um QR Code aparece na tela. No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho, e escaneie o código.
4. Assim que escanear, a tela muda pra "Conectado" e mostra o número pareado.

A sessão do WhatsApp fica salva do lado da UAZAPI, não neste repositório nem em nenhuma máquina específica — reiniciar o frontend ou fazer um novo deploy não derruba a conexão.

**Sobre qual número conectar**: assim como no Baileys, é uma sessão de WhatsApp Web (não a API oficial da Meta) — funciona com o número pessoal, mas todo contato daquele número passa a poder gerar mensagens que aparecem na caixa de entrada do CRM. Nada disso vira lead sozinho, mas se isso for indesejado, considere um número dedicado só ao negócio.

## O que já funciona

Tudo da Fase 1, mais:

- Caixa de entrada (`/conversas`): lista de conversas por contato, ordenada pela mais recente, com marcação de não lida.
- Responder uma conversa pelo CRM envia a mensagem de verdade no WhatsApp.
- "Criar lead" a partir de uma conversa: escolhe a frente (Show contratado ou Evento próprio), o lead nasce na primeira etapa daquele funil e fica ligado à conversa dali em diante.
- Se a conversa já é de um lead existente, as mensagens aparecem direto dentro do card do lead (mesmo modal de detalhe da Fase 1) — inclusive pra quem só tem acesso de leitura (Financeiro).
- Arquivar conversa (some da lista principal sem apagar nada — útil pra contato pessoal que não é cliente).
- Um mesmo contato pode virar lead mais de uma vez em épocas diferentes: o modelo de dados guarda o telefone num `Contact` separado do `Lead`, e cada lead sabe a qual contato pertence.
- Fotos, áudios (inclusive gravar e enviar direto do navegador, sem precisar do celular) e documentos: aparecem na conversa (imagem em miniatura, áudio com player, documento como botão de baixar) e dá pra enviar os três de volta pelo CRM.
- Busca por leads e por conversas tolerante a erro de digitação e sem distinção de acento ("joao" encontra "João"), e filtro de conversas por etapa do funil (inclusive "sem lead vinculado").
- Responsável do lead é atribuído automaticamente pra quem move um lead sem dono pra outra etapa, ou pra quem cria o lead a partir de uma conversa — sem sobrescrever um responsável que já existe.
- Apagar mensagem: some do CRM (registro e arquivo de mídia), mas não mexe na mensagem do lado do WhatsApp — não é a mesma coisa que "apagar para todos".

## Decisões técnicas relevantes

- **Origem do lead**: é um dos quatro valores fixos (indicação, redes sociais, recorrência, tráfego pago) ou "Outro" com texto livre, conforme pedido no escopo. Lead criado a partir de uma conversa do WhatsApp nasce com origem "Outro / Caixa de entrada do WhatsApp" por padrão — o vendedor ajusta depois se souber a origem real.
- **Contato x Lead**: telefone mora no `Contact`, não solto no `Lead`. Cada `Contact` tem um `currentLeadId` apontando pro lead "atual" daquela conversa — é ele que recebe as mensagens novas enquanto ninguém criar um lead novo pra esse contato.
- **Mensagem sem lead**: mensagem nova de um contato sem lead vinculado fica só no `Contact` (`leadId` nulo) até alguém decidir criar o lead. Esse desenho já é o que a Fase 3 (agente de IA) vai usar pra fazer a triagem automática.
- **Áudio de voz (PTT)**: a UAZAPI aceita o WebM/Opus gerado direto pelo `MediaRecorder` do navegador como mensagem de voz, sem precisar converter pra OGG — diferente do Baileys, que exigia transcodificação.
- **Escrita atômica de mensagem do WhatsApp**: tanto o envio quanto o recebimento passam pela função `record_whatsapp_message` (RPC `SECURITY DEFINER`), que acha-ou-cria o `Contact`, faz dedupe por `whatsappMessageId` e insere a `Message` numa única transação — evita duplicar mensagem quando o eco do próprio envio chega de volta.
- **Lista de convidados da edição**: hoje é composta pelos leads vinculados àquela edição (nome e telefone). Se no futuro um lead único puder representar várias pessoas na porta (por exemplo, compra de dois ingressos), vale revisar esse modelo para guardar uma lista de nomes por lead.
- **Usuário nunca é apagado, só desativado**: preserva a integridade do histórico de mudanças (que guarda quem alterou o quê).

## Arquitetura pensada para as próximas fases

Não foi construído agora, mas o modelo de dados não trava:

- **Fase 3** (agente de IA e Pix): a caixa de entrada e o modelo de `Contact`/`Message` desta fase são exatamente o que o agente vai usar pra ler e responder conversas antes de um humano entrar, junto com confirmação automática de pagamento Pix via Mercado Pago.
- **Fase 4** (custo e receita por evento): `EventEdition` e `Lead` já existem como entidades separadas, prontas para receber lançamentos financeiros futuros.

## Comandos úteis

```bash
npm install       # instala as dependências
npm run dev        # sobe o app em modo desenvolvimento (http://localhost:5173)
npm run build      # gera o build de produção em dist/
npm run preview    # serve o build localmente
```
