import { writeBatch, doc, getDoc, collection as firestoreCollection } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { parseCurrency, formatCurrency, showToast } from './utils.js';
import { productsConfig, categoryConfig, setCategoryConfig, currentUser } from './app.js';
import { serverTimestamp, logActivity } from './firebaseService.js';

import { renderProducts as pdvRenderProducts } from './pdv.js';

export async function saveManagerConfig() {
    console.log("saveManagerConfig: Iniciando salvamento do cardápio.");
    const saveBtn = document.querySelector('#manager-save-overload-btn') || document.querySelector('[data-save-products]') || document.getElementById('manager-save-overload-btn');
    const actualSaveBtn = document.querySelector && document.querySelector('#manager-save-overload-btn') ? document.querySelector('#manager-save-overload-btn') : (saveBtn || null);
    const btn = document.getElementById('manager-save-overload-btn') || document.querySelector('.save-products-btn') || document.getElementById('manager-save-products-btn');
    const saveButton = document.getElementById('manager-save-products-btn') || document.getElementById('manager-save-overload-btn') || document.querySelector('.save-products-btn');

    const targetSaveBtn = saveButton || (typeof window !== 'undefined' ? document.querySelector('#manager-save-overload-btn') : null);
    if (!targetSaveBtn) {
        console.warn('saveManagerConfig: botão de salvar não encontrado no DOM; operação cancelada.');
        return;
    }

    targetSaveBtn.disabled = true;
    targetSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Salvando...';

    const batch = writeBatch(db);
    const productRows = document.querySelectorAll('#manager-products-list .product-config-row-wrapper');
    const activeTab = document.querySelector('.manager-cardapio-tab.active-tab-manager');
    const activeCategory = activeTab ? activeTab.dataset.category : null;

    if (!activeCategory) {
        showToast("Erro: Categoria ativa não encontrada.", "error");
        targetSaveBtn.disabled = false;
        targetSaveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Salvar Todas as Alterações';
        return;
    }

    const newItemsForOldSystem = [];

    const promises = Array.from(productRows).map(async (row) => {
        const id = row.dataset.productId;
        const isActive = row.dataset.active === 'true';
        const name = row.querySelector('[data-field="name"]').value.trim();
        const position = parseInt(row.querySelector('[data-field="position"]').value, 10);
        const priceString = row.querySelector('[data-field="price-unico"]')?.value || '';
        const costString = row.querySelector('[data-field="cost"]')?.value || '';
        const costPercentString = row.querySelector('[data-field="cost-percent"]')?.value;
        const price = parseCurrency(priceString);
        let cost = parseCurrency(costString);
        const costPercent = (typeof costPercentString !== 'undefined' && costPercentString !== null && costPercentString !== '') ? Number(String(costPercentString).replace(',', '.')) : null;
        if ((isNaN(cost) || cost === 0) && !isNaN(costPercent) && !isNaN(price) && price > 0) {
            cost = +(price * (costPercent / 100));
        }
        const stock = parseInt(row.querySelector('[data-field="stock"]').value, 10);
        const category = row.dataset.category;

        if (!name || isNaN(price) || isNaN(cost)) {
            console.warn(`Linha de produto inválida (nome, preço ou custo) ignorada: ID ${id}. Pulando.`);
            return;
        }

        newItemsForOldSystem.push({
            id,
            name,
            price,
            cost,
            costPercent: isNaN(costPercent) ? null : costPercent,
            category,
            position: isNaN(position) ? null : position,
            isActive
        });

        const productRef = doc(db, "products", id);
        const productSnap = await getDoc(productRef);

        const productData = {
            name,
            price,
            cost,
            costPercent: isNaN(costPercent) ? null : costPercent,
            position: isNaN(position) ? null : position,
            stock: isNaN(stock) ? 0 : stock,
            category,
            isActive
        };

        if (productSnap.exists()) {
            const oldData = productSnap.data();
            const hasPriceChanged = oldData.price !== price;
            const hasCostChanged = (oldData.cost || 0) !== cost;
            if (hasPriceChanged || hasCostChanged) {
                const historyRef = doc(firestoreCollection(db, `products/${id}/priceHistory`));
                const historyData = {
                    newPrice: price,
                    oldPrice: oldData.price ?? null,
                    newCost: cost,
                    oldCost: oldData.cost ?? null,
                    newCostPercent: isNaN(costPercent) ? null : costPercent,
                    timestamp: serverTimestamp(),
                    changedBy: currentUser.name
                };
                batch.set(historyRef, historyData);
            }
            batch.update(productRef, productData);
        } else {
            batch.set(productRef, { ...productData, createdAt: serverTimestamp() });
            const historyRef = doc(firestoreCollection(db, `products/${id}/priceHistory`));
            const historyData = {
                newPrice: price,
                oldPrice: null,
                newCost: cost,
                oldCost: null,
                newCostPercent: isNaN(costPercent) ? null : costPercent,
                oldCostPercent: null,
                timestamp: serverTimestamp(),
                changedBy: currentUser.name,
                reason: 'Criação do Produto'
            };
            batch.set(historyRef, historyData);
        }
    });

    try {
        await Promise.all(promises);
        const configDocRef = doc(db, "config", "main");
        const configSnap = await getDoc(configDocRef);
        if (configSnap.exists()) {
            const configData = configSnap.data();
            const updatedProductsArray = Array.isArray(configData.products) ? [...configData.products] : [];
            const categoryIndex = updatedProductsArray.findIndex(cat => cat.id === activeCategory);
            if (categoryIndex > -1) {
                updatedProductsArray[categoryIndex].items = newItemsForOldSystem;
            } else {
                updatedProductsArray.push({ id: activeCategory, items: newItemsForOldSystem });
            }
            batch.update(configDocRef, { products: updatedProductsArray });
        }
        await batch.commit();
        await logActivity(currentUser.name, 'Salvou Cardápio', { categoria: activeCategory });
        showToast("Cardápio salvo com sucesso!", "success");
        const { loadConfig } = await import('./app.js');
        await loadConfig();
        renderManagerCardapioTabs();
        switchManagerCardapioTab(activeCategory);
    } catch (error) {
        console.error("saveManagerConfig: Erro ao salvar cardápio em lote:", error);
        showToast("Falha ao salvar o cardápio. Verifique o console.", "error");
    } finally {
        targetSaveBtn.disabled = false;
        targetSaveBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Salvar Todas as Alterações';
    }
}

export function openCategoryManager() {
    const modal = document.getElementById('category-manager-modal');
    const list = document.getElementById('category-list-manager');
    if (!modal || !list) return;
    list.innerHTML = '';
    const addBtnContainer = document.getElementById('category-manager-add-btn-container');
    if (addBtnContainer) addBtnContainer.remove();
    const addContainer = document.createElement('div');
    addContainer.id = 'category-manager-add-btn-container';
    addContainer.className = 'mb-4 flex justify-end';
    addContainer.innerHTML = `<button id="category-manager-add-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Adicionar Categoria</button>`;
    modal.querySelector('.surface-card')?.prepend(addContainer);
    setTimeout(() => {
        const addBtn = document.getElementById('category-manager-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.preventDefault();
                let newIdBase = 'custom_' + Date.now();
                let newId = newIdBase;
                let i = 1;
                while (categoryConfig.find(c => c.id === newId)) {
                    newId = `${newIdBase}_${i++}`;
                }
                const li = document.createElement('li');
                li.className = 'flex items-center gap-3 p-3 surface-alt rounded-lg shadow-sm cursor-grab';
                li.draggable = true;
                li.dataset.categoryId = newId;
                li.innerHTML = `
                    <i class="fas fa-grip-vertical text-gray-400"></i>
                    <input type="text" value="Nova Categoria" class="input-themed flex-grow p-2 rounded-md" placeholder="Nome da Categoria">
                    <label class="flex items-center cursor-pointer">
                        <span class="mr-2 text-sm font-medium text-color-secondary">Visível</span>
                        <div class="relative">
                            <input type="checkbox" class="sr-only category-visibility-toggle" checked>
                            <div class="block bg-gray-600 w-14 h-8 rounded-full"></div>
                            <div class="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
                        </div>
                    </label>
                    <button class="ml-2 bg-red-500 text-white px-3 py-1 rounded remove-category-btn" title="Remover Categoria">Remover</button>
                `;
                list.appendChild(li);
            });
        }
    }, 0);
    categoryConfig.forEach(cat => {
        const li = document.createElement('li');
        li.className = 'flex items-center gap-3 p-3 surface-alt rounded-lg shadow-sm cursor-grab';
        li.draggable = true;
        li.dataset.categoryId = cat.id;
        li.innerHTML = `
            <i class="fas fa-grip-vertical text-gray-400"></i>
            <input type="text" value="${cat.name}" class="input-themed flex-grow p-2 rounded-md" placeholder="Nome da Categoria">
            <label class="flex items-center cursor-pointer">
                <span class="mr-2 text-sm font-medium text-color-secondary">Visível</span>
                <div class="relative">
                    <input type="checkbox" class="sr-only category-visibility-toggle" ${cat.visible ? 'checked' : ''}>
                    <div class="block bg-gray-600 w-14 h-8 rounded-full"></div>
                    <div class="dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition"></div>
                </div>
            </label>
            <button class="ml-2 bg-red-500 text-white px-3 py-1 rounded remove-category-btn" title="Remover Categoria">Remover</button>
        `;
        list.appendChild(li);
    });
    list.addEventListener('dragstart', e => { window._draggedItem = e.target.closest('li'); setTimeout(() => { if (window._draggedItem) window._draggedItem.classList.add('opacity-50'); }, 0); });
    list.addEventListener('dragend', () => { if (window._draggedItem) window._draggedItem.classList.remove('opacity-50'); window._draggedItem = null; });
    list.addEventListener('dragover', e => { e.preventDefault(); const afterElement = getDragAfterElement(list, e.clientY); if (window._draggedItem) { if (afterElement == null) list.appendChild(window._draggedItem); else list.insertBefore(window._draggedItem, afterElement); } });
    list.addEventListener('click', (e) => { const removeBtn = e.target.closest('.remove-category-btn'); if (removeBtn) { const li = removeBtn.closest('li'); if (!li) return; const catId = li.dataset.categoryId; const confirmed = confirm('Remover esta categoria? Isto não removerá produtos do banco de dados, apenas ocultará a categoria da interface.'); if (confirmed) li.remove(); } });
    modal.classList.add('active');
}

export function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.opacity-50)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

export async function saveCategoryConfig() {
    const list = document.getElementById('category-list-manager');
    const newConfig = [];
    list.querySelectorAll('li').forEach((li, index) => {
        const id = li.dataset.categoryId;
        const nameInput = li.querySelector('input[type="text"]');
        const visibleInput = li.querySelector('.category-visibility-toggle');
        if (id && nameInput && visibleInput) {
            const name = nameInput.value.trim();
            const visible = visibleInput.checked;
            if (name) newConfig.push({ id, name, order: index, visible });
        }
    });
    setCategoryConfig(newConfig);
    try { categoryConfig.sort((a, b) => (a.order || 0) - (b.order || 0)); } catch (e) { console.warn('Erro ao ordenar categoryConfig:', e); }
    renderManagerCardapioTabs();
    const firstVisibleCategory = categoryConfig.find(c => c.visible);
    if (firstVisibleCategory) switchManagerCardapioTab(firstVisibleCategory.id); else document.getElementById('manager-products-list').innerHTML = '<div class="text-center p-8 text-gray-500">Nenhuma categoria visível. Gerencie as categorias para exibir produtos.</div>';
    document.getElementById('category-manager-modal').classList.remove('active');
    showToast("Configuração de categorias salva com sucesso!", "success");
    try { const pdv = await import('./pdv.js'); if (pdv && typeof pdv.renderProducts === 'function') pdv.renderProducts(); } catch (e) { console.warn('Não foi possível atualizar o PDV automaticamente:', e); }
}

export function loadManagerCardapio(category) {
    console.log("loadManagerCardapio: Carregando cardápio para categoria:", category);
    const listEl = document.getElementById('manager-products-list');
    if (!listEl) { 
        console.error("Elemento 'manager-products-list' não encontrado."); 
        return; 
    }
    listEl.innerHTML = ''; // Limpa a lista antes de adicionar novos itens

    const productsToRender = productsConfig[category] || [];
    
    if (productsToRender.length === 0) {
        listEl.innerHTML = `<div class="text-center p-8 text-gray-500">Nenhum produto nesta categoria. Clique em "Adicionar Produto" para começar.</div>`;
    } else {
        const fragment = document.createDocumentFragment();
        productsToRender.forEach(p => {
            const productRow = createProductConfigRow(p, category);
            if (productRow) {
                fragment.appendChild(productRow);
            }
        });
        listEl.appendChild(fragment);
    }
    console.log("loadManagerCardapio: Renderização concluída para a categoria:", category);
}

/**
 * CRIA A LINHA DE PRODUTO COM LAYOUT PROFISSIONAL E RESPONSIVO
 * Atende a todos os requisitos da checklist.
 * @param {object} product O objeto do produto.
 * @param {string} category A categoria do produto.
 * @returns {HTMLElement} O elemento da linha do produto pronto.
 */
export function createProductConfigRow(product, category) {
    // 1. Cria o elemento container da linha
    const row = document.createElement('div');
    row.className = `product-config-row-wrapper`; // Wrapper para cada linha completa
    const productId = product.id || "prod_" + Date.now();
    row.dataset.productId = productId;
    row.dataset.category = category;

    const isActive = product.isActive !== false;
    row.dataset.active = isActive;

    // Define classes de destaque para estoque baixo/zerado
    let stockClass = '';
    if (typeof product.stock === 'number') {
        if (product.stock <= 0) stockClass = 'bg-red-50 border-l-4 border-red-300';
        else if (product.stock > 0 && product.stock <= 5) stockClass = 'bg-yellow-50 border-l-4 border-yellow-300';
    }
    const inactiveClass = !isActive ? 'product-inactive opacity-60' : '';

    // Formata valores para os inputs
    const priceValue = Number(product.price) || 0;
    const costValue = Number(product.cost) || 0;
    const priceStringForInput = priceValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
    const costStringForInput = costValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
    const stockValue = typeof product.stock === 'number' ? product.stock : '';
    const costPercentValue = (product.costPercent ?? Math.round(((costValue) / (priceValue || 1)) * 100)) || 60;


    // 2. ✨ TEMPLATE HTML COM COLUNAS, LABELS E IMAGEM ✨
    const imageUrl = product.image || product.imageUrl || './images/logo-icekiss.png';
    row.innerHTML = `
        <div class="product-config-row rounded-lg shadow-sm bg-white ${stockClass} ${inactiveClass} border-b hover:bg-gray-50 transition-colors duration-200" style="display:flex; align-items:center; width:100%; box-sizing:border-box;">
            <!-- Coluna: Imagem -->
            <div class="w-28 p-3 border-r flex flex-col items-center gap-2">
                <img src="${imageUrl}" alt="${(product.name||'Produto')}" class="w-20 h-20 object-cover rounded-md border bg-gray-100">
                <div class="flex gap-2">
                    <button class="text-xs px-2 py-1 bg-white border rounded shadow-sm change-image-btn" title="Alterar Imagem">Alterar</button>
                    <button class="text-xs px-2 py-1 bg-white border rounded shadow-sm remove-image-btn" title="Remover">Remover</button>
                </div>
            </div>

            <!-- Coluna: Posição -->
            <div class="w-20 p-3 border-r flex flex-col items-center min-w-0">
                <label class="text-sm text-gray-500 mb-1">Ordem</label>
                <input type="number" value="${product.position || ''}" placeholder="Ordem" class="p-3 border rounded text-center text-base h-10" data-field="position" style="width:64px;">
            </div>

            <!-- Coluna: Nome do Produto (expande) -->
            <div style="flex:1 1 70%; min-width:0; padding:16px; border-right:1px solid rgba(0,0,0,0.04); display:flex; flex-direction:column;">
                <label class="text-sm text-gray-500 mb-1">Nome</label>
                <input type="text" value="${product.name}" placeholder="Nome do Produto" class="w-full p-3 border rounded text-base truncate h-10" data-field="name" style="font-size:14px;">
            </div>

            <!-- Coluna: Preço -->
            <div style="flex:0 0 140px; padding:12px; border-right:1px solid rgba(0,0,0,0.04); display:flex; flex-direction:column; align-items:flex-end;">
                <label class="text-sm text-gray-500 mb-1">Preço (R$)</label>
                <input type="text" value="${priceStringForInput}" placeholder="0,00" class="w-full p-3 border rounded text-right text-base h-10" data-field="price-unico" inputmode="decimal">
            </div>

            <!-- Coluna: Estoque -->
            <div style="flex:0 0 110px; padding:12px; border-right:1px solid rgba(0,0,0,0.04); display:flex; flex-direction:column; align-items:flex-end;">
                <label class="text-sm text-gray-500 mb-1">Estoque</label>
                <input type="number" value="${stockValue}" placeholder="Estoque" class="w-full p-3 border rounded text-right text-base h-10" data-field="stock">
            </div>

            <!-- Coluna: Custo (%) -->
            <div style="flex:0 0 90px; padding:12px; border-right:1px solid rgba(0,0,0,0.04); display:flex; flex-direction:column; align-items:center;">
                <label class="text-sm text-gray-500 mb-1">Custo %</label>
                <input type="number" min="0" max="100" step="1" value="${costPercentValue}" class="w-full p-3 border rounded text-center text-base h-10" data-field="cost-percent"> 
            </div>

            <!-- Coluna: Custo (R$) -->
            <div style="flex:0 0 140px; padding:12px; border-right:1px solid rgba(0,0,0,0.04); display:flex; flex-direction:column; align-items:flex-end;">
                <label class="text-sm text-gray-500 mb-1">Custo (R$)</label>
                <input type="text" value="${costStringForInput}" placeholder="Custo" class="w-full p-3 border rounded text-right text-base h-10" data-field="cost" inputmode="decimal">
            </div>

            <!-- Coluna: Ações -->
            <div style="flex:0 0 170px; padding:12px; display:flex; align-items:center; justify-content:center;">
                <div class="flex gap-3">
                    <button class="text-blue-500 hover:text-blue-700 price-history-btn p-3 rounded bg-white border" data-product-id="${productId}" data-product-name="${product.name}" title="Histórico de Preços"><i class="fas fa-history"></i></button>
                    <button class="toggle-active-btn p-3 rounded border ${isActive ? 'bg-green-50 text-green-600' : 'bg-white text-gray-500'}" title="${isActive ? 'Desativar Produto' : 'Ativar Produto'}"><i class="fas ${isActive ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
                    <button class="text-red-500 hover:text-red-700 remove-product-btn p-3 rounded border bg-white" title="Remover Produto"><i class="fa fa-trash"></i></button>
                </div>
            </div>
        </div>
        <!-- Linha de descrição (expande toda a largura) -->
        <div class="w-full p-3">
            <label class="text-sm text-gray-500 mb-1">Descrição</label>
            <input type="text" value="${product.description || ''}" class="w-full p-3 border rounded text-base h-10" data-field="description" placeholder="Descrição (opcional)">
        </div>
    `;
    
    // 3. Lógica para sincronizar campos de custo (já estava no seu código original e foi mantida)
    try {
        const priceInput = row.querySelector('[data-field="price-unico"]');
        const percentInput = row.querySelector('[data-field="cost-percent"]');
        const costInput = row.querySelector('[data-field="cost"]');
        const defaultPercent = 60;

        const parsePercent = (v) => {
            const n = Number(String(v).replace(',', '.'));
            return isNaN(n) ? null : n;
        };

        const updateCostFromPercent = () => {
            const price = parseCurrency(priceInput.value || '0');
            const pct = parsePercent(percentInput.value);
            if (price > 0 && pct !== null) {
                const computed = +(price * (pct / 100));
                costInput.value = computed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
            }
        };

        const updatePercentFromCost = () => {
            const price = parseCurrency(priceInput.value || '0');
            const cost = parseCurrency(costInput.value || '0');
            if (price > 0) {
                const pct = (cost / price) * 100;
                percentInput.value = isFinite(pct) ? Math.round(pct) : defaultPercent;
            }
        };

        if (priceInput) priceInput.addEventListener('input', () => updateCostFromPercent());
        if (percentInput) percentInput.addEventListener('input', () => updateCostFromPercent());
        if (costInput) costInput.addEventListener('input', () => updatePercentFromCost());
    } catch (e) {
        console.warn('Não foi possível vincular eventos de custo/porcentagem na linha do produto:', e);
    }
    
    // --- Handlers de UI: alterar/remover imagem, toggle ativo, remover produto ---
    try {
        const changeImageBtn = row.querySelector('.change-image-btn');
        const removeImageBtn = row.querySelector('.remove-image-btn');
        const imgEl = row.querySelector('img');
        const removeProductBtn = row.querySelector('.remove-product-btn');
        const toggleActiveBtn = row.querySelector('.toggle-active-btn');

        if (changeImageBtn) {
            changeImageBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.addEventListener('change', (ev) => {
                    const file = ev.target.files && ev.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        if (imgEl) imgEl.src = reader.result;
                    };
                    reader.readAsDataURL(file);
                });
                fileInput.click();
            });
        }

        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (imgEl) imgEl.src = './images/logo-icekiss.png';
            });
        }

        if (removeProductBtn) {
            removeProductBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const confirmed = confirm('Remover este produto da lista local?');
                if (confirmed) row.remove();
            });
        }

        if (toggleActiveBtn) {
            toggleActiveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const currentlyActive = row.dataset.active === 'true' || row.dataset.active === true;
                row.dataset.active = !currentlyActive;
                if (row.dataset.active === 'true' || row.dataset.active === true) {
                    toggleActiveBtn.classList.remove('bg-white');
                    toggleActiveBtn.classList.add('bg-green-50', 'text-green-600');
                } else {
                    toggleActiveBtn.classList.remove('bg-green-50', 'text-green-600');
                    toggleActiveBtn.classList.add('bg-white', 'text-gray-500');
                }
            });
        }
    } catch (uiErr) {
        console.warn('Erro ao vincular handlers de UI na linha do produto:', uiErr);
    }

    return row;
}

export function renderManagerCardapioTabs() {
    const container = document.getElementById('manager-cardapio-tab-container');
    if (!container) { console.error("Container de abas do cardápio do gerente não encontrado."); return; }
    container.innerHTML = '';
    const orderedCategories = Array.isArray(categoryConfig) ? [...categoryConfig].sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
    const categoryColors = { assados: 'bg-lime-600 hover:bg-lime-700', fritos: 'bg-orange-500 hover:bg-orange-600', revenda: 'bg-teal-500 hover:bg-teal-600', outros: 'bg-slate-700 hover:bg-slate-800' };
    orderedCategories.filter(c => c.visible).forEach(cat => {
        const colorClass = categoryColors[cat.id] || 'bg-gray-500 hover:bg-gray-600';
        const button = document.createElement('button');
        button.className = `manager-cardapio-tab text-white ${colorClass}`;
        button.dataset.category = cat.id;
        button.textContent = cat.name;
        button.addEventListener('click', () => switchManagerCardapioTab(cat.id));
        container.appendChild(button);
    });
}

export function switchManagerCardapioTab(category) {
    console.log("switchManagerCardapioTab: Alternando para categoria do cardápio:", category);
    const container = document.getElementById('manager-cardapio-tab-container');
    if (!container) return;
    container.querySelectorAll('.manager-cardapio-tab').forEach(tab => tab.classList.remove('active-tab-manager'));
    const activeTab = container.querySelector(`[data-category="${category}"]`);
    if (activeTab) activeTab.classList.add('active-tab-manager');
    loadManagerCardapio(category);
}
