import { dom } from './domRefs.js';
import { showToast } from './utils.js';

export function toggleManagerSidebar() {
    console.log("toggleManagerSidebar: Alternando sidebar do gerente.");
    if (!dom.manager || !dom.manager.sidebar || !dom.manager.overlay) {
        console.error("Elementos da sidebar do gerente ou overlay não encontrados.");
        return;
    }
    dom.manager.sidebar.classList.toggle('open');
    dom.manager.overlay.classList.toggle('active');
    document.body.classList.toggle('overflow-hidden', dom.manager.sidebar.classList.contains('open'));
}

export function filterManagerOrdersTable() {
    console.log("filterManagerOrdersTable: Filtrando tabela de pedidos.");
    if (!dom.manager || !dom.manager.filterSearchAll) {
        console.error("Elemento dom.manager.filterSearchAll não encontrado.");
        return;
    }
    const searchTerm = dom.manager.filterSearchAll.value.toLowerCase();

const rows = dom.manager.ordersTableBody.getElementsByTagName('tr');
    Array.from(rows).forEach(row => {
        const orderText = row.textContent || row.innerText;
        const searchString = [
            String(order.orderNumber),
            order.customer?.name || '',
            order.status || '',
            order.createdBy?.name || '',
            order.settledBy?.name || ''
        ].join(' ').toLowerCase();

row.style.display = orderText.toLowerCase().includes(searchTerm) ? '' : 'none';
    });
}

/**
 * Preenche imagens para os produtos do manager usando imagens públicas do Unsplash (keywords baseadas no nome do produto).
 * Só altera imagens que estejam no placeholder atual (logo-icekiss.png) a menos que force=true.
 * @param {boolean} force se true, sobrescreve qualquer imagem existente
 */
export function fillProductImagesFromWeb(force = false) {
    if (!dom.manager || !dom.manager.managerProductsList) {
        console.error('fillProductImagesFromWeb: managerProductsList não encontrado.');
        showToast('Não foi possível localizar a lista de produtos.', 'error');
        return;
    }

    const rows = Array.from(dom.manager.managerProductsList.querySelectorAll('.product-config-row-wrapper'));
    if (rows.length === 0) {
        showToast('Nenhuma linha de produto encontrada para preencher imagens.', 'warning');
        return;
    }

    let updated = 0;
    rows.forEach((row, idx) => {
        const nameInput = row.querySelector('[data-field="name"]');
        const imgEl = row.querySelector('img');
        const productName = (nameInput && nameInput.value) ? nameInput.value.trim() : '';
        const placeholderMatch = imgEl && imgEl.src && imgEl.src.includes('logo-icekiss');
        if (!imgEl) return;
        if (!force && !placeholderMatch) return; // pula se já tem imagem custom

        // escolher keyword: nome curto ou 'food'
        const keyword = productName ? productName.split(/\s+/)[0] : 'food';
        // Unsplash featured endpoint por keyword
        const url = `https://source.unsplash.com/collection/1424340/400x400?${encodeURIComponent(keyword)}`;

        // aplica uma pequena transição visual
        imgEl.style.opacity = '0.4';
        imgEl.style.transition = 'opacity 300ms ease';
        // força recarregar com parâmetro único (unsplash normalmente retorna imagem aleatória por request)
        imgEl.src = url + `&sig=${Date.now()}_${idx}`;
        imgEl.onload = () => {
            imgEl.style.opacity = '1';
        };
        updated++;
    });

    showToast(`Imagens preenchidas: ${updated}` , updated ? 'success' : 'info');
}

/**
 * Insere um botão flutuante no painel de produtos para acionar preenchimento automático de imagens.
 * Se o botão já existir, não cria outro.
 */
export function addAutoFillImagesButton() {
    if (!dom.manager || !dom.manager.managerProductsList) return;
    const container = dom.manager.managerProductsList.parentElement || dom.manager.managerProductsList;
    if (!container) return;
    if (container.querySelector && container.querySelector('.auto-fill-images-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'auto-fill-images-btn bg-purple-600 text-white px-3 py-2 rounded shadow-md';
    btn.style.position = 'absolute';
    btn.style.right = '24px';
    btn.style.top = '12px';
    btn.textContent = 'Preencher Imagens';
    btn.title = 'Buscar imagens sugestivas na web e preencher o campo Imagem (apenas placeholders)';
    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Carregando...';
        setTimeout(() => {
            try {
                fillProductImagesFromWeb(false);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Preencher Imagens';
            }
        }, 50);
    });

    // parent pode ter position:relative; se não, ajustamos no body
    const parent = container;
    parent.style.position = parent.style.position || 'relative';
    parent.appendChild(btn);
}

// Tenta adicionar o botão automaticamente quando o script for carregado
try { addAutoFillImagesButton(); } catch (e) { /* não crítico */ }

