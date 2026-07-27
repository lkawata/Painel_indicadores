# Painel de Indicadores

Aplicação web para exibição e gerenciamento de indicadores integrados ao Power BI.

## 🚀 Tecnologias Utilizadas

- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6)
- **Backend / BaaS:** [Supabase](https://supabase.com/) (Banco PostgreSQL, Autenticação e Storage de Imagens)
- **Integração:** Microsoft Power BI
- **Automação:** GitHub Actions (Keep Alive Workflow)

## 📂 Estrutura do Projeto

- `.github/workflows/keep-alive.yml`: Workflow do GitHub Actions para fazer requisições HTTP automáticas a cada 3 dias e evitar a pausa do projeto Supabase.
- `index.html`: Interface principal de visualização e filtros do catálogo (requer autenticação).
- `login.html`: Interface de autenticação de usuários (com toggle de visualização de senha).
- `admin.html`: Painel restrito (apenas para perfil `admin`) para gestão de indicadores, upload de capas e administração de usuários.
- `app.js`: Lógica central da aplicação, controle de DOM, autenticação e comunicação com o Supabase.
- `style.css`: Design system, layout responsivo e estilos globais compartilhados.
- `.env.example`: Modelo de configuração das chaves de acesso ao Supabase.
- `ROTINA_DE_BACKUP.txt`: Scripts SQL para backup do banco, criação da tabela `profiles` e configuração de políticas de segurança RLS e RBAC.

## 🛠️ Configuração e Instalação

1. Clone este repositório.
2. Crie um projeto no Supabase e configure a estrutura do banco de dados executando o script `ROTINA_DE_BACKUP.txt` (tabelas `indicadores` e `profiles`, funções de segurança e bucket `imagens-indicadores`).
3. Renomeie o arquivo `.env.example` para as configurações do seu ambiente ou adicione as variáveis `SUPABASE_URL` e `SUPABASE_KEY` no arquivo `app.js`.
4. Abra o arquivo `index.html` em seu navegador ou utilize uma extensão como Live Server no VS Code para visualizar a aplicação localmente.

## 🔄 Manutenção (Supabase Keep Alive)

O projeto inclui um workflow de automação para evitar a suspensão do banco de dados do Supabase por inatividade (política do plano gratuito de pausar após 1 semana sem uso):

1. **Configuração dos Secrets**:
   No repositório do GitHub, acesse **Settings > Secrets and variables > Actions** e adicione:
   - `SUPABASE_URL`: URL da sua API do Supabase (ex: `https://xxxx.supabase.co`).
   - `SUPABASE_ANON_KEY`: A chave anônima/pública do Supabase (`anon/public key`).
2. **Execução**:
   O workflow roda de forma totalmente automatizada a cada 3 dias via cron no GitHub Actions, ou pode ser acionado manualmente pela aba **Actions** no painel do GitHub.

## 🔒 Segurança e Controle de Acesso (RBAC)

O sistema foi projetado para ser 100% privado, possuindo as seguintes camadas de segurança:

- **Autenticação Obrigatória**: Todas as páginas (`index.html`, `admin.html`) verificam a sessão ativa. Usuários não autenticados são redirecionados automaticamente para `login.html`.
- **Perfis de Acesso (RBAC)**: A tabela `profiles` gerencia os níveis de acesso:
  - **`admin`**: Tem acesso total, incluindo a gestão de usuários e indicadores (`admin.html`).
  - **`leitura`**: Apenas visualiza o catálogo (`index.html`).
- **Row Level Security (RLS)**: Todas as tabelas do banco (`indicadores` e `profiles`) possuem RLS ativo. O acesso aos dados no banco PostgreSQL é rigorosamente validado no nível de banco de dados:
  - A visualização dos dados (SELECT) é restrita apenas a usuários devidamente autenticados (`authenticated`).
  - As operações de escrita (INSERT, UPDATE, DELETE) são validadas pela função customizada `is_admin()`, garantindo que apenas usuários autenticados com o perfil de administrador (`admin`) possam modificar registros.
