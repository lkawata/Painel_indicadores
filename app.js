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
});

// ==========================================================================
// 1. INDEX PAGE LOGIC (index.html)
// ==========================================================================
async function initIndexPage() {
    if (!supabaseClient && typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
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
// 2. LOGIN PAGE LOGIC (login.html)
// ==========================================================================
function initLoginPage() {
    const loginForm = document.getElementById('form-login');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorDiv = document.getElementById('mensagem-erro');

    if (!loginForm) return;

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
            // Small timeout to guarantee localStorage sync before navigation
            setTimeout(() => {
                window.location.href = 'admin.html';
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

    // Authenticated - reveal the admin body to prevent visual flashing
    document.body.style.display = 'block';

    // 3.1b Logout Button
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            btnLogout.disabled = true;
            btnLogout.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Saindo...</span>';
            await supabaseClient.auth.signOut();
            window.location.href = 'index.html';
        });
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
