// ==========================================================================
// SUPABASE CONFIGURATION & CLIENT INITIALIZATION
// ==========================================================================
let SUPABASE_URL = 'https://qlhbpzulkgzrqoeslely.supabase.co/rest/v1/';
const SUPABASE_KEY = 'sb_publishable_5IYKOf3ZvU9jVr1-qpSm_g_bdZ6IalW';

// Automatically clean trailing rest suffix to prevent SDK network 404s
if (SUPABASE_URL.endsWith('/rest/v1/')) {
    SUPABASE_URL = SUPABASE_URL.slice(0, -9);
}

// Global client variable renamed to supabaseClient to avoid name collision with window.supabase
let supabaseClient = null;
try {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (err) {
    console.error('Erro ao inicializar Supabase:', err);
}

// Cache variables for admin page to hold indicators data
let indicatorsCache = [];

// ==========================================================================
// ROUTER / PAGE DETECTOR
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Index Page
    if (document.getElementById('grid-indicadores')) {
        await initIndexPage();
    }

    // 2. Login Page
    if (document.getElementById('form-login')) {
        initLoginPage();
    }

    // 3. Admin Page
    if (document.getElementById('form-indicador')) {
        await initAdminPage();
    }

    // 4. Reset Password Page
    if (document.getElementById('form-reset-password')) {
        await initResetPasswordPage();
    }
});

// ==========================================================================
// 1. INDEX PAGE LOGIC (index.html)
// ==========================================================================
async function initIndexPage() {
    if (!supabaseClient && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    // 1.1 Autenticação obrigatória (Redirecionamento se deslogado)
    let { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (!session) {
        // Aguarda 200ms caso o storage local do Supabase ainda esteja hidratando
        await new Promise(resolve => setTimeout(resolve, 200));
        const retry = await supabaseClient.auth.getSession();
        session = retry.data?.session;
    }

    if (sessionError || !session) {
        window.location.href = 'login.html';
        return;
    }

    // 1.2 Consulta do perfil (role) na tabela 'profiles'
    let role = 'leitura'; // fallback seguro por padrão
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profile && profile.role) {
            role = profile.role;
        }
    } catch (pErr) {
        console.warn('Não foi possível obter o perfil em profiles:', pErr);
    }

    // 1.3 Atualização dos botões e badge no cabeçalho
    const badge = document.getElementById('user-info-badge');
    if (badge) {
        const roleLabel = role === 'admin' ? 'Admin' : 'Leitura';
        badge.innerHTML = `<i class="fa-regular fa-user"></i> ${escapeHtml(session.user.email)} <span class="role-tag">${roleLabel}</span>`;
        badge.style.display = 'inline-flex';
    }

    const btnAdmin = document.getElementById('btn-admin-redirect');
    if (btnAdmin) {
        if (role === 'admin') {
            btnAdmin.style.display = 'inline-flex';
        } else {
            btnAdmin.style.display = 'none';
        }
    }

    const btnLogoutIndex = document.getElementById('btn-logout-index');
    if (btnLogoutIndex) {
        btnLogoutIndex.style.display = 'inline-flex';
        btnLogoutIndex.addEventListener('click', async () => {
            btnLogoutIndex.disabled = true;
            btnLogoutIndex.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Saindo...</span>';
            await supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        });
    }

    // Revela a página index.html após autenticação verificada
    document.body.style.display = 'block';

    const gridContainer = document.getElementById('grid-indicadores');
    const filterBar = document.getElementById('filter-bar');
    const filterPills = document.getElementById('filter-pills');

    gridContainer.innerHTML = `
        <div class="loading-spinner">
            <i class="fa-solid fa-spinner fa-spin"></i> Carregando indicadores...
        </div>
    `;

    try {
        // Fetch indicators ordered by created_at DESC
        const { data: indicadores, error } = await supabaseClient
            .from('indicadores')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!indicadores || indicadores.length === 0) {
            gridContainer.innerHTML = `
                <div class="no-data-alert">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>Nenhum indicador cadastrado no momento.</p>
                </div>
            `;
            if (filterBar) filterBar.hidden = true;
            return;
        }

        // --- Build filter pills from unique tags ---
        const uniqueTags = ['Todos', ...new Set(indicadores.map(i => i.tag || 'Indicador'))];
        let activeFilter = 'Todos';

        if (filterPills) {
            filterPills.innerHTML = '';
            uniqueTags.forEach(tag => {
                const pill = document.createElement('button');
                pill.className = 'filter-pill' + (tag === 'Todos' ? ' active' : '');
                pill.textContent = tag;
                pill.setAttribute('data-filter', tag);
                pill.addEventListener('click', () => {
                    activeFilter = tag;
                    // Update pill active states
                    filterPills.querySelectorAll('.filter-pill').forEach(p => {
                        p.classList.toggle('active', p.getAttribute('data-filter') === tag);
                    });
                    // Show/hide cards
                    gridContainer.querySelectorAll('.card-indicador').forEach(card => {
                        const cardTag = card.getAttribute('data-tag');
                        const visible = (tag === 'Todos') || (cardTag === tag);
                        card.classList.toggle('hidden-by-filter', !visible);
                    });
                });
                filterPills.appendChild(pill);
            });

            // --- Scroll arrows logic ---
            const btnLeft = document.getElementById('filter-scroll-left');
            const btnRight = document.getElementById('filter-scroll-right');
            const SCROLL_STEP = 160;

            if (btnLeft) {
                btnLeft.addEventListener('click', () => {
                    filterPills.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' });
                });
            }
            if (btnRight) {
                btnRight.addEventListener('click', () => {
                    filterPills.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' });
                });
            }

            // Hide arrows when not needed
            const updateArrows = () => {
                if (!btnLeft || !btnRight) return;
                btnLeft.style.opacity = filterPills.scrollLeft > 0 ? '1' : '0.3';
                btnRight.style.opacity =
                    filterPills.scrollLeft < filterPills.scrollWidth - filterPills.clientWidth - 1
                        ? '1' : '0.3';
            };
            filterPills.addEventListener('scroll', updateArrows);
            // Initial state
            requestAnimationFrame(updateArrows);
        }

        // --- Render cards ---
        gridContainer.innerHTML = '';
        indicadores.forEach(item => {
            const card = document.createElement('div');
            const itemTag = item.tag || 'Indicador';
            card.className = 'card-indicador';
            card.setAttribute('data-tag', itemTag);

            // Fallback image in case url_imagem is empty or broken
            const imageUrl = item.url_imagem || 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80';

            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${imageUrl}" alt="${escapeHtml(item.titulo)}">
                    <div class="card-overlay">
                        <p class="overlay-description">${escapeHtml(item.descricao)}</p>
                        <a href="${sanitizeUrl(item.url_powerbi)}" target="_blank" class="btn-visualizar" style="text-decoration: none;">
                            <span>VISUALIZAR</span>
                            <i class="fa-solid fa-arrow-right"></i>
                        </a>
                    </div>
                </div>
                <div class="card-info-container">
                    <span class="card-tag">${escapeHtml(itemTag)}</span>
                    <h3 class="card-title">${escapeHtml(item.titulo)}</h3>
                </div>
            `;
            gridContainer.appendChild(card);
        });

        // --- Atualiza os mini-cards de KPI ---
        updateKpiCards(indicadores);

    } catch (error) {
        console.error('Erro ao buscar indicadores:', error);
        gridContainer.innerHTML = `
            <div class="no-data-alert error">
                <i class="fa-solid fa-circle-exclamation"></i>
                <p>Falha ao carregar os indicadores do banco de dados.</p>
                <small>${escapeHtml(error.message)}</small>
            </div>
        `;
    }
}

// ==========================================================================
// 1.1 KPI MINI-CARDS — Atualização dinâmica dos valores
// ==========================================================================
function updateKpiCards(indicadores) {
    // --- Card 1: Total de Indicadores ---
    const elTotal = document.getElementById('kpi-total-indicadores');
    if (elTotal) {
        elTotal.textContent = indicadores.length;
    }

    // --- Card 2: Setores Ativos (tags únicas, excluindo fallback) ---
    const elSetores = document.getElementById('kpi-setores-ativos');
    if (elSetores) {
        const uniqueTags = new Set(
            indicadores
                .map(i => (i.tag || '').trim())
                .filter(tag => tag.length > 0)
        );
        elSetores.textContent = uniqueTags.size;
    }

    // --- Card 3: Última Atualização (indicador com created_at mais recente) ---
    const elData = document.getElementById('kpi-ultima-atualizacao');
    const elSub = document.getElementById('kpi-ultima-atualizacao-sub');
    if (elData && elSub) {
        // Ordena decrescente por created_at e pega o primeiro
        const sorted = [...indicadores].sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
        });

        if (sorted.length > 0) {
            const latest = sorted[0];
            const date = new Date(latest.created_at);

            // Formata como "Jul 2026" em pt-BR
            const monthYear = date.toLocaleDateString('pt-BR', {
                month: 'short',
                year: 'numeric'
            });
            // Capitaliza a primeira letra do mês
            elData.textContent = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);

            // Subtexto: nome do indicador mais recente (truncado)
            const titulo = latest.titulo || 'Indicador mais recente';
            elSub.textContent = titulo.length > 28 ? titulo.substring(0, 26) + '…' : titulo;
            elSub.title = titulo; // tooltip com nome completo
        } else {
            elData.textContent = '—';
            elSub.textContent = 'Sem dados';
        }
    }
}

// ==========================================================================
// 2. LOGIN PAGE LOGIC (login.html)
// ==========================================================================
function initLoginPage() {
    const loginForm = document.getElementById('form-login');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorDiv = document.getElementById('mensagem-erro');

    if (!loginForm) return;

    // Se o usuário já estiver logado, redireciona diretamente para index.html
    (async () => {
        if (!supabaseClient && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        if (supabaseClient) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                window.location.href = 'index.html';
                return;
            }
        }
    })();

    // Toggle para visualizar/ocultar senha no login
    const btnTogglePassword = document.getElementById('btn-toggle-password');
    const togglePasswordIcon = document.getElementById('toggle-password-icon');

    if (btnTogglePassword && passwordInput && togglePasswordIcon) {
        btnTogglePassword.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            togglePasswordIcon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        });
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Ensure Supabase client is active
        if (!supabaseClient && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }

        if (!supabaseClient) {
            errorDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Não foi possível conectar ao serviço Supabase. Verifique sua conexão.';
            errorDiv.style.display = 'block';
            return;
        }

        // Hide previous errors and show loading state on button
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';

        const submitBtn = loginForm.querySelector('.btn-login');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Autenticando...';

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            console.log('Login bem-sucedido!', data);
            // Redireciona tanto leitor quanto admin para index.html conforme especificado nas regras
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 100);
        } catch (error) {
            console.error('Erro no login:', error);

            let msg = error.message || 'E-mail ou senha incorretos.';
            if (msg.includes('Invalid login credentials')) {
                msg = 'E-mail ou senha incorretos.';
            } else if (msg.includes('Email not confirmed')) {
                msg = 'E-mail ainda não confirmado no Supabase. Marque "Auto Confirm User" no painel.';
            }

            errorDiv.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(msg)}`;
            errorDiv.style.display = 'block';

            // Restore button
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });

    // --- Lógica: Esqueci minha senha ---
    const btnShowForgot = document.getElementById('btn-show-forgot');
    const forgotPanel = document.getElementById('forgot-password-panel');
    const btnCancelForgot = document.getElementById('btn-cancel-forgot');
    const btnSendReset = document.getElementById('btn-send-reset');
    const forgotEmailInput = document.getElementById('forgot-email');
    const forgotSuccess = document.getElementById('forgot-success');
    const forgotError = document.getElementById('forgot-error');

    // Exibe o painel de redefinição ao clicar no link
    if (btnShowForgot && forgotPanel) {
        btnShowForgot.addEventListener('click', () => {
            forgotPanel.style.display = 'block';
            forgotPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // Pré-preenche o e-mail se já digitou no campo principal
            if (forgotEmailInput && emailInput && emailInput.value) {
                forgotEmailInput.value = emailInput.value;
            }
            forgotEmailInput && forgotEmailInput.focus();
        });
    }

    // Fecha o painel
    if (btnCancelForgot && forgotPanel) {
        btnCancelForgot.addEventListener('click', () => {
            forgotPanel.style.display = 'none';
            if (forgotSuccess) forgotSuccess.style.display = 'none';
            if (forgotError) forgotError.style.display = 'none';
            if (forgotEmailInput) forgotEmailInput.value = '';
        });
    }

    // Envia o link de redefinição via Supabase
    if (btnSendReset) {
        btnSendReset.addEventListener('click', async () => {
            if (!forgotEmailInput) return;

            const email = forgotEmailInput.value.trim();
            if (!email) {
                if (forgotError) {
                    forgotError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Por favor, informe seu e-mail.';
                    forgotError.style.display = 'block';
                }
                forgotEmailInput.focus();
                return;
            }

            // Estado de carregamento
            const originalBtnHTML = btnSendReset.innerHTML;
            btnSendReset.disabled = true;
            btnSendReset.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Enviando...</span>';
            if (forgotSuccess) forgotSuccess.style.display = 'none';
            if (forgotError) forgotError.style.display = 'none';

            try {
                // URL de redirecionamento — página de redefinição no mesmo domínio
                const redirectTo = window.location.origin +
                    window.location.pathname.replace(/\/[^\/]*$/, '/reset-password.html');

                const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                    redirectTo: redirectTo
                });

                if (error) throw error;

                // Sempre exibe mensagem de sucesso (mesmo para e-mails inexistentes — por segurança)
                if (forgotSuccess) {
                    forgotSuccess.innerHTML = `
                        <i class="fa-solid fa-circle-check"></i>
                        Se este e-mail estiver cadastrado, você receberá um link de redefinição em instantes.
                        Verifique também sua caixa de spam.
                    `;
                    forgotSuccess.style.display = 'block';
                }
                if (forgotError) forgotError.style.display = 'none';
                btnSendReset.disabled = true; // Mantém desabilitado para evitar múltiplos envios
                btnSendReset.innerHTML = '<i class="fa-solid fa-check"></i> <span>Link Enviado</span>';

            } catch (err) {
                console.error('Erro ao enviar link de redefinição:', err);
                if (forgotError) {
                    forgotError.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(err.message || 'Erro ao enviar. Tente novamente.')}` ;
                    forgotError.style.display = 'block';
                }
                btnSendReset.disabled = false;
                btnSendReset.innerHTML = originalBtnHTML;
            }
        });
    }
}

// ==========================================================================
// 3. ADMIN PANEL LOGIC (admin.html)
// ==========================================================================
async function initAdminPage() {
    if (!supabaseClient && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    // 3.1 Verify active session (with brief retry for storage hydration)
    let { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (!session) {
        // Retry once in case storage is still hydrating
        await new Promise(resolve => setTimeout(resolve, 200));
        const retry = await supabaseClient.auth.getSession();
        session = retry.data?.session;
    }

    if (sessionError || !session) {
        // Not authenticated - redirect to login page immediately
        window.location.href = 'login.html';
        return;
    }

    // 3.1b Consultar perfil do usuário na tabela 'profiles' para validar o role 'admin'
    let role = null;
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profile) {
            role = profile.role;
        }
    } catch (err) {
        console.error('Erro ao consultar perfil em profiles:', err);
    }

    if (role !== 'admin') {
        alert('Acesso negado: Seu perfil não possui permissão de administrador.');
        window.location.href = 'index.html';
        return;
    }

    // Authenticated and Admin - reveal user badge and reveal admin body
    const badge = document.getElementById('user-info-badge');
    if (badge) {
        badge.innerHTML = `<i class="fa-regular fa-user"></i> ${escapeHtml(session.user.email)} <span class="role-tag">Admin</span>`;
        badge.style.display = 'inline-flex';
    }

    document.body.style.display = 'block';

    // 3.1c Logout Button
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            btnLogout.disabled = true;
            btnLogout.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Saindo...</span>';
            await supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        });
    }

    // 3.1d Abas de Navegação Admin (Indicadores vs Usuários)
    const tabBtnIndicadores = document.getElementById('tab-btn-indicadores');
    const tabBtnUsuarios = document.getElementById('tab-btn-usuarios');
    const tabIndicadores = document.getElementById('tab-indicadores');
    const tabUsuarios = document.getElementById('tab-usuarios');

    if (tabBtnIndicadores && tabBtnUsuarios) {
        tabBtnIndicadores.addEventListener('click', () => {
            tabBtnIndicadores.classList.add('active');
            tabBtnUsuarios.classList.remove('active');
            tabIndicadores.style.display = 'block';
            tabUsuarios.style.display = 'none';
        });

        tabBtnUsuarios.addEventListener('click', async () => {
            tabBtnUsuarios.classList.add('active');
            tabBtnIndicadores.classList.remove('active');
            tabUsuarios.style.display = 'block';
            tabIndicadores.style.display = 'none';
            await fetchAndRenderUsersList();
        });
    }

    // 3.1e Formulário de Cadastro de Novo Usuário (com dupla conferência de senha)
    const formUsuario = document.getElementById('form-usuario');
    const emailUsuarioInput = document.getElementById('email-usuario');
    const senhaUsuarioInput = document.getElementById('senha-usuario');
    const confirmarSenhaUsuarioInput = document.getElementById('confirmar-senha-usuario');
    const roleUsuarioSelect = document.getElementById('role-usuario');
    const msgErroUsuario = document.getElementById('mensagem-erro-usuario');
    const msgSucessoUsuario = document.getElementById('mensagem-sucesso-usuario');
    const btnCadastrarUsuario = document.getElementById('btn-cadastrar-usuario');

    if (formUsuario) {
        formUsuario.addEventListener('submit', async (e) => {
            e.preventDefault();

            msgErroUsuario.style.display = 'none';
            msgSucessoUsuario.style.display = 'none';

            const email = emailUsuarioInput.value.trim();
            const senha = senhaUsuarioInput.value;
            const confirmarSenha = confirmarSenhaUsuarioInput.value;
            const role = roleUsuarioSelect.value;

            // Dupla conferência de senha
            if (senha !== confirmarSenha) {
                msgErroUsuario.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> As senhas não coincidem. Por favor, verifique a digitação.';
                msgErroUsuario.style.display = 'block';
                return;
            }

            if (senha.length < 6) {
                msgErroUsuario.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> A senha deve ter no mínimo 6 caracteres.';
                msgErroUsuario.style.display = 'block';
                return;
            }

            // Lock submit button
            const originalBtnHTML = btnCadastrarUsuario.innerHTML;
            btnCadastrarUsuario.disabled = true;
            btnCadastrarUsuario.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Cadastrando...';

            try {
                // Instância de cliente secundário sem persistência de sessão para não deslogar o Admin
                const secondarySupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { persistSession: false }
                });

                // Cadastro no Supabase Auth
                const { data: authData, error: authError } = await secondarySupabase.auth.signUp({
                    email: email,
                    password: senha
                });

                if (authError) throw authError;

                const newUserId = authData.user ? authData.user.id : null;

                if (!newUserId) {
                    throw new Error('O Supabase não retornou a confirmação do usuário criado.');
                }

                // Gravação do perfil na tabela 'profiles' (Tenta via Admin principal e cliente secundário)
                let profileErr = null;

                const resPrimary = await supabaseClient
                    .from('profiles')
                    .upsert([{ id: newUserId, email: email, role: role }]);
                profileErr = resPrimary.error;

                if (profileErr) {
                    console.warn('Inserção via Admin client falhou, tentando via cliente secundário:', profileErr);
                    const resSecondary = await secondarySupabase
                        .from('profiles')
                        .upsert([{ id: newUserId, email: email, role: role }]);
                    profileErr = resSecondary.error;
                }

                if (profileErr) {
                    throw new Error('Conta criada no Auth, mas erro ao salvar perfil em profiles: ' + profileErr.message);
                }

                msgSucessoUsuario.innerHTML = `<i class="fa-solid fa-circle-check"></i> Usuário <strong>${escapeHtml(email)}</strong> cadastrado com sucesso como <strong>${role === 'admin' ? 'ADMINISTRADOR' : 'LEITURA'}</strong>!`;
                msgSucessoUsuario.style.display = 'block';

                formUsuario.reset();
                await fetchAndRenderUsersList();

            } catch (error) {
                console.error('Erro ao cadastrar usuário:', error);
                let msg = error.message || 'Falha ao cadastrar usuário.';
                if (msg.includes('User already registered') || msg.includes('already registered')) {
                    msg = 'Este e-mail já está cadastrado no sistema Supabase.';
                } else if (msg.includes('Password should be at least')) {
                    msg = 'A senha deve ter no mínimo 6 caracteres.';
                }
                msgErroUsuario.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(msg)}`;
                msgErroUsuario.style.display = 'block';
            } finally {
                btnCadastrarUsuario.disabled = false;
                btnCadastrarUsuario.innerHTML = originalBtnHTML;
            }
        });
    }

    // 3.1f Função para carregar e listar os usuários na tabela
    async function fetchAndRenderUsersList() {
        const listaUsuariosBody = document.getElementById('lista-usuarios');
        if (!listaUsuariosBody) return;

        listaUsuariosBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 2rem; color: #64748b;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Carregando usuários...
                </td>
            </tr>
        `;

        try {
            const { data: profiles, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .order('email', { ascending: true });

            if (error) throw error;

            if (!profiles || profiles.length === 0) {
                listaUsuariosBody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align: center; padding: 2rem; color: #64748b;">
                            Nenhum perfil cadastrado na tabela 'profiles'.
                        </td>
                    </tr>
                `;
                return;
            }

            listaUsuariosBody.innerHTML = '';
            profiles.forEach(userProfile => {
                const tr = document.createElement('tr');
                const isSelf = userProfile.id === session.user.id;
                const currentRole = userProfile.role || 'leitura';
                const roleBadgeClass = currentRole === 'admin' ? 'admin' : 'leitura';
                const roleLabel = currentRole === 'admin' ? 'Administrador' : 'Leitura';

                tr.innerHTML = `
                    <td>
                        <div style="font-weight: 600; color: #0f172a;">
                            ${escapeHtml(userProfile.email)}
                            ${isSelf ? '<small style="color: #2563eb; margin-left: 6px; font-weight: 700;">(Você)</small>' : ''}
                        </div>
                    </td>
                    <td>
                        <span class="badge-role ${roleBadgeClass}">
                            <i class="fa-solid ${currentRole === 'admin' ? 'fa-user-shield' : 'fa-book-open'}"></i>
                            ${roleLabel}
                        </span>
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-action-edit btn-toggle-role" data-id="${userProfile.id}" data-role="${currentRole}" ${isSelf ? 'disabled style="opacity: 0.5; cursor: not-allowed;" title="Sua própria conta"' : ''}>
                                <i class="fa-solid fa-user-gear"></i>
                                <span>${currentRole === 'admin' ? 'Mudar para Leitura' : 'Tornar Admin'}</span>
                            </button>
                        </div>
                    </td>
                `;

                const btnToggle = tr.querySelector('.btn-toggle-role');
                if (btnToggle && !isSelf) {
                    btnToggle.addEventListener('click', async () => {
                        const newRole = currentRole === 'admin' ? 'leitura' : 'admin';
                        if (!confirm(`Deseja alterar o perfil de "${userProfile.email}" para "${newRole.toUpperCase()}"?`)) return;

                        btnToggle.disabled = true;
                        btnToggle.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                        try {
                            const { error: updateErr } = await supabaseClient
                                .from('profiles')
                                .update({ role: newRole })
                                .eq('id', userProfile.id);

                            if (updateErr) throw updateErr;

                            await fetchAndRenderUsersList();
                        } catch (err) {
                            alert('Erro ao atualizar perfil: ' + err.message);
                            await fetchAndRenderUsersList();
                        }
                    });
                }

                listaUsuariosBody.appendChild(tr);
            });

        } catch (err) {
            console.error('Erro ao listar usuários:', err);
            listaUsuariosBody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: #ef4444; padding: 2rem;">
                        Erro ao carregar lista de usuários: ${escapeHtml(err.message)}
                    </td>
                </tr>
            `;
        }
    }

    // 3.2 Initialize Dashboard components
    const form = document.getElementById('form-indicador');
    const idInput = document.getElementById('indicador-id');
    const tituloInput = document.getElementById('titulo-indicador');
    const tagInput = document.getElementById('tag-indicador');
    const descricaoInput = document.getElementById('descricao-detalhada');
    const linkInput = document.getElementById('link-powerbi');
    const fileInput = document.getElementById('upload-imagem');
    const btnCancelar = document.getElementById('btn-cancelar');
    const btnSalvar = document.getElementById('btn-salvar');
    const listTableBody = document.getElementById('lista-indicadores');

    // Fetch and load indicators
    await fetchAndRenderAdminList();

    // File input label helper (displays selected file name)
    fileInput.addEventListener('change', () => {
        const labelText = fileInput.files.length > 0
            ? fileInput.files[0].name
            : 'Escolher arquivo de imagem...';
        document.querySelector('.file-upload-label span').textContent = labelText;
    });

    // 3.3 Form Submission: Upload & Save
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Lock form submit button
        const originalBtnHTML = btnSalvar.innerHTML;
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';

        const id = idInput.value.trim();
        const titulo = tituloInput.value.trim();
        const tag = tagInput ? tagInput.value.trim() : '';
        const descricao = descricaoInput.value.trim();
        const link = linkInput.value.trim();
        const imageFile = fileInput.files[0];

        let imageUrl = '';

        try {
            // Upload image to Supabase Storage if a file was selected
            if (imageFile) {
                const uniqueFileName = `${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;

                // Upload raw file to storage bucket
                const { data: uploadData, error: uploadError } = await supabaseClient.storage
                    .from('imagens-indicadores')
                    .upload(uniqueFileName, imageFile);

                if (uploadError) throw uploadError;

                // Get public URL
                const { data: { publicUrl } } = supabaseClient.storage
                    .from('imagens-indicadores')
                    .getPublicUrl(uniqueFileName);

                imageUrl = publicUrl;
            }

            // Create record data object
            const recordData = {
                titulo: titulo,
                tag: tag || 'Indicador',
                descricao: descricao,
                url_powerbi: link
            };

            // If an image was uploaded, include it. If updating and no image was chosen, leave the old image.
            if (imageUrl) {
                recordData.url_imagem = imageUrl;
            }

            if (id) {
                // Update mode
                const { error: updateError } = await supabaseClient
                    .from('indicadores')
                    .update(recordData)
                    .eq('id', id);

                if (updateError) throw updateError;
                alert('Indicador atualizado com sucesso!');
            } else {
                // Insert mode
                // If creating and no image uploaded, provide defaults
                if (!imageUrl) {
                    recordData.url_imagem = 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=600&auto=format&fit=crop&q=80';
                }
                const { error: insertError } = await supabaseClient
                    .from('indicadores')
                    .insert([recordData]);

                if (insertError) throw insertError;
                alert('Indicador cadastrado com sucesso!');
            }

            // Reset form and reload grid
            resetAdminForm();
            await fetchAndRenderAdminList();

        } catch (error) {
            console.error('Erro ao salvar indicador:', error);
            alert('Falha ao salvar indicador: ' + error.message);
        } finally {
            // Unlock button
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = originalBtnHTML;
        }
    });

    // 3.4 Cancel Edition Button
    btnCancelar.addEventListener('click', () => {
        resetAdminForm();
    });

    // Fetch and list items in admin table
    async function fetchAndRenderAdminList() {
        listTableBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 2rem; color: #64748b;">
                    <i class="fa-solid fa-spinner fa-spin"></i> Carregando registros...
                </td>
            </tr>
        `;

        try {
            const { data: indicadores, error } = await supabaseClient
                .from('indicadores')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            indicatorsCache = indicadores || [];

            if (indicatorsCache.length === 0) {
                listTableBody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align: center; padding: 2rem; color: #64748b;">
                            Nenhum indicador cadastrado.
                        </td>
                    </tr>
                `;
                return;
            }

            listTableBody.innerHTML = '';
            indicatorsCache.forEach(item => {
                const tr = document.createElement('tr');

                const thumbUrl = item.url_imagem || 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=100&auto=format&fit=crop&q=80';

                tr.innerHTML = `
                    <td>
                        <div class="table-thumbnail">
                            <img src="${thumbUrl}" alt="Thumb">
                        </div>
                    </td>
                    <td>
                        <div class="table-indicator-title">${escapeHtml(item.titulo)}</div>
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-action-edit" data-id="${item.id}" title="Editar Indicador">
                                <i class="fa-solid fa-pencil"></i>
                                <span>Editar</span>
                            </button>
                            <button class="btn-action-delete" data-id="${item.id}" title="Excluir Indicador">
                                <i class="fa-solid fa-trash-can"></i>
                                <span>Excluir</span>
                            </button>
                        </div>
                    </td>
                `;

                // Add event listeners to table buttons manually for safety
                tr.querySelector('.btn-action-edit').addEventListener('click', () => populateFormForEdit(item));
                tr.querySelector('.btn-action-delete').addEventListener('click', () => deleteIndicator(item.id));

                listTableBody.appendChild(tr);
            });

        } catch (error) {
            console.error('Erro ao listar indicadores na administração:', error);
            listTableBody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; color: #ef4444; padding: 2rem;">
                        Erro ao carregar lista de indicadores: ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;
        }
    }

    // Populate fields when Edit button is clicked
    function populateFormForEdit(item) {
        idInput.value = item.id;
        tituloInput.value = item.titulo;
        if (tagInput) tagInput.value = item.tag || '';
        descricaoInput.value = item.descricao;
        linkInput.value = item.url_powerbi;

        // Update label text for upload helper
        document.querySelector('.file-upload-label span').textContent = 'Substituir imagem (opcional)...';

        // Show Cancel button and modify Save button style/text
        btnCancelar.style.display = 'inline-flex';
        btnSalvar.innerHTML = '<i class="fa-solid fa-rotate"></i> <span>Atualizar Indicador</span>';
        btnSalvar.style.backgroundColor = '#2563eb';
        btnSalvar.style.backgroundImage = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
        btnSalvar.style.boxShadow = '0 4px 10px rgba(37, 99, 235, 0.2)';

        // Scroll to form on mobile viewports
        form.scrollIntoView({ behavior: 'smooth' });
    }

    // Delete indicator
    async function deleteIndicator(id) {
        if (!confirm('Deseja realmente excluir este indicador?')) return;

        try {
            const { error } = await supabaseClient
                .from('indicadores')
                .delete()
                .eq('id', id);

            if (error) throw error;

            alert('Indicador excluído com sucesso!');

            // If the deleted indicator was being edited, reset form
            if (idInput.value === id.toString() || idInput.value === id) {
                resetAdminForm();
            }

            await fetchAndRenderAdminList();
        } catch (error) {
            console.error('Erro ao excluir indicador:', error);
            alert('Falha ao excluir indicador: ' + error.message);
        }
    }

    // Reset Form
    function resetAdminForm() {
        form.reset();
        idInput.value = '';
        document.querySelector('.file-upload-label span').textContent = 'Escolher arquivo de imagem...';
        btnCancelar.style.display = 'none';

        // Restore save button style
        btnSalvar.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Salvar Indicador</span>';
        btnSalvar.style.backgroundColor = '';
        btnSalvar.style.backgroundImage = '';
        btnSalvar.style.boxShadow = '';
    }
}

// ==========================================================================
// UTILITY FUNCTIONS
// ==========================================================================
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeUrl(url) {
    if (!url) return '#';
    const trimmed = url.trim();
    // Block scripting or protocol injection
    if (trimmed.toLowerCase().startsWith('javascript:') || trimmed.toLowerCase().startsWith('data:')) {
        return '#';
    }
    return escapeHtml(trimmed);
}

// ==========================================================================
// 5. RESET PASSWORD PAGE LOGIC (reset-password.html)
// ==========================================================================
async function initResetPasswordPage() {
    if (!supabaseClient && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    const formReset = document.getElementById('form-reset-password');
    const loadingEl = document.getElementById('reset-loading');
    const invalidTokenEl = document.getElementById('reset-invalid-token');
    const resetError = document.getElementById('reset-error');
    const resetSuccess = document.getElementById('reset-success');

    // O Supabase envia o token no hash da URL (#access_token=...&type=recovery)
    // O SDK detecta automaticamente via onAuthStateChange
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            // Token válido — mostra o formulário
            if (loadingEl) loadingEl.style.display = 'none';
            if (formReset) formReset.style.display = 'block';
        } else if (event === 'SIGNED_IN' && session) {
            // Já logado mas sem recovery — oculta loading se ainda visível
            if (loadingEl) loadingEl.style.display = 'none';
        }
    });

    // Aguarda 3s para o SDK processar o hash. Se não houver evento, mostra token inválido.
    setTimeout(() => {
        if (loadingEl && loadingEl.style.display !== 'none') {
            loadingEl.style.display = 'none';
            if (invalidTokenEl) invalidTokenEl.style.display = 'block';
        }
    }, 3000);

    // Toggle visualizar/ocultar nova senha
    const btnToggleNew = document.getElementById('btn-toggle-new-password');
    const iconToggleNew = document.getElementById('toggle-new-password-icon');
    const newPasswordInput = document.getElementById('new-password');

    if (btnToggleNew && newPasswordInput && iconToggleNew) {
        btnToggleNew.addEventListener('click', () => {
            const isPassword = newPasswordInput.type === 'password';
            newPasswordInput.type = isPassword ? 'text' : 'password';
            iconToggleNew.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        });
    }

    // Toggle visualizar/ocultar confirmação de senha
    const btnToggleConfirm = document.getElementById('btn-toggle-confirm-password');
    const iconToggleConfirm = document.getElementById('toggle-confirm-password-icon');
    const confirmPasswordInput = document.getElementById('confirm-password');

    if (btnToggleConfirm && confirmPasswordInput && iconToggleConfirm) {
        btnToggleConfirm.addEventListener('click', () => {
            const isPassword = confirmPasswordInput.type === 'password';
            confirmPasswordInput.type = isPassword ? 'text' : 'password';
            iconToggleConfirm.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        });
    }

    // Submissão do formulário de nova senha
    if (formReset) {
        formReset.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (resetError) resetError.style.display = 'none';
            if (resetSuccess) resetSuccess.style.display = 'none';

            const newPassword = newPasswordInput ? newPasswordInput.value : '';
            const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

            // Validação de tamanho mínimo
            if (newPassword.length < 6) {
                if (resetError) {
                    resetError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> A senha deve ter no mínimo 6 caracteres.';
                    resetError.style.display = 'block';
                }
                return;
            }

            // Validação de confirmação
            if (newPassword !== confirmPassword) {
                if (resetError) {
                    resetError.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> As senhas não coincidem. Verifique e tente novamente.';
                    resetError.style.display = 'block';
                }
                return;
            }

            // Estado de carregamento
            const btnSave = document.getElementById('btn-save-password');
            const originalBtnHTML = btnSave ? btnSave.innerHTML : '';
            if (btnSave) {
                btnSave.disabled = true;
                btnSave.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Salvando...</span>';
            }

            try {
                const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

                if (error) throw error;

                // Sucesso!
                if (resetSuccess) {
                    resetSuccess.innerHTML = `
                        <i class="fa-solid fa-circle-check"></i>
                        Senha alterada com sucesso! Redirecionando para o login...
                    `;
                    resetSuccess.style.display = 'block';
                }
                if (formReset) formReset.style.display = 'none';

                // Desloga e redireciona para login após 2.5s
                setTimeout(async () => {
                    await supabaseClient.auth.signOut();
                    window.location.href = 'login.html';
                }, 2500);

            } catch (err) {
                console.error('Erro ao atualizar senha:', err);
                if (resetError) {
                    resetError.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(err.message || 'Falha ao salvar a nova senha. Tente novamente.')}`;
                    resetError.style.display = 'block';
                }
                if (btnSave) {
                    btnSave.disabled = false;
                    btnSave.innerHTML = originalBtnHTML;
                }
            }
        });
    }
}
