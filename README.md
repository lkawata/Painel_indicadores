# Painel de Indicadores

Aplicação web para exibição e gerenciamento de indicadores integrados ao Power BI.

## 🚀 Tecnologias Utilizadas

- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6)
- **Backend / BaaS:** [Supabase](https://supabase.com/) (Banco PostgreSQL, Autenticação e Storage de Imagens)
- **Integração:** Microsoft Power BI
- **Automação:** GitHub Actions (Keep Alive Workflow)

## 📂 Estrutura do Projeto

- `.github/workflows/keep-alive.yml`: Workflow do GitHub Actions para fazer requisições HTTP automáticas a cada 3 dias e evitar a pausa do projeto Supabase.
- `index.html`: Interface pública de visualização e filtros do catálogo.
- `login.html`: Interface de autenticação segura dos administradores.
- `admin.html`: Painel restrito para gestão (CRUD) dos indicadores e upload de capas.
- `app.js`: Lógica central da aplicação, controle de DOM e comunicação com o Supabase.
- `style.css`: Design system, layout responsivo e estilos globais compartilhados.
- `.env.example`: Modelo de configuração das chaves de acesso ao Supabase.

## 🛠️ Configuração e Instalação

1. Clone este repositório.
2. Crie um projeto no Supabase e configure a estrutura do banco de dados (tabela `indicadores` e bucket `imagens-indicadores`).
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

## 🔒 Segurança

O acesso ao painel de administração (`admin.html`) é protegido pelo Supabase Auth. Além disso, as políticas RLS garantem que operações de alteração de dados sejam restritas a usuários autenticados.
