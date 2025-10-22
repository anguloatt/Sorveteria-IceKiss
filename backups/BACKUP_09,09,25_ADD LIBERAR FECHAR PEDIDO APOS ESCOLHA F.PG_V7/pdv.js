
import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
import { isAppOnline, queueOrderForSync, getCachedProducts } from './offlineManager.js';

import { updateLiveSummary } from './pdv-live-summary.js';
import {
    showToast, showCustomConfirm, formatCurrency, parseCurrency,
    getTodayDateString, formatDateToBR, formatDateTimeToBR,
    formatNameToTitleCase, formatPhone, formatTime, formatInputAsCurrency,
    roundSinal, getProductInfoById,
    getSalgadosCountFromItems,
    generateTicketText, generatePrintableReminderText,
    printTicket, // Esta função agora usa generateTicketText internamente
    sendWhatsAppMessage, // Esta função agora usa generateTicketText internamente
    updateWeekdayDisplay,
    printReminderList, // Esta função agora usa generatePrintableReminderText internamente
    showTomorrowReminderModal
} from './utils.js';
import {
    currentUser, currentOrder, productsConfig, storeSettings, getNextOrderNumber, peekNextOrderNumber, employees, setCurrentUser, categoryConfig,
    managerCredentials, masterCredentials, currentReminderOrders, db
} from './app.js'; // Importa variáveis globais do app.js
import {
    saveOrder as firebaseSaveOrder, updateOrder as firebaseUpdateOrder,
    cancelOrder as firebaseCancelOrder, settleDebt as firebaseSettleDebt, logActivity,
    findOrder as firebaseFindOrder, checkForDailyDeliveries, createNotification, findLastOrder, serverTimestamp,
    findNextOrder as firebaseFindNextOrder, findPreviousOrder as firebaseFindPreviousOrder, changeEmployeePassword, findClientByPhone, findClientByName,
    updateProductStock,
    upsertClientOnOrder,
    Timestamp,
    searchClientsByName, // NOVO: Importa a função de busca por nome parcial
    fetchNextUpcomingOrder // NOVO: Importa a função para buscar o próximo pedido
} from './firebaseService.js'; // Importa funções de serviço Firebase

import { handleManagerAccess, navigateToManagerView, openInteractiveTimeSelector, calculateWindowLoad } from './manager.js';
import { ensureProductImages, productImageFallbacks } from './app.js';

import { openEmployeeReport } from './employeeReport.js';

let pdvCurrentOrder = null;
let clientLookupDebounceTimer = null;
let paymentAttentionTimer = null; // controla escalonamento visual
let paymentSuperAttentionTimer = null; // segunda fase mais agressiva
let paymentAudioEl = null;
let genericAudioEl = null; // som para eventos gerais (criar, atualizar, cancelar, liquidar)

function getSinalValue(){
    try { return parseCurrency(dom.sinal.value); } catch(e){ return 0; }
}

function hasAtLeastOneItem(){
    if(!pdvCurrentOrder) return false;
    return Array.isArray(pdvCurrentOrder.items) && pdvCurrentOrder.items.length > 0;
}

function basicFinalizeRequirementsMet(){
    const nameOk = (dom.customerName.value||'').trim().split(' ').length >= 2; // nome + sobrenome
    const phoneOk = (dom.customerPhone.value||'').replace(/\D/g,'').length >= 10; // celular com DDD
    const dateOk = !!dom.deliveryDate.value;
    const timeOk = !!dom.deliveryTime.value;
    const itemsOk = hasAtLeastOneItem();
    return nameOk && phoneOk && dateOk && timeOk && itemsOk;
}

function highlightSuperPaymentAttention(){

function playGenericSound(){
    try {
        if(!genericAudioEl){
            genericAudioEl = new Audio('sounds/notification.mp3');
            genericAudioEl.volume = 0.35;
        }
        genericAudioEl.currentTime = 0;
        genericAudioEl.play().catch(()=>{});
    } catch(e) {}
}
    const group = document.getElementById('payment-method-group');
    if(!group) return;
    group.classList.add('payment-method-attention','payment-method-super-attention');
    try { group.scrollIntoView({behavior:'smooth', block:'center'}); } catch(e) {}
    try { if(navigator.vibrate) navigator.vibrate([120,60,120]); } catch(e) {}
    try {
        if(!paymentAudioEl){
            paymentAudioEl = new Audio('sounds/notification.mp3');
            paymentAudioEl.volume = 0.35;
        }
        paymentAudioEl.currentTime = 0;
        paymentAudioEl.play().catch(()=>{});
    } catch(e) {}
}

// ===== Pagamentos =====
const PAYMENT_METHODS = ['pix','dinheiro','debito','credito'];
function getSinalMethod(){
    if(!dom.sinalMethodSelect) return '';
    const val = (dom.sinalMethodSelect.value||'').toLowerCase();
    return PAYMENT_METHODS.includes(val) ? val : '';
}
function updateSinalMethodVisibility(){ /* Mantido para compatibilidade futura; agora sempre visível */ }

export function renderProducts() {
    console.log("renderProducts: Iniciando renderização dos produtos.");

    if (!isAppOnline()) {
        console.log("MODO OFFLINE: Carregando produtos do cache local.");
        const cachedProductsArray = getCachedProducts();
        if (cachedProductsArray && cachedProductsArray.length > 0) {
            Object.keys(productsConfig).forEach(key => delete productsConfig[key]);

            cachedProductsArray.forEach(product => {
                const category = product.category || 'outros';
                if (!productsConfig[category]) {
                    productsConfig[category] = [];
                }
                productsConfig[category].push(product);
            });
            console.log("MODO OFFLINE: productsConfig populado com dados do cache:", productsConfig);
            try { ensureProductImages(); } catch(e) { console.warn('ensureProductImages offline falhou', e); }
        } else {
            showToast("Cardápio indisponível. Conecte-se à internet para carregar.", "error", 5000);
            Object.values(dom.cardapioColumns).forEach(col => col.innerHTML = '');
            return;
        }
    }

console.log("renderProducts: productsConfig atual:", productsConfig);

if (!dom.cardapioColumns || !dom.cardapioColumns.assados || !dom.cardapioColumns.fritos || !dom.cardapioColumns.revenda || !dom.cardapioColumns.extra) {
        console.error("renderProducts: Um ou mais elementos de coluna do cardápio não foram encontrados no DOM.");
        return;
    }

Object.values(dom.cardapioColumns).forEach(col => {
        if (col) {
            col.innerHTML = '';
        }
    });
    if (dom.otherProducts.manualItemsDisplay) {
        dom.otherProducts.manualItemsDisplay.innerHTML = '';
    }

if (!productsConfig || !categoryConfig) {
        console.warn("renderProducts: productsConfig não está definido. Não é possível renderizar.");
        return;
    }

    categoryConfig.forEach(cat => {
        if (!cat.visible) return; // Pula categorias ocultas.

        const columnKey = cat.id === 'outros' ? 'extra' : cat.id;
        const columnEl = dom.cardapioColumns[columnKey];
        const categoryTitleEl = columnEl?.closest('.cardapio-column')?.querySelector('.cardapio-column-header');

if (columnEl) {
            if (categoryTitleEl) {
                categoryTitleEl.textContent = cat.name; // Atualiza o título da coluna.
            }
            (productsConfig[cat.id] || []).filter(p => p.isActive !== false).forEach(p => {
                const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
                let safeImg = '';
                if (p.image) {
                    safeImg = p.image.startsWith('data:') ? p.image : encodeURI(p.image).replace(/'/g, '%27');
                }
                const imgTag = safeImg ? `<img src="${safeImg}" alt="${p.name}" class="cardapio-item-thumb" loading="lazy" data-product-id="${p.id}" onerror="window.tryNextProductImage && window.tryNextProductImage(this)">` : '';
                const itemHtml = `
                    <div class="cardapio-item ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}" data-product-id="${p.id}" data-product-category="${cat.id}" title="${outOfStock ? `${p.name} (Sem Estoque)` : p.name}">
                        <div class="cardapio-item-left">${imgTag}<span class="cardapio-item-name">${p.name}<span class="cardapio-item-price">(${formatCurrency(p.price)})</span></span></div>
                        <input type="number" min="0" value="0" class="product-quantity" ${outOfStock ? 'disabled' : ''}>
                    </div>`;
                columnEl.insertAdjacentHTML('beforeend', itemHtml);
            });
        }
    });
    console.log("renderProducts: Produtos renderizados.");
}
// Caso as imagens terminem de resolver após a primeira renderização
window.addEventListener('productImagesResolved', () => {
    try { renderProducts(); } catch(e) { console.warn('Falha ao re-renderizar após productImagesResolved', e); }
});
    // Fallback progressivo de imagens
    if (!window.tryNextProductImage) {
        window.tryNextProductImage = function(imgEl) {
            try {
                const pid = imgEl.getAttribute('data-product-id');
                if (!pid || !productImageFallbacks[pid]) { imgEl.src = 'images/logo-icekiss.jpg'; return; }
                const list = productImageFallbacks[pid];
                const current = imgEl.getAttribute('src');
                const idx = list.indexOf(current);
                const next = list[idx + 1];
                if (next) {
                    imgEl.onerror = () => window.tryNextProductImage(imgEl); // reatribui handler
                    imgEl.src = next;
                } else {
                    imgEl.onerror = null;
                    imgEl.src = 'images/logo-icekiss.jpg';
                }
            } catch(e) {
                imgEl.onerror = null;
                imgEl.src = 'images/logo-icekiss.jpg';
            }
        }
    }

function renderManualItemToDisplay(item) {
    if (!dom.otherProducts.manualItemsDisplay) {
        console.error("Elemento dom.otherProducts.manualItemsDisplay não encontrado.");
        return;
    }
    const itemHtml = `
        <div class="cardapio-item manual-item" data-manual-item-id="${item.id}">
            <span class="cardapio-item-name">${item.quantity} ${item.name}<span class="cardapio-item-price">(${formatCurrency(item.unitPrice)})</span></span>
            <button class="text-red-500 hover:text-red-700 remove-manual-item-btn" data-manual-item-id="${item.id}">
                <i class="fa fa-trash"></i>
            </button>
        </div>`;
    dom.otherProducts.manualItemsDisplay.insertAdjacentHTML('beforeend', itemHtml);

const removeBtn = dom.otherProducts.manualItemsDisplay.querySelector(`[data-manual-item-id="${item.id}"] .remove-manual-item-btn`);
    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            const itemIdToRemove = e.currentTarget.dataset.manualItemId;
            removeManualItem(itemIdToRemove);
        });
    }
}

/**
 * NOVO: Função debounced para buscar dados do cliente e exibir sugestões.
 * É acionada após o usuário parar de digitar no nome ou telefone para evitar
 * chamadas de API excessivas e o erro 429 (Too Many Requests).
 */
const debouncedClientLookup = () => {
    clearTimeout(clientLookupDebounceTimer);
    clientLookupDebounceTimer = setTimeout(async () => {
        if (document.activeElement !== dom.customerName) {
            return;
        }

const name = dom.customerName.value.trim();
        const phone = dom.customerPhone.value.trim();
        const rawPhone = phone.replace(/\D/g, '');

        if (name.length === 0) {
            clearAutocomplete();
            await displayNextUpcomingOrder();
            return;
        }

        if (name.length < 2) {
            clearAutocomplete();
            hideClientSeal();
            if (dom.pdvAiSuggestions?.container) dom.pdvAiSuggestions.container.classList.add('hidden');
            return;
        }

        if (rawPhone.length >= 10) {
            clearAutocomplete();
            const clientData = await findClientByPhone(phone);
            if (clientData) {
                if (!dom.customerName.value.trim()) {
                    dom.customerName.value = formatNameToTitleCase(clientData.name);
                }
                displayClientSeal(clientData);
                checkExpiredDebtAndAlert(clientData);
                displayLastOrderInfo(clientData); // Mostra a última compra
            } else {
                hideClientSeal();
                const clients = await searchClientsByName(name);
                renderAutocompleteSuggestions(clients);
            }
        } else {
            const clients = await searchClientsByName(name);
            renderAutocompleteSuggestions(clients);
        }
    }, 400); // Atraso de 400ms para uma resposta mais rápida.
};

function renderAutocompleteSuggestions(clients) {
    const container = document.getElementById('autocomplete-suggestions');
    if (!container) return;

if (clients.length === 0) {
        container.classList.add('hidden');
        return;
    }

container.innerHTML = clients.map(client => `
        <div class="p-3 hover:bg-blue-100 cursor-pointer border-b border-gray-100" data-client-phone="${client.phone}" data-client-name="${client.name}">
            <p class="font-semibold text-sm text-gray-800">${client.name}</p>
            <p class="text-xs text-gray-500">${client.phone}</p>
        </div>
    `).join('');
    container.classList.remove('hidden');
}

function clearAutocomplete() {
    const container = document.getElementById('autocomplete-suggestions');
    if (container) {
        container.innerHTML = '';
        container.classList.add('hidden');
    }
}

async function handleSuggestionClick(clientName, clientPhone) {
    clearAutocomplete();
    dom.customerName.value = clientName;
    dom.customerPhone.value = clientPhone;
    formatPhone({ target: dom.customerPhone });

const clientData = await findClientByPhone(clientPhone);
    if (clientData) {
        displayClientSeal(clientData);
        checkExpiredDebtAndAlert(clientData);
        displayLastOrderInfo(clientData);
    } else {
        hideClientSeal();
        await displayNextUpcomingOrder();
    }
}

function removeManualItem(itemId) {
    if (!pdvCurrentOrder || !pdvCurrentOrder.items) return;

pdvCurrentOrder.items = pdvCurrentOrder.items.filter(item => item.id !== itemId);

const itemElement = dom.otherProducts.manualItemsDisplay.querySelector(`[data-manual-item-id="${itemId}"]`);
    if (itemElement) {
        itemElement.remove();
    }
    calculateTotals();
    showToast("Item manual removido.", "info");
}

/**
 * NOVO: Limpa todos os itens do carrinho de uma vez.
 */
async function clearCart() {
    console.log("clearCart: Limpando o carrinho.");

const confirmed = await showCustomConfirm(
        "Limpar Carrinho",
        "Tem certeza que deseja remover todos os itens do carrinho?",
        { okButtonText: "Sim, Limpar", okButtonClass: "bg-red-600 hover:bg-red-700" }
    );

if (!confirmed) {
        console.log("clearCart: Operação cancelada pelo usuário.");
        return;
    }

    if (pdvCurrentOrder) {
        pdvCurrentOrder.items = [];
    }

    document.querySelectorAll('#pdv-cardapio-grid .product-quantity').forEach(input => {
        input.value = '0';
        input.classList.remove('bg-yellow-100', 'border-2', 'border-amber-500', 'font-bold', 'text-amber-700');
    });

    calculateTotals();

showToast("Carrinho limpo com sucesso!", "success");
    console.log("clearCart: Carrinho limpo.");
}

/**
 * Atualiza o estilo visual dos inputs de quantidade no cardápio.
 * Destaca os inputs que têm uma quantidade maior que zero.
 */
function updateQuantityInputStyles() {
    document.querySelectorAll('#pdv-cardapio-grid .product-quantity').forEach(input => {
        const quantity = parseInt(input.value, 10) || 0;
        const isHighlighted = quantity > 0;

        input.classList.toggle('bg-yellow-100', isHighlighted);
        input.classList.toggle('border-2', isHighlighted);
        input.classList.toggle('border-amber-500', isHighlighted);
        input.classList.toggle('font-bold', isHighlighted);
        input.classList.toggle('text-amber-700', isHighlighted);

        const wrapper = input.closest('.cardapio-item');
        if (wrapper) {
            wrapper.classList.toggle('cardapio-item-selected', isHighlighted);
        }
    });
}

export function calculateTotals() {
    let total = 0;
    const items = [];
    document.querySelectorAll('#pdv-cardapio-grid .cardapio-item').forEach(el => {
        const quantityInput = el.querySelector('.product-quantity');
        if (quantityInput && !quantityInput.disabled) {
            let quantity = parseInt(quantityInput.value) || 0;

if (quantity > 0) {
                const id = el.dataset.productId;
                const category = el.dataset.productCategory;
                let product = null;

if (productsConfig && productsConfig[category]) {
                    product = productsConfig[category].find(p => p.id === id);
                }

if (product) {

if (quantity > 0) { // Re-verifica a quantidade após a correção
                        const price = product.price;
                        const subtotal = parseFloat((quantity * price).toFixed(2));
                        total += subtotal;
                        items.push({
                            id,
                            name: product.name,
                            quantity,
                            unitPrice: price,
                            subtotal, // subtotal agora está arredondado
                            category: category,
                            stock: product.stock ?? null // Se product.stock for undefined ou null, usa null.
                        });
                    }
                }
            }
        }
    });
    // Atualiza estilos após recalcular
    try { updateQuantityInputStyles(); } catch(e) {}

    if (pdvCurrentOrder && pdvCurrentOrder.items) {
        pdvCurrentOrder.items.filter(item => item.isManual).forEach(item => {
            total += item.subtotal;
            items.push(item);
        });
    }

// CORREÇÃO: Arredonda todos os totais para garantir precisão e evitar erros de dívida.
    total = parseFloat(total.toFixed(2));
    const sinal = parseCurrency(dom.sinal.value);
    let restante;
    if (pdvCurrentOrder && Array.isArray(pdvCurrentOrder.payments) && pdvCurrentOrder.payments.length) {
        const totalPago = pdvCurrentOrder.payments.reduce((s,p)=> s + (p.amount||0), 0);
        restante = parseFloat((total - totalPago).toFixed(2));
    } else {
        restante = parseFloat((total - sinal).toFixed(2));
    }

    dom.totalValue.textContent = formatCurrency(total);
    dom.restanteValue.textContent = formatCurrency(restante);
    autoFitOrderSummaryValues();
    updateSinalMethodVisibility();

    const minSinalValue = parseFloat((total * 0.10).toFixed(2));
    if (dom.sinalMinimoDisplay) {
        dom.sinalMinimoDisplay.textContent = `(Mínimo ${formatCurrency(minSinalValue)})`;
    }

    updatePaymentStatus(restante, total, sinal);
    if (pdvCurrentOrder) {
        Object.assign(pdvCurrentOrder, { items, total, sinal, restante, paymentStatus: (total > 0 && restante <= 0.01) ? 'pago' : 'devedor' });
    }
    updateButtonStates();

    const timeSelectorModal = document.getElementById('interactive-time-selector-modal');
    if (timeSelectorModal && timeSelectorModal.classList.contains('active')) {
        openInteractiveTimeSelector();
    }

    updateQuantityInputStyles();

    updateLiveSummary(pdvCurrentOrder);
}

export function getItemsFromUI() {
    const items = [];
    document.querySelectorAll('#pdv-cardapio-grid .cardapio-item').forEach(el => {
        const quantityInput = el.querySelector('.product-quantity');
        if (quantityInput && !quantityInput.disabled) {
            const quantity = parseInt(quantityInput.value) || 0;
            if (quantity > 0) {
                const id = el.dataset.productId;
                const product = getProductInfoById(id); // Usa a função utilitária
                if (product) {
                    items.push({
                        id: product.id,
                        name: product.name,
                        quantity: quantity,
                        unitPrice: product.price,
                        subtotal: quantity * product.price,
                        category: product.category
                    });
                }
            }
        }
    });

    if (pdvCurrentOrder && pdvCurrentOrder.items) {
        pdvCurrentOrder.items.filter(item => item.isManual).forEach(manualItem => {
            items.push(manualItem);
        });
    }

return items;
}

export async function startNewOrder() {
    if (!isAppOnline()) {
        console.log("startNewOrder (Offline): Iniciando novo pedido local.");
        pdvCurrentOrder = {
            orderNumber: `OFF-${Date.now().toString().slice(-6)}`, // Número temporário
            customer: {},
            delivery: {},
            items: [],
            total: 0,
            sinal: 0,
            restante: 0,
            status: 'novo_offline', // Status específico para offline
            paymentStatus: 'devedor',
            createdBy: currentUser,
            createdAt: new Date().toISOString(), // Timestamp do cliente
            payments: []
        };
        clearForm();
        calculateTotals();
        if (dom.searchInput) {
            dom.searchInput.value = "OFFLINE";
        }
        updateStatusLabel('novo_offline', 'Novo Pedido (Offline)');
        if (dom.deliveryDate) {
            dom.deliveryDate.value = getTodayDateString('yyyy-mm-dd');
            updateWeekdayDisplay(dom.deliveryDate.value);
        }
        console.log("startNewOrder (Offline): Novo pedido local iniciado.");
        return;
    }

    console.log("startNewOrder: Iniciando novo pedido.");
    const nextOrderNum = await peekNextOrderNumber();

pdvCurrentOrder = {
        orderNumber: nextOrderNum,
        customer: {},
        delivery: {},
        items: [],
        total: 0,
        sinal: 0,
        restante: 0,
        status: 'novo',
        paymentStatus: 'devedor',
        createdBy: currentUser,
    createdAt: serverTimestamp(),
    payments: []
    };
    clearForm();
    // Limpa seleção visual dos botões de forma de pagamento
    try {
        const methodBtns = document.querySelectorAll('#payment-method-buttons .payment-method-btn');
        methodBtns.forEach(b=>b.classList.remove('selected'));
        if(dom.sinalMethodSelect){ dom.sinalMethodSelect.value = ''; }
    } catch(e) { console.warn('Falha ao limpar seleção métodos pagamento', e); }
    calculateTotals();
    if (dom.searchInput) {
        dom.searchInput.value = nextOrderNum;
    }
    if (dom.deliveryTime) {
        dom.deliveryTime.dispatchEvent(new Event('input', { bubbles: true }));
    }
    updateStatusLabel('novo', 'Novo Pedido');
    updateTraceabilityInfo(pdvCurrentOrder);
    if (dom.deliveryDate) {
        dom.deliveryDate.value = getTodayDateString('yyyy-mm-dd');
        updateWeekdayDisplay(dom.deliveryDate.value);
    }
    await displayNextUpcomingOrder();
    console.log("startNewOrder: Novo pedido iniciado com sucesso, exibindo o número: ", nextOrderNum);
}

export async function loadOrderIntoForm(order) {
    console.log("loadOrderIntoForm: Carregando pedido no formulário:", order.orderNumber);
    pdvCurrentOrder = order;
    clearForm();
    try {
        const methodBtns = document.querySelectorAll('#payment-method-buttons .payment-method-btn');
        methodBtns.forEach(b=>b.classList.remove('selected'));
        if(dom.sinalMethodSelect){ dom.sinalMethodSelect.value = ''; }
    } catch(e) {}
    if (dom.searchInput) {
        dom.searchInput.value = String(order.orderNumber).padStart(3, '0');
    }
    if (dom.customerName) { dom.customerName.value = order.customer?.name || ''; }
    if (dom.customerPhone) { dom.customerPhone.value = order.customer?.phone || ''; }

if (dom.deliveryDate) {
        if (order.delivery?.date) {
            const [day, month, year] = order.delivery.date.split('/');
            const formattedDateForInput = `${year}-${month}-${day}`;
            dom.deliveryDate.value = formattedDateForInput;
            updateWeekdayDisplay(formattedDateForInput);
        } else {
            dom.deliveryDate.value = '';
            if (dom.deliveryDateWeekday) {
                dom.deliveryDateWeekday.textContent = '';
            }
        }
    }
    if (dom.deliveryTime) { dom.deliveryTime.value = order.delivery?.time || ''; }
    if (dom.orderObservations) { dom.orderObservations.value = order.observations || ''; } // NOVO: Carrega as observações
    if (dom.sinal) { dom.sinal.value = formatCurrency(order.sinal || 0).replace('R$ ', ''); }
    // NÃO criar automaticamente pagamentos em pedidos antigos: apenas inicializa array vazia caso exista estrutura
    if(!pdvCurrentOrder.payments){
        pdvCurrentOrder.payments = []; // vazio; método só aparecerá quando usuário definir e salvar
    }
    if(dom.sinalMethodSelect){
        const sinalPayment = (order.payments||[]).find(p=>p.kind==='sinal');
        if(sinalPayment && PAYMENT_METHODS.includes(sinalPayment.method)){
            dom.sinalMethodSelect.value = sinalPayment.method;
            dom.sinalMethodSelect.disabled = false;
        } else {
            // Pedido antigo sem método definido: deixa select vazio e habilitado para escolha manual
            dom.sinalMethodSelect.value = '';
            dom.sinalMethodSelect.disabled = false; // permitir definir
        }
        updateSinalMethodVisibility();
    }

if (dom.otherProducts.manualItemsDisplay) {
        dom.otherProducts.manualItemsDisplay.innerHTML = '';
    }

document.querySelectorAll('#pdv-cardapio-grid .cardapio-item').forEach(el => {
        const itemInOrder = (order.items || []).find(i => i.id === el.dataset.productId && !i.isManual);
        const quantityInput = el.querySelector('.product-quantity');
        if (quantityInput) {
            quantityInput.value = itemInOrder ? itemInOrder.quantity : 0;
        }
    });

(order.items || []).filter(item => item.isManual).forEach(item => {
        renderManualItemToDisplay(item);
    });

calculateTotals();
    updateStatusLabel(order.status, order.status.charAt(0).toUpperCase() + order.status.slice(1));
    updateTraceabilityInfo(order);
    if (dom.deliveryTime) {
        dom.deliveryTime.dispatchEvent(new Event('input', { bubbles: true }));
    }

    if (order.customer?.phone) {
        const clientData = await findClientByPhone(order.customer.phone);
        if (clientData) {
            displayClientSeal(clientData);
            checkExpiredDebtAndAlert(clientData);
        } else {
            hideClientSeal();
        }
    } else {
        hideClientSeal();
    }

    displayLastOrderInfo(order);
    console.log("loadOrderIntoForm: Pedido carregado com sucesso.");
}

async function saveOrder() {
    console.log("saveOrder: Tentando finalizar pedido...");
    const sinalValor = getSinalValue();
    // Exige forma de pagamento apenas se sinal > 0
    if(sinalValor > 0 && getSinalMethod() === ''){
        const group = document.getElementById('payment-method-group');
        showToast('Forma de pagamento obrigatória.', 'error', 3500);
        if(group){
            highlightSuperPaymentAttention();
        }
        updateButtonStates();
        return;
    }
    calculateTotals();
    if (!validateForm(true)) return;

    if (!isAppOnline()) {
        await _executeOfflineSave();
        return;
    }

    const deliveryDate = dom.deliveryDate.value;
    const deliveryTime = dom.deliveryTime.value;
    const currentItems = getItemsFromUI();

const { totalLoad, existingLoad, currentLoad, limit } = await calculateWindowLoad(deliveryDate, deliveryTime, currentItems);

if (totalLoad > limit) {
        const modal = document.getElementById('overload-warning-modal');
        const messageEl = document.getElementById('overload-warning-message');
        const continueBtn = document.getElementById('overload-continue-anyway-btn');
        const changeTimeBtn = document.getElementById('overload-change-time-btn');

messageEl.innerHTML = `Ao adicionar as <strong>${currentLoad}</strong> unidades deste pedido, o total na janela de horário das <strong>${deliveryTime}</strong> será de <strong>${totalLoad}</strong> salgados, ultrapassando o limite de <strong>${limit}</strong>. <br><br>Deseja continuar mesmo assim?`;

const handleContinue = () => {
            modal.classList.remove('active');
            _executeSaveOrder(); // Chama a função de salvamento real
        };

        continueBtn.addEventListener('click', handleContinue, { once: true });

        changeTimeBtn.onclick = () => {
            modal.classList.remove('active');
            continueBtn.removeEventListener('click', handleContinue);
        };

modal.classList.add('active');
    } else {
        await _executeSaveOrder(); // Se não estiver sobrecarregado, salva diretamente
    }
}

async function _executeOfflineSave() {
    console.log("MODO OFFLINE: Executando salvamento local.");

const operatorName = dom.employeeSwitcherSelect.value;
    let operator = employees.find(e => e.name === operatorName) || { ...currentUser, id: currentUser.id || 'gerencia_user' };

const roundedSinal = roundSinal(parseCurrency(dom.sinal.value));

const deliveryDateValue = dom.deliveryDate.value;
    let deliveryDateFormatted = '';
    if (deliveryDateValue) {
        const [year, month, day] = deliveryDateValue.split('-');
        deliveryDateFormatted = `${day}/${month}/${year}`;
    }

    const orderData = {
        items: pdvCurrentOrder.items,
        total: pdvCurrentOrder.total,
        sinal: roundedSinal,
        restante: pdvCurrentOrder.total - roundedSinal,
        paymentStatus: (pdvCurrentOrder.total > 0 && (pdvCurrentOrder.total - roundedSinal) <= 0.01) ? 'pago' : 'devedor',
        status: 'pendente_sync', // Status para identificar na sincronização
        customer: { name: dom.customerName.value, phone: dom.customerPhone.value },
        delivery: { date: deliveryDateFormatted, time: dom.deliveryTime.value.trim() },
        observations: dom.orderObservations.value.trim() || null, // NOVO: Salva as observações
        createdBy: { id: operator.id, name: operator.name, role: operator.role },
        createdAt: new Date().toISOString() // Timestamp do cliente
    };

queueOrderForSync(orderData);

    await startNewOrder();
}

async function _executeSaveOrder() {
    let clientIdToUpdate = null;
    const customerName = dom.customerName.value;
    const customerPhone = dom.customerPhone.value;

const clientByName = await findClientByName(customerName);

if (clientByName && clientByName.phone && clientByName.phone !== customerPhone) {
        const confirmed = await showCustomConfirm(
            "Cliente com Nome Duplicado",
            `Já existe um cliente chamado <strong>${customerName}</strong> com o telefone <strong>${clientByName.phone}</strong>.<br><br>Deseja atualizar o telefone deste cliente para <strong>${customerPhone}</strong>?`,
            {
                okButtonText: "Sim, Atualizar Telefone",
                cancelButtonText: "Não, Cancelar",
                okButtonClass: "bg-blue-600 hover:bg-blue-700"
            }
        );

if (confirmed) {
            clientIdToUpdate = clientByName.id;
        } else {
            showToast("Operação cancelada. Por favor, ajuste o nome do cliente para diferenciá-lo do existente.", "error", 5000);
            return; // Stop save
        }
    }
    const operatorName = dom.employeeSwitcherSelect.value;
    let operator = employees.find(e => e.name === operatorName);

    if (!operator) {
        operator = {
            ...currentUser,
            id: currentUser.id || 'gerencia_user' // Garante um ID para o gerente
        };
    }
    const roundedSinal = roundSinal(parseCurrency(dom.sinal.value));
    pdvCurrentOrder.sinal = roundedSinal;
    pdvCurrentOrder.restante = pdvCurrentOrder.total - roundedSinal;
    pdvCurrentOrder.paymentStatus = (pdvCurrentOrder.total > 0 && pdvCurrentOrder.restante <= 0.01) ? 'pago' : 'devedor';

    const deliveryDateValue = dom.deliveryDate.value;
    let deliveryDateFormatted = '';
    let deliveryTimestamp = null;
    const deliveryTimeValue = dom.deliveryTime.value.trim();

if (deliveryDateValue && deliveryTimeValue) {
        const [year, month, day] = deliveryDateValue.split('-');
        deliveryDateFormatted = `${day}/${month}/${year}`;

const [hours, minutes] = deliveryTimeValue.split(':');
        if (hours && minutes) {
            const jsDate = new Date(year, month - 1, day, hours, minutes);
            deliveryTimestamp = Timestamp.fromDate(jsDate);
        }
    }

    const payments = [];
    if(pdvCurrentOrder.sinal>0){
        // Firestore não permite serverTimestamp() dentro de arrays diretamente; usar ISO string
        payments.push({kind:'sinal', method:getSinalMethod(), amount: pdvCurrentOrder.sinal, at: new Date().toISOString(), by:{ id: operator.id, name: operator.name }});
    }

    const orderData = {
        ...pdvCurrentOrder,
        orderNumber: parseInt(pdvCurrentOrder.orderNumber, 10),
        status: 'ativo',
        customer: { name: dom.customerName.value, phone: dom.customerPhone.value },
        delivery: { date: deliveryDateFormatted, time: deliveryTimeValue },
        createdBy: { id: operator.id, name: operator.name, role: operator.role },
        observations: dom.orderObservations.value.trim() || null, // NOVO: Salva as observações
        createdAt: serverTimestamp(),
        deliveryTimestamp: deliveryTimestamp, // NOVO: Adiciona o timestamp para ordenação
        payments
    };
    console.log("saveOrder: Dados do pedido a serem salvos:", orderData);
    try {
        const savedOrder = await firebaseSaveOrder(orderData);


        await upsertClientOnOrder(savedOrder, true, clientIdToUpdate);

        await createNotification(
            'new_order',
            'Novo Pedido Recebido',
            `Pedido #${savedOrder.orderNumber} para ${savedOrder.customer.name} no valor de ${formatCurrency(savedOrder.total)}.`,
            { orderId: savedOrder.id } // Adiciona o ID do pedido ao contexto
        );

        const orderForDisplay = { ...savedOrder, createdAt: new Date() };
        pdvCurrentOrder = orderForDisplay;
        showTicketModal(orderForDisplay);
        startNewOrder();
        console.log("saveOrder: Pedido finalizado com sucesso.");
    } catch (error) {
        console.error("saveOrder: Erro ao finalizar pedido:", error);
        if (error.message && error.message.includes("Estoque insuficiente")) {
            showToast(error.message, "error", 5000); // Mostra a mensagem de erro exata do sistema.
            showToast("O estoque foi atualizado. Verifique as quantidades e tente novamente.", "info", 6000);
            renderProducts(); // Re-renderiza a lista de produtos para mostrar o estoque atualizado (desabilitando itens sem estoque).
        } else {
            showToast("Ocorreu um erro inesperado ao salvar o pedido.", "error");
        }
    }
}

async function updateOrder() {
    console.log("updateOrder: Tentando atualizar pedido...");
    if (!pdvCurrentOrder || !pdvCurrentOrder.id) {
        return showToast("Nenhum pedido carregado para atualizar.", "error");
    }

calculateTotals();
    if (!validateForm(false)) return;

    const deliveryDate = dom.deliveryDate.value;
    const deliveryTime = dom.deliveryTime.value;
    const currentItems = getItemsFromUI();
    const orderId = pdvCurrentOrder.id; // ID para excluir da contagem

const { totalLoad, existingLoad, currentLoad, limit } = await calculateWindowLoad(deliveryDate, deliveryTime, currentItems, orderId);

if (totalLoad > limit) {
        const modal = document.getElementById('overload-warning-modal');
        const messageEl = document.getElementById('overload-warning-message');
        const continueBtn = document.getElementById('overload-continue-anyway-btn');
        const changeTimeBtn = document.getElementById('overload-change-time-btn');

messageEl.innerHTML = `Ao atualizar este pedido, o total na janela de horário das <strong>${deliveryTime}</strong> será de <strong>${totalLoad}</strong> salgados, ultrapassando o limite de <strong>${limit}</strong>. <br><br>Deseja continuar mesmo assim?`;

const handleContinue = () => {
            modal.classList.remove('active');
            _executeupdateOrder(); // Chama a função de atualização real
        };

continueBtn.addEventListener('click', handleContinue, { once: true });

changeTimeBtn.onclick = () => {
            modal.classList.remove('active');
            continueBtn.removeEventListener('click', handleContinue);
        };

modal.classList.add('active');
    } else {
        await _executeupdateOrder(); // Se não estiver sobrecarregado, atualiza diretamente
    }
}

async function _executeupdateOrder() {
    let clientIdToUpdate = null;
    const customerName = dom.customerName.value;
    const customerPhone = dom.customerPhone.value;

const clientByName = await findClientByName(customerName);

if (clientByName && clientByName.phone && clientByName.phone !== customerPhone) {
        const confirmed = await showCustomConfirm(
            "Cliente com Nome Duplicado",
            `Já existe um cliente chamado <strong>${customerName}</strong> com o telefone <strong>${clientByName.phone}</strong>.<br><br>Deseja atualizar o telefone deste cliente para <strong>${customerPhone}</strong>?`,
            {
                okButtonText: "Sim, Atualizar Telefone",
                cancelButtonText: "Não, Cancelar",
                okButtonClass: "bg-blue-600 hover:bg-blue-700"
            }
        );

if (confirmed) {
            clientIdToUpdate = clientByName.id;
        } else {
            showToast("Operação cancelada. Por favor, ajuste o nome do cliente para diferenciá-lo do existente.", "error", 5000);
            return; // Stop update
        }
    }
    const operatorName = dom.employeeSwitcherSelect.value;
    let operator = employees.find(e => e.name === operatorName);

    if (!operator) {
        operator = {
            ...currentUser,
            id: currentUser.id || 'gerencia_user' // Garante um ID para o gerente
        };
    }
    const roundedSinal = roundSinal(parseCurrency(dom.sinal.value));
    pdvCurrentOrder.sinal = roundedSinal;
    pdvCurrentOrder.restante = pdvCurrentOrder.total - roundedSinal;
    pdvCurrentOrder.paymentStatus = (pdvCurrentOrder.total > 0 && pdvCurrentOrder.restante <= 0.01) ? 'pago' : 'devedor';

    const deliveryDateValue = dom.deliveryDate.value;
    let deliveryDateFormatted = '';
    let deliveryTimestamp = null;
    const deliveryTimeValue = dom.deliveryTime.value.trim();

if (deliveryDateValue && deliveryTimeValue) {
        const [year, month, day] = deliveryDateValue.split('-');
        deliveryDateFormatted = `${day}/${month}/${year}`;

const [hours, minutes] = deliveryTimeValue.split(':');
        if (hours && minutes) {
            const jsDate = new Date(year, month - 1, day, hours, minutes);
            deliveryTimestamp = Timestamp.fromDate(jsDate);
        }
    }

    if(!pdvCurrentOrder.payments) pdvCurrentOrder.payments = [];
    if(pdvCurrentOrder.sinal>0){
        const existingSinal = pdvCurrentOrder.payments.find(p=>p.kind==='sinal');
        const newMethod = getSinalMethod();
        if(existingSinal){
            if(newMethod && newMethod !== existingSinal.method){
                existingSinal.method = newMethod; // atualiza método
            }
            existingSinal.amount = pdvCurrentOrder.sinal; // garante valor atualizado
        } else {
            pdvCurrentOrder.payments.push({kind:'sinal', method:newMethod||'', amount: pdvCurrentOrder.sinal, at: new Date().toISOString(), by:{ id: operator.id, name: operator.name }});
        }
    }
    const orderData = {
        ...pdvCurrentOrder,
        status: 'alterado',
        customer: { name: dom.customerName.value, phone: dom.customerPhone.value },
        delivery: { date: deliveryDateFormatted, time: deliveryTimeValue },
        updatedAt: serverTimestamp(),
        observations: dom.orderObservations.value.trim() || null, // NOVO: Salva as observações
        updatedBy: { id: operator.id, name: operator.name, role: operator.role },
        deliveryTimestamp: deliveryTimestamp // NOVO: Adiciona o timestamp para ordenação
    };

    if (pdvCurrentOrder.managerOverrideEdit) {
        orderData.managerOverrideEdit = deleteField();
    }
    console.log("updateOrder: Dados do pedido a serem atualizados:", orderData);
    try {
        await firebaseUpdateOrder(pdvCurrentOrder.id, orderData);
        await upsertClientOnOrder(orderData, false, clientIdToUpdate);
        const orderForDisplay = { ...orderData, updatedAt: new Date() };
        pdvCurrentOrder = orderForDisplay;
        updateStatusLabel('alterado', 'Pedido Alterado');
        showTicketModal(orderForDisplay);
        console.log("updateOrder: Pedido atualizado com sucesso.");
    } catch (error) {
        console.error("updateOrder: Erro ao atualizar:", error);
    }
}

async function cancelOrder() {
    console.log("cancelOrder: Tentando cancelar pedido...");
    if (!pdvCurrentOrder || !pdvCurrentOrder.id || !['ativo', 'alterado'].includes(pdvCurrentOrder.status)) {
        return showToast("Apenas pedidos ativos ou alterados podem ser cancelados.", "error");
    }
    const confirmCancel = await showCustomConfirm("Confirmar Cancelamento", `Tem certeza que deseja cancelar o pedido ${pdvCurrentOrder.orderNumber}?`);
    if (!confirmCancel) return;

try {
        await firebaseCancelOrder(pdvCurrentOrder.id, currentUser, pdvCurrentOrder.orderNumber);


        pdvCurrentOrder.status = 'cancelado';
        updateStatusLabel('cancelado', 'Cancelado');
        showToast(`Pedido ${pdvCurrentOrder.orderNumber} cancelado.`, "success"); // Mensagem ajustada
        console.log("cancelOrder: Pedido cancelado com sucesso.");
    } catch (error) {
        console.error("cancelOrder: Erro ao cancelar:", error);
        showToast("Erro ao cancelar o pedido. Verifique o console.", "error");
    }
}

async function settleDebt() {
    console.log("settleDebt: Tentando liquidar saldo...");
    if (!pdvCurrentOrder || !pdvCurrentOrder.id || pdvCurrentOrder.paymentStatus === 'pago') {
        return showToast("Este pedido já está pago ou não é válido.", "error");
    }
    const total = pdvCurrentOrder.total || 0;
    // Soma real paga (se não houver pagamento de sinal registrado no array, soma sinal manualmente)
    const hasSinalPayment = (pdvCurrentOrder.payments||[]).some(p=>p.kind==='sinal');
    const paidViaArray = (pdvCurrentOrder.payments||[]).reduce((s,p)=> s + (p.amount||0), 0);
    const alreadyPaid = hasSinalPayment ? paidViaArray : (paidViaArray + (pdvCurrentOrder.sinal||0));
    const remaining = parseFloat((total - alreadyPaid).toFixed(2));
    if(remaining <= 0){
        return showToast('Nenhum saldo em aberto para liquidar.', 'info');
    }
    const statusAtual = pdvCurrentOrder.paymentStatus === 'pago' ? 'PAGO' : 'EM ABERTO';
    const optionsHtml = PAYMENT_METHODS.map(m=>`<option value="${m}">${m.toUpperCase()}</option>`).join('');
    const dialogHtml = `
        <div class='text-sm text-left space-y-2'>
          <div><strong>Status Atual:</strong> ${statusAtual}</div>
          <div><strong>Valor Total:</strong> ${formatCurrency(total)}</div>
          <div><strong>Valor Já Pago:</strong> ${formatCurrency(alreadyPaid)}</div>
          <div><strong>Valor em Aberto:</strong> <span id='quitacao-open-amount'>${formatCurrency(remaining)}</span></div>
          <hr class='my-2'>
          <label class='block mb-1 font-semibold'>Forma da Quitação:</label>
          <select id="quitacao-method-select" class="mt-1 w-full border rounded px-2 py-1">${optionsHtml}</select>
          <hr class='my-2'>
          <div><strong>Valor a Liquidar Agora:</strong> ${formatCurrency(remaining)} (total restante)</div>
        </div>`;
    const confirmSettle = await showCustomConfirm("Liquidar Saldo", dialogHtml, { okButtonText:'Confirmar Quitação', okButtonClass:'bg-green-600 hover:bg-green-700' });
    if (!confirmSettle) return;
    const quitMethodEl = document.getElementById('quitacao-method-select');
    const quitMethod = quitMethodEl ? quitMethodEl.value : 'pix';
    // Mantém valor do sinal original; apenas quita restante
    const originalSinal = pdvCurrentOrder.sinal || 0;
    try {
    await firebaseSettleDebt(pdvCurrentOrder.id, originalSinal, currentUser, pdvCurrentOrder.orderNumber);
        await logActivity(currentUser.name, 'Liquidou Dívida (PDV)', {
            pedido: pdvCurrentOrder.orderNumber,
            cliente: pdvCurrentOrder.customer.name,
            valor: formatCurrency(pdvCurrentOrder.restante)
        });
    const previousPaid = (pdvCurrentOrder.payments||[]).reduce((s,p)=>s+p.amount,0);
    const faltaAntes = Math.max(0, pdvCurrentOrder.total - previousPaid);
    pdvCurrentOrder.paymentStatus = 'pago';
    pdvCurrentOrder.sinal = originalSinal;
    pdvCurrentOrder.restante = 0;
        pdvCurrentOrder.settledBy = { name: currentUser.name, id: currentUser.id };
        if(!pdvCurrentOrder.payments) pdvCurrentOrder.payments = [];
        const amountThis = faltaAntes; // valor realmente quitado agora
        pdvCurrentOrder.payments.push({ kind:'quitacao', method: quitMethod, amount: amountThis, at: new Date().toISOString(), by:{ id: currentUser.id, name: currentUser.name }});
        if (dom.sinal) dom.sinal.value = formatCurrency(originalSinal).replace('R$ ', '');
        // Recalcula restante baseado nos pagamentos agora
        const totalPagoAgora = pdvCurrentOrder.payments.reduce((s,p)=>s+(p.amount||0),0);
        pdvCurrentOrder.restante = parseFloat((pdvCurrentOrder.total - totalPagoAgora).toFixed(2));
        if(pdvCurrentOrder.restante <= 0.01){
            pdvCurrentOrder.restante = 0;
            pdvCurrentOrder.paymentStatus = 'pago';
        }
        try {
            await firebaseUpdateOrder(pdvCurrentOrder.id, { payments: pdvCurrentOrder.payments, restante: pdvCurrentOrder.restante, paymentStatus: pdvCurrentOrder.paymentStatus, settledBy: pdvCurrentOrder.settledBy });
        } catch(e) { console.warn('Falha ao sincronizar quitação no Firestore', e); }
        calculateTotals();
        updateTraceabilityInfo(pdvCurrentOrder);
        console.log("settleDebt: Saldo liquidado com sucesso.");
    // Abre comprovante atualizado automaticamente
    try { showTicketModal(pdvCurrentOrder); } catch(e){ console.warn('Falha ao abrir comprovante após quitação', e); }
    } catch (error) {
        console.error("settleDebt: Erro ao liquidar:", error);
    }
}

async function findOrderById() {
    console.log("findOrderById: Iniciando busca por ID.");
    if (!dom.searchInput) {
        console.error("Elemento dom.searchInput não encontrado para busca por ID.");
        return;
    }
    const orderNum = parseInt(dom.searchInput.value);
    if (isNaN(orderNum)) return showToast("Digite um número de pedido válido.", "error");
    const orderData = await firebaseFindOrder(orderNum);
    if (orderData) {
        loadOrderIntoForm(orderData);
        showToast(`Pedido ${orderData.orderNumber} carregado!`, "success");
    } else {
        showToast(`Pedido ${orderNum} não encontrado.`, "error");
    }
}

async function navigateOrder(direction) {
    console.log(`MapsOrder: Navegando pedido. Direção: ${direction}`);
    let orderData;
    const currentOrderIsNew = pdvCurrentOrder?.status === 'novo';
    const currentOrderNumber = parseInt(pdvCurrentOrder?.orderNumber, 10);

if (currentOrderIsNew) {
        if (direction === -1) { // Botão '<' (Anterior)
            orderData = await findLastOrder();
        } else { // Botão '>' (Próximo)
            showToast("Você já está em um novo pedido.", "info");
            return;
        }
    } else {
        if (direction === 1) { // Próximo
            orderData = await firebaseFindNextOrder(currentOrderNumber);
        } else { // Anterior
            orderData = await firebaseFindPreviousOrder(currentOrderNumber);
        }
    }

if (orderData) {
        loadOrderIntoForm(orderData);
        showToast(`Pedido ${orderData.orderNumber} carregado!`, "success");
    } else {
        showToast(`Não há mais pedidos ${direction > 0 ? 'posteriores' : 'anteriores'}.`, "info");
    }
}

function clearForm() {
    console.log("clearForm: Limpando formulário.");
    if (dom.customerName) { dom.customerName.value = ''; }
    if (dom.customerPhone) { dom.customerPhone.value = ''; }
    if (dom.deliveryDate) { dom.deliveryDate.value = ''; }
    if (dom.deliveryDateWeekday) { dom.deliveryDateWeekday.textContent = ''; }
    if (dom.deliveryTime) { dom.deliveryTime.value = ''; }
    if (dom.orderObservations) { dom.orderObservations.value = ''; } // NOVO: Limpa o campo de observações
    if (dom.sinal) { dom.sinal.value = '0,00'; }
    document.querySelectorAll('.product-quantity').forEach(input => input.value = '0');
    if (dom.otherProducts && dom.otherProducts.manualDesc) { dom.otherProducts.manualItemsDisplay.innerHTML = ''; }
    if (dom.otherProducts && dom.otherProducts.manualPrice) { dom.otherProducts.manualPrice.value = ''; }
    if (dom.otherProducts.manualItemsDisplay) {
        dom.otherProducts.manualItemsDisplay.innerHTML = '';
    }
    if (dom.pdvAiSuggestions?.container) {
        dom.pdvAiSuggestions.container.classList.add('hidden');
    }
    hideClientSeal();
    clearAutocomplete();
    console.log("clearForm: Formulário limpo.");
}

/**
 * NOVO: Atualiza as informações de rastreabilidade do pedido na UI.
 * Exibe quem gerou e quem liquidou o pedido.
 * @param {object} order O objeto do pedido.
 */
function updateTraceabilityInfo(order) {
    const createdByInfo = document.getElementById('created-by-info');
    const settledByInfo = document.getElementById('settled-by-info');

if (!createdByInfo || !settledByInfo) return;

    createdByInfo.classList.add('hidden');
    settledByInfo.classList.add('hidden');
    createdByInfo.textContent = '';
    settledByInfo.textContent = '';

if (order?.createdBy?.name) {
        createdByInfo.textContent = `Gerado por: ${order.createdBy.name}`;
        createdByInfo.classList.remove('hidden');
    }

if (order?.settledBy?.name) {
        settledByInfo.textContent = `Liquidado por: ${order.settledBy.name}`;
        settledByInfo.classList.remove('hidden');
    }
}

/**
 * NOVO: Limpa o campo de nome do cliente e aciona a lógica para mostrar o próximo pedido.
 */
function clearCustomerNameAndSuggest() {
    if (dom.customerName) {
        dom.customerName.value = '';
        dom.customerName.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
/**
 * Valida o nome do cliente.
 * @param {string} nameValue - O valor do campo de nome.
 * @returns {{field: HTMLElement, message: string}|null} Retorna um objeto de erro se inválido, senão null.
 */
function validateCustomerName(nameValue) {
    const nameParts = nameValue.trim().split(' ');
    if (nameParts.length < 2 || nameParts.some(part => part === '') || nameValue.trim().length < 3) {
        return { field: dom.customerName, message: "Por favor, insira o nome e sobrenome do cliente." };
    }
    return null;
}

/**
 * Valida o telefone do cliente.
 * @param {string} phoneValue - O valor do campo de telefone.
 * @returns {{field: HTMLElement, message: string}|null} Retorna um objeto de erro se inválido, senão null.
 */
function validateCustomerPhone(phoneValue) {
    const rawPhone = phoneValue.trim().replace(/\D/g, '');
    if (rawPhone.length < 10 || rawPhone.length > 11 || !phoneValue.trim().match(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)) {
        return { field: dom.customerPhone, message: "O telefone deve estar no formato (XX) XXXXX-XXXX." };
    }
    return null;
}

function validateForm(isNewOrder) {
    console.log("validateForm: Validando formulário.");
    const errors = [];
    // Limpa destaques anteriores em campos obrigatórios
    [dom.customerName, dom.customerPhone, dom.deliveryDate, dom.deliveryTime].forEach(el=> el && el.classList.remove('missing-required'));
    const fieldsToValidate = [
        dom.customerName, dom.customerPhone, dom.deliveryDate, dom.deliveryTime
    ];

// Remove a classe de erro de todos os campos antes de validar
    fieldsToValidate.forEach(field => field?.classList.remove('invalid-field'));

    const nameError = validateCustomerName(dom.customerName.value);
    if (nameError) {
        errors.push(nameError);
    }

    const phoneError = validateCustomerPhone(dom.customerPhone.value);
    if (phoneError) {
        errors.push(phoneError);
    }

    const deliveryDateValue = dom.deliveryDate.value.trim(); // "YYYY-MM-DD"
    const deliveryTimeValue = dom.deliveryTime.value.trim(); // "HH:MM"
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

if (!deliveryDateValue) {
        errors.push({ field: dom.deliveryDate, message: "A data de retirada é obrigatória." });
    }
    if (!deliveryTimeValue) {
        errors.push({ field: dom.deliveryTime, message: "A hora da retirada é obrigatória." });
    } else if (!timeRegex.test(deliveryTimeValue)) {
        errors.push({ field: dom.deliveryTime, message: "Formato de hora inválido. Use HH:MM." });
    }

    if (deliveryDateValue && deliveryTimeValue && timeRegex.test(deliveryTimeValue)) {

        const combinedStr = `${deliveryDateValue} ${deliveryTimeValue}`;

        const deliveryDateTime = dateFns.parse(combinedStr, 'yyyy-MM-dd HH:mm', new Date());

        const nowWithTolerance = dateFns.subMinutes(new Date(), 5);

        console.log("--- DEBUG DE HORÁRIO (date-fns) ---");
        console.log(`String Combinada: ${combinedStr}`);
        console.log(`Horário Escolhido (Parseado): ${deliveryDateTime.toLocaleString('pt-BR')}`);
        console.log(`Horário Atual (com tolerância de 5min): ${nowWithTolerance.toLocaleString('pt-BR')}`);
        console.log("------------------------------------");

        if (dateFns.isBefore(deliveryDateTime, nowWithTolerance)) {
            errors.push({ field: dom.deliveryTime, message: "Este horário já passou. Por favor, escolha um horário futuro." });
        }
    }

    if (!pdvCurrentOrder || pdvCurrentOrder.items.length === 0) {
        errors.push({ message: "Adicione ao menos um item ao pedido." });
    }

    if (errors.length > 0) {
        console.warn("validateForm: Erros de validação encontrados:", errors);
        errors.forEach(error => {
            if (error.field) {
                error.field.classList.add('invalid-field');
            }
        });
        showToast(errors[0].message, "error");
        if (errors[0].field) {
            errors[0].field.focus();
    playGenericSound();
    playGenericSound();
    playGenericSound();
    playGenericSound();
        }
        return false;
    }

console.log("validateForm: Formulário válido.");
    return true;
}

export function updateStatusLabel(status, text) {
    if (dom.status) {
        dom.status.className = `status-label status-${status}`;
        dom.status.textContent = text;
    }
    if (dom.searchInput) {
        dom.searchInput.className = dom.searchInput.className.replace(/input-status-\w+/g, '');
        dom.searchInput.classList.add(`input-status-${status}`);
    }
    updateButtonStates();
}

export function updateButtonStates() {
    if (!pdvCurrentOrder) return;

const isOffline = !isAppOnline();
    const isNew = pdvCurrentOrder.status === 'novo' || pdvCurrentOrder.status === 'novo_offline';
    const methodSelected = getSinalMethod() !== '';
    const sinalValor = getSinalValue();
    const isActive = ['ativo', 'alterado'].includes(pdvCurrentOrder.status);
    const isCancelled = pdvCurrentOrder.status === 'cancelado';
    const isPaid = pdvCurrentOrder.paymentStatus === 'pago';

    const baseReqMet = basicFinalizeRequirementsMet();
    // Regra nova: se sinal=0 não exige método; se sinal>0 exige método
    let finalizeDisabled;
    if(!isNew){
        finalizeDisabled = true;
    } else if(!baseReqMet){
        finalizeDisabled = true;
    } else if(sinalValor > 0 && !methodSelected){
        finalizeDisabled = true;
    } else {
        finalizeDisabled = false;
    }

    const buttonsToCheck = [
        dom.btnFechar, dom.btnAtualizar, dom.btnCancelar,
        dom.btnComprovante, dom.liquidarBtn,
        dom.btnAnterior, dom.btnProximo, dom.searchBtn
        // Botão de pagamento parcial removido
    ];

buttonsToCheck.forEach(btn => {
        if (btn) {
            let disabled = false;
            let title = '';

            if (btn === dom.btnFechar) {
                disabled = finalizeDisabled;
                if(!baseReqMet){
                    title = 'Preencha Nome, Telefone, Data, Hora e Itens';
                } else if(sinalValor > 0 && !methodSelected){
                    title = 'Selecione a forma de pagamento do sinal';
                } else {
                    title = 'Finalizar Pedido';
                }
            } else if (btn === dom.btnAtualizar) {
                disabled = !isActive || isOffline; // Desabilita se offline
                title = isOffline ? 'Função indisponível offline' : 'Atualizar Pedido';
            } else if (btn === dom.btnCancelar) {
                disabled = !isActive || isOffline; // Desabilita se offline
                title = isOffline ? 'Função indisponível offline' : 'Cancelar Pedido';
            } else if (btn === dom.btnComprovante) {
                disabled = pdvCurrentOrder.status === 'novo' || pdvCurrentOrder.status === 'novo_offline' || isCancelled;
                title = 'Gerar Comprovante';
            } else if (btn === dom.liquidarBtn) {
                disabled = !isActive || isPaid || isOffline; // Desabilita se offline
                title = isOffline ? 'Função indisponível offline' : 'Liquidar Saldo';
            } else if (btn === dom.btnAnterior || btn === dom.btnProximo || btn === dom.searchBtn) {
                disabled = isOffline;
                title = isOffline ? 'Busca de pedidos indisponível offline' : 'Navegar/Buscar Pedidos';
            }

btn.disabled = disabled;
            btn.title = title;
            btn.classList.toggle('opacity-50', disabled);
            btn.classList.toggle('cursor-not-allowed', disabled);
        }
    });
}

export function updatePaymentStatus(restante, total, sinal) {
    if (!dom.paymentStatus || !dom.liquidarBtn) {
        console.warn("Elementos de status de pagamento ou botão liquidar não encontrados.");
        return;
    }
    if (total > 0 && restante <= 0.01) {
        // Encontrar último pagamento (quitacao ou parcial) que zerou o saldo
        let methodInfo = '';
        if(pdvCurrentOrder && Array.isArray(pdvCurrentOrder.payments)){
            const paidSorted = [...pdvCurrentOrder.payments].filter(p=>['quitacao','parcial','sinal'].includes(p.kind));
            if(paidSorted.length){
                const last = paidSorted[paidSorted.length-1];
                if(last.method){ methodInfo = ` (${last.method.toUpperCase()})`; }
            }
        }
        dom.paymentStatus.textContent = "SALDO TOTAL PAGO" + methodInfo;
        dom.paymentStatus.className = "payment-status payment-pago";
        dom.liquidarBtn.innerHTML = `<i class="fa fa-check-circle mr-2"></i> Saldo Liquidado`;
    } else {
        dom.paymentStatus.textContent = "SALDO EM ABERTO";
        dom.paymentStatus.className = "payment-status payment-devedor";
        dom.liquidarBtn.innerHTML = total > 0 ? `<i class=\"fa fa-exclamation-triangle mr-2\"></i> Liquidar Saldo` : `Liquidar Saldo`;
    }
}

// Registro de Pagamento Parcial
async function registerPartialPayment(){
    if(!pdvCurrentOrder || !pdvCurrentOrder.id){
        return showToast('Nenhum pedido válido carregado.', 'error');
    }
    if(pdvCurrentOrder.paymentStatus === 'pago'){
        return showToast('Pedido já está totalmente pago.', 'info');
    }
    const restante = parseFloat((pdvCurrentOrder.restante ?? (pdvCurrentOrder.total - pdvCurrentOrder.sinal)).toFixed(2));
    if(restante <= 0.01){
        return showToast('Não há saldo em aberto.', 'info');
    }
    // Modal para valor
    const valueHtml = `<label class='block text-sm font-medium mb-1'>Valor do pagamento parcial</label><input id='partial-payment-value' type='text' value='${formatCurrency(restante).replace('R$ ','')}' class='w-full border rounded px-2 py-1 mb-3' />`+
        `<label class='block text-sm font-medium mb-1'>Forma de pagamento</label><select id='partial-payment-method' class='w-full border rounded px-2 py-1'>${PAYMENT_METHODS.map(m=>`<option value='${m}'>${m.toUpperCase()}</option>`).join('')}</select>`;
    const confirmed = await showCustomConfirm('Pagamento Parcial', valueHtml, { okButtonText:'Registrar', okButtonClass:'bg-amber-600 hover:bg-amber-700' });
    if(!confirmed) return;
    const valEl = document.getElementById('partial-payment-value');
    const methodEl = document.getElementById('partial-payment-method');
    if(!valEl || !methodEl) return;
    let valor = parseCurrency(valEl.value);
    if(isNaN(valor) || valor<=0){ return showToast('Valor inválido.', 'error'); }
    valor = parseFloat(valor.toFixed(2));
    if(valor > restante){ valor = restante; }
    const method = methodEl.value;
    if(!PAYMENT_METHODS.includes(method)) return showToast('Método inválido.', 'error');
    if(!pdvCurrentOrder.payments) pdvCurrentOrder.payments = [];
    pdvCurrentOrder.payments.push({ kind:'parcial', method, amount: valor, at: new Date().toISOString(), by:{ id: currentUser.id, name: currentUser.name }});
    // Atualiza campos financeiros
    const novoSinal = parseFloat((pdvCurrentOrder.sinal + valor).toFixed(2));
    pdvCurrentOrder.sinal = novoSinal;
    pdvCurrentOrder.restante = parseFloat((pdvCurrentOrder.total - novoSinal).toFixed(2));
    if(pdvCurrentOrder.restante <= 0.01){
        pdvCurrentOrder.paymentStatus = 'pago';
        pdvCurrentOrder.restante = 0;
    } else {
        pdvCurrentOrder.paymentStatus = 'devedor';
    }
    try{
        await firebaseUpdateOrder(pdvCurrentOrder.id, { sinal: pdvCurrentOrder.sinal, restante: pdvCurrentOrder.restante, paymentStatus: pdvCurrentOrder.paymentStatus, payments: pdvCurrentOrder.payments, updatedAt: serverTimestamp(), updatedBy:{ id: currentUser.id, name: currentUser.name }});
        showToast('Pagamento parcial registrado.', 'success');
    }catch(err){
        console.error('Erro ao registrar pagamento parcial', err);
        showToast('Erro ao registrar pagamento parcial.', 'error');
        return;
    }
    // Atualiza UI
    if(dom.sinal){ dom.sinal.value = formatCurrency(pdvCurrentOrder.sinal).replace('R$ ',''); }
    calculateTotals(); // recalcula e atualiza status
    updateTraceabilityInfo(pdvCurrentOrder);
}

export function showReminderModal(orders) {
    console.log("showReminderModal: Exibindo modal de lembrete de produção.");
    const { modal, date, summaryItems, ordersList, closeBtn, printBtn, weekdayHighlight, title } = dom.reminder;

    if (!modal || !date || !summaryItems || !ordersList || !closeBtn || !printBtn) {
        console.error("showReminderModal: Elementos essenciais do modal de lembrete não foram encontrados.");
        return;
    }

    if (weekdayHighlight && title) {
        const weekdays = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
        const today = new Date();
        weekdayHighlight.textContent = weekdays[today.getDay()];
        title.textContent = 'Lembrete de Produção (HOJE)';
    } else {
        const mainTitle = document.querySelector('#reminder-modal h2');
        if (mainTitle) mainTitle.textContent = 'Lembrete de Produção (Hoje)';
    }

currentReminderOrders.splice(0, currentReminderOrders.length, ...orders); // Atualiza a variável global no app.js

    dom.reminder.date.textContent = getTodayDateString('dd/mm/yyyy');
    const consolidatedItems = {};
    let ordersListHtml = '';
    orders.sort((a,b) => (a.delivery?.time || '99:99').localeCompare(b.delivery?.time || '99:99')).forEach(order => {
        ordersListHtml += `<div class="bg-gray-100 p-3 rounded-lg"><div class="flex justify-between items-center font-semibold"><span>Pedido ${order.orderNumber} - ${order.customer?.name}</span><span class="text-blue-600">Retirada: ${order.delivery?.time || 'N/A'}</span></div><ul class="list-disc list-inside text-sm text-gray-600 mt-1 ml-2">${(order.items || []).map(i => `<li>${i.quantity} ${i.name || getProductInfoById(i.id).name}</li>`).join('')}</ul></div>`;
        order.items.forEach(item => {
            const key = item.name || getProductInfoById(item.id).name;
            consolidatedItems[key] = (consolidatedItems[key] || 0) + item.quantity;
        });
    });
    dom.reminder.summaryItems.innerHTML = Object.entries(consolidatedItems).sort((a,b) => b[1] - a[1]).map(([name, qty]) => `<div class="flex justify-between items-center bg-white/60 p-1.5 rounded"><span class="truncate pr-2">${name}</span><span class="font-bold bg-amber-500 text-white rounded-full px-2 py-0.5">${qty}</span></div>`).join('') || '<p class="text-center col-span-full">Nenhum item para produzir hoje.</p>';
    dom.reminder.ordersList.innerHTML = ordersListHtml;
    dom.reminder.modal.classList.add('active');
    console.log("showReminderModal: Lembrete de entregas diárias exibido.");
}

/**
 * Mostra o modal do comprovante.
 * Agora usa generateTicketText para exibir texto pré-formatado no modal.
 * @param {object} order O objeto do pedido.
 */
export function showTicketModal(order) {
    console.log("showTicketModal: Exibindo modal de ticket para pedido:", order.orderNumber);
    if (!dom.ticketModal || !dom.ticketContent || !dom.ticketPrintBtn || !dom.ticketWhatsappBtn) {
        console.error("Elementos do modal de ticket não encontrados.");
        return;
    }
    if (order) {
        dom.ticketContent.textContent = generateTicketText(order);
        dom.ticketPrintBtn.onclick = null;
        dom.ticketWhatsappBtn.onclick = null;

        dom.ticketPrintBtn.onclick = () => printTicket(order);
        dom.ticketWhatsappBtn.onclick = () => sendWhatsAppMessage(order);

dom.ticketModal.classList.add('active');
    }
}

function addManualItemToOrder() {
    console.log("addManualItemToOrder: Adicionando item manual ao pedido.");
    if (!dom.otherProducts || !dom.otherProducts.manualDesc || !dom.otherProducts.manualPrice) {
        console.error("Elementos de adição manual de item não encontrados.");
        return;
    }
    const desc = dom.otherProducts.manualDesc.value.trim();
    const price = parseCurrency(dom.otherProducts.manualPrice.value);

if (!desc || price <= 0) {
        return showToast("Descrição e valor do item manual são obrigatórios.", "error");
    }

if (!pdvCurrentOrder.items) {
        pdvCurrentOrder.items = [];
    }

const newItem = {
        id: 'manual_' + Date.now(),
        name: desc,
        quantity: 1,
        unitPrice: price,
        subtotal: price,
        isManual: true,
        category: 'manual'
    };
    pdvCurrentOrder.items.push(newItem);

renderManualItemToDisplay(newItem);

dom.otherProducts.manualDesc.value = '';
    dom.otherProducts.manualPrice.value = '';
    calculateTotals();
    showToast(`Item '${desc}' adicionado.`, 'success');
    console.log("addManualItemToOrder: Item manual adicionado.");
}

async function handleEmployeePasswordChange() {
    const { modal, currentPassInput, newPassInput, confirmPassInput, saveBtn } = dom.changePasswordModal;

const currentPass = currentPassInput.value;
    const newPass = newPassInput.value;
    const confirmPass = confirmPassInput.value;

if (!currentPass || !newPass || !confirmPass) {
        return showToast("Todos os campos são obrigatórios.", "error");
    }
    if (newPass.length < 4) {
        return showToast("A nova senha deve ter no mínimo 4 caracteres.", "error");
    }
    if (newPass !== confirmPass) {
        return showToast("As senhas não coincidem.", "error");
    }
    if (!currentUser || !currentUser.id) {
        return showToast("Erro: Usuário não identificado. Faça login novamente.", "error");
    }

saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

try {
        await changeEmployeePassword(currentUser.id, currentPass, newPass);
        modal.classList.remove('active'); // Fecha o modal em caso de sucesso
    } catch (error) {
        console.error("Falha ao alterar a senha:", error);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Nova Senha';
    }
}

/**
 * NOVO: Exibe o modal com o histórico de pedidos de um cliente.
 * @param {object} clientData O objeto completo do cliente, incluindo a lista de pedidos.
 */
function showClientHistoryModal(clientData) {
    const { modal, clientName, ordersList, closeBtn } = dom.clientHistoryModal;

if (!modal || !clientName || !ordersList || !closeBtn) {
        console.error("Elementos do modal de histórico do cliente não encontrados.");
        return;
    }

clientName.textContent = clientData.name;
    ordersList.innerHTML = ''; // Limpa a lista anterior

if (clientData.orders && clientData.orders.length > 0) {
        const rowsHtml = clientData.orders.map(order => {
            const paymentStatusClass = order.paymentStatus === 'pago' ? 'text-green-600' : 'text-red-600';
            const orderStatusClass = order.status === 'cancelado' ? 'text-gray-500' : 'text-blue-600';
            const statusText = order.status.charAt(0).toUpperCase() + order.status.slice(1);

return `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-4">${order.orderNumber}</td>
                    <td class="py-2 px-4">${formatDateToBR(order.createdAt)}</td>
                    <td class="py-2 px-4 text-right">${formatCurrency(order.total)}</td>
                    <td class="py-2 px-4 text-center"><span class="font-semibold ${paymentStatusClass}">${order.paymentStatus.toUpperCase()}</span></td>
                    <td class="py-2 px-4 text-center"><span class="font-semibold ${orderStatusClass}">${statusText}</span></td>
                </tr>
            `;
        }).join('');
        ordersList.innerHTML = rowsHtml;
    } else {
        ordersList.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-gray-500">Nenhum histórico de pedido encontrado.</td></tr>`;
    }

    const closeModal = () => {
        modal.classList.remove('active');
        closeBtn.removeEventListener('click', closeModal);
    };

closeBtn.addEventListener('click', closeModal);
    modal.classList.add('active');
}

/**
 * NOVO: Exibe o selo de cliente com os dados agregados.
 * @param {object} clientData O objeto do cliente retornado pelo findClientByPhone.
 */
function displayClientSeal(clientData) {
    const { container, orderCount, paymentIcon, paymentStatus, clientSince } = dom.clientSeal;

if (!container) return;

    if (clientData.totalDebt > 0) {
        paymentIcon.className = 'fas fa-thumbs-down text-xl mb-1 text-red-500';
        paymentStatus.textContent = 'Com Saldo Pendente'; // Menos agressivo
    } else {
        paymentIcon.className = 'fas fa-thumbs-up text-xl mb-1 text-green-500';
        paymentStatus.textContent = 'Bom Pagador';
    }

    orderCount.textContent = clientData.orderCount || 0;

    let lastOrderSalgados = 0;
    if (clientData.orders && clientData.orders.length > 0 && clientData.orders[0].items) {
        const lastOrder = clientData.orders[0]; // O orders já vem ordenado do mais recente para o mais antigo
        lastOrderSalgados = getSalgadosCountFromItems(lastOrder.items || []); // Usa a função de utilitários
    }
    clientSince.textContent = `${lastOrderSalgados} Salgados`; // Atualiza o texto do selo
    clientSince.title = `Última compra: ${lastOrderSalgados} salgados`; // Adiciona um tooltip para clareza

    container.onclick = () => showClientHistoryModal(clientData);

    if (dom.pdvAiSuggestions?.container) {
        dom.pdvAiSuggestions.container.classList.add('hidden');
    }

container.classList.remove('hidden');
    if (dom.clientHistoryHeading) {
        dom.clientHistoryHeading.classList.add('hidden');
    }
}

/**
 * NOVO: Esconde o selo de cliente.
 */
function hideClientSeal() {
    const { container } = dom.clientSeal;
    if (!container) return;

container.classList.add('hidden');
    container.onclick = null;
    if (dom.clientHistoryHeading) {
        dom.clientHistoryHeading.classList.add('hidden');
    }
}

/**
 * NOVO: Mostra informações sobre a próxima entrega agendada.
 */
async function displayNextUpcomingOrder() {
    const suggestionContainer = dom.pdvAiSuggestions?.container;
    const suggestionTextEl = dom.pdvAiSuggestions?.text;
    const loader = dom.pdvAiSuggestions?.loader;

if (!suggestionContainer || !suggestionTextEl || !loader) return;

hideClientSeal();
    suggestionContainer.classList.remove('hidden');
    loader.classList.remove('hidden');
    suggestionTextEl.innerHTML = '';

try {
        const nextOrder = await fetchNextUpcomingOrder();
        if (nextOrder) {
            const totalSalgados = getSalgadosCountFromItems(nextOrder.items || []);
            suggestionTextEl.innerHTML = `
                <div class="flex items-center mb-2">
                    <i class="fas fa-forward text-blue-500 mr-2"></i>
                    <h4 class="font-semibold text-blue-800">Próxima Entrega</h4>
                </div>
                <p class="text-sm text-gray-700">
                    <strong>Cliente:</strong> ${nextOrder.customer?.name || 'N/A'}<br>
                    <strong>Horário:</strong> ${nextOrder.delivery?.time || 'N/A'} (${nextOrder.delivery?.date || ''})<br>
                    <strong>Total:</strong> ${totalSalgados} salgados
                </p>
            `;
        } else {
            suggestionTextEl.innerHTML = `<i class="fas fa-info-circle mr-2 text-gray-500"></i><span class="text-gray-700">Nenhuma entrega futura agendada.</span>`;
        }
    } catch (error) {
        console.error("Erro ao buscar próximo pedido:", error);
        suggestionTextEl.innerHTML = `<i class="fas fa-exclamation-triangle mr-2 text-red-500"></i><span class="text-red-700">Erro ao buscar dados da próxima entrega.</span>`;
    } finally {
        loader.classList.add('hidden');
    }
}

/**
 * NOVO: Mostra informações sobre a última compra de um cliente.
 * @param {object} clientData - Objeto do cliente com seu histórico de pedidos.
 */
function displayLastOrderInfo(clientData) {
    const suggestionContainer = dom.pdvAiSuggestions?.container;
    const suggestionTextEl = dom.pdvAiSuggestions?.text;
    if (!suggestionContainer || !suggestionTextEl) return;

suggestionContainer.classList.remove('hidden');

if (clientData && clientData.orders && clientData.orders.length > 0) {
        const lastOrder = clientData.orders[0];
        const lastOrderDate = formatDateToBR(lastOrder.createdAt);
        const lastOrderItems = (lastOrder.items || []).map(item => `${item.quantity}x ${item.name}`).join(', ');

suggestionTextEl.innerHTML = `<div class="flex items-center mb-2"><i class="fas fa-history text-purple-500 mr-2"></i><h4 class="font-semibold text-purple-800">Última Compra (${lastOrderDate})</h4></div><p class="text-sm text-gray-700"><strong>Itens:</strong> ${lastOrderItems || 'N/A'}<br><strong>Valor:</strong> ${formatCurrency(lastOrder.total)}</p>`;
    } else {
        suggestionTextEl.innerHTML = `<i class="fas fa-info-circle mr-2 text-gray-500"></i><span class="text-gray-700">Este é o primeiro pedido deste cliente.</span>`;
    }
}

/**
 * Interpreta uma string de data de forma robusta, tentando múltiplos formatos.
 * Usa a biblioteca date-fns se disponível ou tenta parsear nativamente.
 * @param {string} dateString - A data em formato de texto (ex: "2024-07-25" ou "25/07/2024").
 * @returns {Date|null} Um objeto Date válido ou null se a interpretação falhar.
 */
function parseDateString(dateString) {
    if (!dateString || typeof dateString !== 'string') {
        return null;
    }

    let date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        return date;
    }

    const parts = dateString.split('/');
    if (parts.length === 3) {
        date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (!isNaN(date.getTime())) {
            return date;
        }
    }

return null;
}

/**
 * NOVO: Função para verificar e alertar sobre saldo em aberto expirado.
 * @param {object} clientData O objeto do cliente com seu histórico de pedidos.
 */
function checkExpiredDebtAndAlert(clientData) {
    console.log("checkExpiredDebtAndAlert: Verificando dívida expirada para o cliente:", clientData.name);

    if (clientData.totalDebt > 0 && clientData.orders && clientData.orders.length > 0) {
        console.log("checkExpiredDebtAndAlert: Cliente tem dívida. Verificando pedidos.");

let foundExpiredDebt = false;

// Itera sobre TODOS os pedidos e verifica individualmente
        clientData.orders.forEach(order => {
            const hasDebt = (order.paymentStatus === 'devedor' || (order.restante > 0 && order.restante !== null));
            const isActive = order.status === 'ativo' || order.status === 'alterado';

if (hasDebt && isActive && order.delivery?.date) {
                const orderDate = parseDateString(order.delivery.date);
                if (orderDate) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

console.log(`Pedido #${order.orderNumber} - Data de entrega: ${orderDate.toISOString()}, Data de hoje: ${today.toISOString()}`);

                    if (orderDate < today) {
                        console.log(`Dívida expirada detectada para o pedido #${order.orderNumber}. Exibindo alerta.`);
                        showToast(`ATENÇÃO! Saldo em aberto expirado para o Pedido #${order.orderNumber}. Valor: ${formatCurrency(order.restante)}.`, 'error');
                        foundExpiredDebt = true; // Marca que um alerta foi exibido
                    } else {
                        console.log(`Dívida para o pedido #${order.orderNumber} existe, mas ainda não expirou.`);
                    }
                } else {
                    console.warn(`Aviso: Pedido #${order.orderNumber} tem data de entrega inválida.`);
                }
            }
        });

if (!foundExpiredDebt) {
            console.log("checkExpiredDebtAndAlert: Nenhuma dívida expirada encontrada.");
        }
    } else {
        console.log("checkExpiredDebtAndAlert: Cliente não tem dívida ou não tem pedidos.");
    }
}

export function setupPdvEventListeners() {
    console.log("setupPdvEventListeners: Configurando listeners de eventos do PDV.");
    const essentialPdvElements = [
        dom.pdvCardapioContainer, dom.sinal, dom.customerName, dom.customerPhone,
        dom.deliveryDate, dom.deliveryTime, dom.btnNovo, dom.btnFechar,
        dom.btnAtualizar, dom.btnCancelar, dom.btnComprovante, dom.liquidarBtn,
        dom.btnAnterior, dom.btnProximo, dom.searchBtn, dom.searchInput,
        dom.reportBtn, dom.returnToManagerBtn, dom.closeTicketBtn,
        dom.ticketPrintBtn, dom.ticketWhatsappBtn,
        dom.managerAccessBtn, dom.otherProducts.addManualBtn,
        dom.otherProducts.manualPrice, dom.btnSair,
        dom.employeeSwitcherSelect,
        dom.pdvEmployeeOnlineStatus,
        dom.deliveryDateWeekday, dom.sinalLabel, dom.restanteLabel,
    ];

const allPdvElementsFound = essentialPdvElements.every(el => el !== null && el !== undefined);

if (!allPdvElementsFound) {
        console.error("setupPdvEventListeners: Um ou mais elementos DOM essenciais do PDV não foram encontrados. Event listeners não serão configurados.");
        essentialPdvElements.forEach(el => {
            if (el === null || el === undefined) {
                const findPropName = (obj, val) => Object.keys(obj).find(key => obj[key] === val);
                let propName = findPropName(dom, el);
                let parentObjName = 'dom';

if (!propName) {
                    for (const key in dom) {
                        if (typeof dom[key] === 'object' && dom[key] !== null && findPropName(dom[key], el)) {
                            propName = findPropName(dom[key], el);
                            parentObjName = `dom.${key}`;
                            break;
                        }
                    }
                }
                console.error(`Elemento PDV essencial não encontrado: ${parentObjName}.${propName || 'desconhecido'}`);
            }
        });
        return;
    }

dom.pdvCardapioContainer.addEventListener("input", e => {
        if (e.target.matches(".product-quantity")) {
            calculateTotals();
            updateQuantityInputStyles();
        }
    });

dom.sinal.addEventListener("blur", (e) => {
        formatInputAsCurrency(e.target);
        let value = parseCurrency(e.target.value);
        value = roundSinal(value);
        e.target.value = formatCurrency(value).replace('R$ ', '');
        calculateTotals();
        updateSinalMethodVisibility();
    });
    if(dom.sinalMethodSelect){
        dom.sinalMethodSelect.addEventListener('change', ()=>{});
    }
    // Botões de método de pagamento (PIX / DIN / DEB / CRED)
    const methodButtonsContainer = document.getElementById('payment-method-buttons');
    if(methodButtonsContainer && dom.sinalMethodSelect){
        methodButtonsContainer.addEventListener('click', (e)=>{
            const btn = e.target.closest('.payment-method-btn');
            if(!btn) return;
            const method = btn.dataset.method;
            if(!PAYMENT_METHODS.includes(method)) return;
            dom.sinalMethodSelect.value = method; // sincroniza
            methodButtonsContainer.querySelectorAll('.payment-method-btn').forEach(b=>b.classList.remove('selected'));
            btn.classList.add('selected');
            // Remove estado de atenção se existir
            const group = document.getElementById('payment-method-group');
            if(group){
                group.classList.remove('payment-method-attention','payment-method-attention-escalate','payment-method-super-attention');
            }
            if(paymentAttentionTimer){ clearTimeout(paymentAttentionTimer); paymentAttentionTimer=null; }
            if(paymentSuperAttentionTimer){ clearTimeout(paymentSuperAttentionTimer); paymentSuperAttentionTimer=null; }
            try { updateButtonStates(); } catch(e) {}
        });
    }
    // Botão Pagamento Parcial
    const partialBtn = document.getElementById('partial-payment-btn');
    if(partialBtn){
        partialBtn.addEventListener('click', ()=>{
            registerPartialPayment();
        });
    }
    dom.customerName.addEventListener("input", debouncedClientLookup);
    dom.customerName.addEventListener("blur", (e) => {
        e.target.value = formatNameToTitleCase(e.target.value);

        setTimeout(() => {
            clearAutocomplete();
        }, 200);
    });

dom.customerPhone.addEventListener("input", (e) => {
        formatPhone(e); // Formata o telefone enquanto o usuário digita.
        debouncedClientLookup(); // Aciona a busca debounced.
    });

dom.deliveryDate.addEventListener("change", (e) => {
        updateWeekdayDisplay(e.target.value);
    });

    const suggestionsContainer = document.getElementById('autocomplete-suggestions');
    if (suggestionsContainer) {
        suggestionsContainer.addEventListener('mousedown', (e) => { // mousedown dispara antes do blur do input
            const suggestionEl = e.target.closest('[data-client-phone]');
            if (suggestionEl) {
                const name = suggestionEl.dataset.clientName;
                const phone = suggestionEl.dataset.clientPhone;
                handleSuggestionClick(name, phone);
            }
        });
    }

dom.deliveryTime.addEventListener("input", formatTime);
    dom.btnNovo.addEventListener("click", startNewOrder);
    // Clique normal quando habilitado
    dom.btnFechar.addEventListener("click", saveOrder);
    // Captura tentativa de clique enquanto desabilitado para acionar destaque
    function maybeImmediateAttention(){
        if(!dom.btnFechar.disabled) return;
        const sinalValor = getSinalValue();
        if(sinalValor > 0 && getSinalMethod()===''){
            highlightSuperPaymentAttention();
        }
    }
    dom.btnFechar.addEventListener('mousedown', (e)=>{ if(dom.btnFechar.disabled){ e.preventDefault(); maybeImmediateAttention(); }});
    dom.btnFechar.addEventListener('mouseenter', ()=>{ maybeImmediateAttention(); });

    // Observers para atualizar estado do botão conforme campos obrigatórios
    ['input','blur','change'].forEach(evt=>{
        dom.customerName.addEventListener(evt, ()=> updateButtonStates());
        dom.customerPhone.addEventListener(evt, ()=> updateButtonStates());
        dom.deliveryDate.addEventListener(evt, ()=> updateButtonStates());
        dom.deliveryTime.addEventListener(evt, ()=> updateButtonStates());
        dom.sinal.addEventListener(evt, ()=> updateButtonStates());
    });
    dom.btnAtualizar.addEventListener("click", updateOrder);
    dom.btnCancelar.addEventListener("click", cancelOrder);
    dom.btnComprovante.addEventListener("click", () => showTicketModal(pdvCurrentOrder));
    dom.liquidarBtn.addEventListener("click", settleDebt);
    dom.btnAnterior.addEventListener("click", () => navigateOrder(-1));
    dom.btnProximo.addEventListener("click", () => navigateOrder(1));
    dom.searchBtn.addEventListener("click", findOrderById);
    dom.searchInput.addEventListener("keydown", e => { if (e.key === "Enter") findOrderById(); });

    dom.reportBtn.addEventListener("click", () => {
        openEmployeeReport();
    });

dom.returnToManagerBtn.addEventListener("click", () => {
        if (navigateToManagerView) {
            dom.mainContent.style.display = 'none';
            dom.managerDashboard.style.display = 'flex';
            if (dom.managerDashboard && dom.managerDashboard.classList) dom.managerDashboard.classList.remove('hidden');
            navigateToManagerView('gerencial-dashboard');
        } else {
            console.error("navigateToManagerView não está disponível.");
            showToast("Erro de navegação. Tente recarregar a página.", "error");
        }
    });
    dom.closeTicketBtn.addEventListener("click", () => dom.ticketModal.classList.remove('active'));

if (dom.reminder && dom.reminder.closeBtn) {
        dom.reminder.closeBtn.addEventListener("click", () => dom.reminder.modal.classList.remove("active"));
    }
    if (dom.reminder && dom.reminder.printBtn) {
        dom.reminder.printBtn.addEventListener("click", printReminderList);
    }
    dom.managerAccessBtn.addEventListener('click', handleManagerAccess);
    dom.otherProducts.addManualBtn.addEventListener('click', addManualItemToOrder);
    dom.otherProducts.manualPrice.addEventListener('blur', (e) => formatInputAsCurrency(e.target));
    dom.btnSair.addEventListener('click', () => window.location.reload());

dom.employeeSwitcherSelect.addEventListener('change', async (e) => {
        const newEmployeeName = e.target.value; // Nome do funcionário selecionado
        const originalEmployee = { ...currentUser }; // Faz uma cópia do usuário original para reverter se necessário

if (newEmployeeName === originalEmployee.name) {
            return;
        }

        const confirmation = await showCustomConfirm(
            `Autenticar como ${newEmployeeName}`,
            `Para continuar como ${newEmployeeName}, por favor, digite a senha.`,
            {
                showInput: 'pass-only', // Nova opção para mostrar apenas o campo de senha
                okButtonText: "Confirmar Troca",
                okButtonClass: "bg-blue-600 hover:bg-blue-700"
            }
        );

if (confirmation && confirmation.confirmed) {
            const selectedEmployee = employees.find(emp => emp.name === newEmployeeName);

            if (selectedEmployee && String(selectedEmployee.password) === String(confirmation.pass)) {
                showToast(`Sessão iniciada para ${newEmployeeName}.`, "success");

await logActivity(originalEmployee.name, 'Logout'); // Registra o logout do operador anterior
                setCurrentUser(selectedEmployee); // Atualiza o usuário global da aplicação
                await logActivity(newEmployeeName, 'Login'); // Registra o login do novo operador

} else {
                showToast("Senha incorreta. A troca de operador foi cancelada.", "error");
                e.target.value = originalEmployee.name; // Reverte a seleção no dropdown
            }
        } else {
            console.log("Troca de operador cancelada pelo usuário.");
            e.target.value = originalEmployee.name; // Reverte a seleção no dropdown
        }
    });

    const deliveryTimeInput = dom.deliveryTime;
    const clearDeliveryTimeBtn = document.getElementById('clear-delivery-time-btn');

if (deliveryTimeInput && clearDeliveryTimeBtn) {
        const checkTimeValue = () => {
            const hasValue = !!deliveryTimeInput.value;
            clearDeliveryTimeBtn.classList.toggle('hidden', !hasValue);
        };

        deliveryTimeInput.addEventListener('input', checkTimeValue);

        clearDeliveryTimeBtn.addEventListener('click', () => {
            deliveryTimeInput.value = '';
            checkTimeValue(); // Esconde o botão
            deliveryTimeInput.focus();
        });
    }

    const { modal, currentPassInput, newPassInput, confirmPassInput, saveBtn, cancelBtn } = dom.changePasswordModal;

if (dom.changePasswordBtn && modal && !dom.changePasswordBtn.dataset.listenerAttached) {
        dom.changePasswordBtn.addEventListener('click', () => {
            currentPassInput.value = '';
            newPassInput.value = '';
            confirmPassInput.value = '';
            modal.classList.add('active');
            currentPassInput.focus();
        });
        dom.changePasswordBtn.dataset.listenerAttached = 'true';
    }

if (cancelBtn && modal && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
        cancelBtn.dataset.listenerAttached = 'true';
    }

if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', handleEmployeePasswordChange);
        saveBtn.dataset.listenerAttached = 'true';
    }

    if (dom.deliveryTime) {
        dom.deliveryTime.addEventListener('focus', (e) => {
            e.preventDefault(); // Impede a abertura do seletor de tempo padrão do navegador
            dom.deliveryTime.blur(); // Tira o foco para evitar que o teclado móvel apareça
            openInteractiveTimeSelector();
        });
    }

    const clearCartBtn = document.getElementById('clear-cart-btn');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', clearCart);
    } else {
        console.warn("Elemento 'clear-cart-btn' não encontrado. O botão de limpar carrinho não funcionará.");
    }

const closeTimeSelectorBtn = document.getElementById('interactive-time-selector-close-btn');
    if (closeTimeSelectorBtn) {
        const modal = document.getElementById('interactive-time-selector-modal');
        if (!closeTimeSelectorBtn.dataset.listenerAttached) {
            closeTimeSelectorBtn.addEventListener('click', () => modal.classList.remove('active'));
            closeTimeSelectorBtn.dataset.listenerAttached = 'true';
        }
    }
}

// ===== MELHORIAS RESUMO DO PEDIDO - Funções Auxiliares ===== 

/**
 * Anima um valor quando ele é atualizado
 * @param {string} elementId - ID do elemento a ser animado
 */
function animateValueUpdate(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.add('updated');
        setTimeout(() => element.classList.remove('updated'), 500);
    }
}

/**
 * Atualiza a visibilidade do cartão de sinal baseado no valor
 */
function updateSinalVisibility() {
    const sinalInput = document.getElementById('sinal-input');
    const sinalCard = document.querySelector('.osg-sinal');
    
    if (sinalInput && sinalCard) {
        const sinalValue = parseCurrency(sinalInput.value);
        
        if (sinalValue > 0) {
            sinalCard.classList.remove('hidden');
            sinalCard.setAttribute('aria-hidden', 'false');
        } else {
            sinalCard.classList.add('hidden');
            sinalCard.setAttribute('aria-hidden', 'true');
        }
    }
}

/**
 * Atualiza a cor do valor em aberto (verde quando quitado)
 */
function updateRestanteColor() {
    const restanteValueElement = document.getElementById('restante-value');
    const restanteCard = document.querySelector('.osg-restante');
    
    if (restanteValueElement && restanteCard) {
        const restanteValue = parseCurrency(restanteValueElement.textContent);
        
        if (restanteValue <= 0.01) { // Considera quitado se valor <= R$ 0,01
            restanteCard.classList.add('quitado');
        } else {
            restanteCard.classList.remove('quitado');
        }
    }
}

/**
 * Aplica todas as melhorias ao resumo do pedido
 */
export function applyOrderSummaryEnhancements() {
    // Anima os valores atualizados
    animateValueUpdate('total-value');
    animateValueUpdate('restante-value');
    
    // Atualiza visibilidade do sinal
    updateSinalVisibility();
    
    // Atualiza cor do valor em aberto
    updateRestanteColor();
}

// Ajuste dinâmico para que os valores caibam dentro das caixas sem quebrar
function autoFitOrderSummaryValues(){
    const map = [
        { el: document.getElementById('total-value'), baseClass: 'main-total'},
        { el: document.getElementById('restante-value'), baseClass: 'restante-negative'}
    ];
    map.forEach(({el, baseClass})=>{
        if(!el) return;
        // Remove classes de redução anteriores
        el.classList.remove('value-shrink-1','value-shrink-2','value-shrink-3');
        // Heurística: enquanto largura do texto ultrapassar 90% do container pai, aplica redução progressiva
        const parent = el.parentElement || el;
        const maxWidth = parent.clientWidth * 0.9;
        let pass = 0;
        while(el.scrollWidth > maxWidth && pass < 3){
            pass++;
            el.classList.add(`value-shrink-${pass}`);
        }
    });
}

// Reajusta ao redimensionar janela
window.addEventListener('resize', ()=>{
    try { autoFitOrderSummaryValues(); } catch(e) {}
});

