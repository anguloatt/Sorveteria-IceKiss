// pdv.js - Lógica e funcionalidades do Ponto de Venda (PDV)

import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
// NOVO: Importa a função para atualizar o painel de resumo em tempo real
// NOVO: Importa as funções de gerenciamento offline
import { isAppOnline, queueOrderForSync, getCachedProducts } from './offlineManager.js';

import { updateLiveSummary } from './pdv-live-summary.js';
import {
    showToast, showCustomConfirm, formatCurrency, parseCurrency,
    getTodayDateString, formatDateToBR, formatDateTimeToBR,
    formatNameToTitleCase, formatPhone, formatTime, formatInputAsCurrency,
    roundSinal, getProductInfoById,
    getSalgadosCountFromItems, 
    // Importa as funções de formatação de texto para impressão/WhatsApp
    generateTicketText, generatePrintableReminderText,
    printTicket, // Esta função agora usa generateTicketText internamente
    sendWhatsAppMessage, // Esta função agora usa generateTicketText internamente
    updateWeekdayDisplay, 
    printReminderList, // Esta função agora usa generatePrintableReminderText internamente
    // NOVO: Importa o modal de lembrete de amanhã para ser usado no login.
    showTomorrowReminderModal
} from './utils.js'; // Importa funções utilitárias
import {
    currentUser, currentOrder, productsConfig, storeSettings, getNextOrderNumber, peekNextOrderNumber, employees, setCurrentUser,
    managerCredentials, masterCredentials, currentReminderOrders, db
} from './app.js'; // Importa variáveis globais do app.js
import { 
    saveOrder as firebaseSaveOrder, updateOrder as firebaseUpdateOrder, 
    cancelOrder as firebaseCancelOrder, settleDebt as firebaseSettleDebt, logUserActivity, 
    findOrder as firebaseFindOrder, checkForDailyDeliveries, createNotification, findLastOrder, serverTimestamp, 
    findNextOrder as firebaseFindNextOrder, findPreviousOrder as firebaseFindPreviousOrder, changeEmployeePassword, findClientByPhone, findClientByName,
    updateProductStock,
    upsertClientOnOrder, 
    Timestamp,
    searchClientsByName, // NOVO: Importa a função de busca por nome parcial
    fetchNextUpcomingOrder // NOVO: Importa a função para buscar o próximo pedido
} from './firebaseService.js'; // Importa funções de serviço Firebase

// Importa funções do gerente que podem ser chamadas do PDV
import { handleManagerAccess, navigateToManagerView, openInteractiveTimeSelector, calculateWindowLoad } from './manager.js';

// Importa a função para abrir o relatório do funcionário
import { openEmployeeReport } from './employeeReport.js';

// Variável local para o pedido atual no PDV
let pdvCurrentOrder = null;
// NOVO: Timer para o debounce da busca de cliente, para evitar erro 429.
let clientLookupDebounceTimer = null;

// Renderiza os produtos no PDV com o novo layout de colunas
export function renderProducts() {
    console.log("renderProducts: Iniciando renderização dos produtos.");

    // NOVO: Lógica para carregar produtos do cache se estiver offline
    if (!isAppOnline()) {
        console.log("MODO OFFLINE: Carregando produtos do cache local.");
        const cachedProductsArray = getCachedProducts();
        if (cachedProductsArray && cachedProductsArray.length > 0) {
            // Limpa o objeto de configuração global antes de preenchê-lo
            Object.keys(productsConfig).forEach(key => delete productsConfig[key]);
            
            // Preenche o objeto de configuração global com os dados do cache
            cachedProductsArray.forEach(product => {
                const category = product.category || 'outros';
                if (!productsConfig[category]) {
                    productsConfig[category] = [];
                }
                productsConfig[category].push(product);
            });
            console.log("MODO OFFLINE: productsConfig populado com dados do cache:", productsConfig);
        } else {
            showToast("Cardápio indisponível. Conecte-se à internet para carregar.", "error", 5000);
            // Limpa a UI para evitar confusão
            Object.values(dom.cardapioColumns).forEach(col => col.innerHTML = '');
            return;
        }
    }

    console.log("renderProducts: productsConfig atual:", productsConfig);
    
    if (!dom.cardapioColumns || !dom.cardapioColumns.assados || !dom.cardapioColumns.fritos || !dom.cardapioColumns.revenda || !dom.cardapioColumns.extra) {
        console.error("renderProducts: Um ou mais elementos de coluna do cardápio não foram encontrados no DOM. Verifique os IDs no HTML.");
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

    if (!productsConfig) {
        console.warn("renderProducts: productsConfig não está definido. Não é possível renderizar.");
        return;
    }
    
    (productsConfig.assados || []).forEach(p => {
        const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
        const itemHtml = `
            <div class="cardapio-item ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}" data-product-id="${p.id}" data-product-category="assados" title="${outOfStock ? `${p.name} (Sem Estoque)` : p.name}">
                <span class="cardapio-item-name">${p.name}<span class="cardapio-item-price">(${formatCurrency(p.price)})</span></span>
                <input type="number" min="0" value="0" class="product-quantity" ${outOfStock ? 'disabled' : ''}>
            </div>`;
        dom.cardapioColumns.assados.insertAdjacentHTML('beforeend', itemHtml);
    });
    
    (productsConfig.fritos || []).forEach(p => {
        const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
        const itemHtml = `
            <div class="cardapio-item ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}" data-product-id="${p.id}" data-product-category="fritos" title="${outOfStock ? `${p.name} (Sem Estoque)` : p.name}">
                <span class="cardapio-item-name">${p.name}<span class="cardapio-item-price">(${formatCurrency(p.price)})</span></span>
                <input type="number" min="0" value="0" class="product-quantity" ${outOfStock ? 'disabled' : ''}>
            </div>`;
        dom.cardapioColumns.fritos.insertAdjacentHTML('beforeend', itemHtml);
    });

    (productsConfig.revenda || []).forEach(p => {
        const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
        const itemHtml = `
            <div class="cardapio-item ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}" data-product-id="${p.id}" data-product-category="revenda" title="${outOfStock ? `${p.name} (Sem Estoque)` : p.name}">
                <span class="cardapio-item-name">${p.name}<span class="cardapio-item-price">(${formatCurrency(p.price)})</span></span>
                <input type="number" min="0" value="0" class="product-quantity" ${outOfStock ? 'disabled' : ''}>
            </div>`;
        dom.cardapioColumns.revenda.insertAdjacentHTML('beforeend', itemHtml);
    });

    (productsConfig.outros || []).forEach(p => {
        const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
        const itemHtml = `
            <div class="cardapio-item ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}" data-product-id="${p.id}" data-product-category="outros" title="${outOfStock ? `${p.name} (Sem Estoque)` : p.name}">
                <span class="cardapio-item-name">${p.name}<span class="cardapio-item-price">(${formatCurrency(p.price)})</span></span>
                <input type="number" min="0" value="0" class="product-quantity" ${outOfStock ? 'disabled' : ''}>
            </div>`;
        dom.cardapioColumns.extra.insertAdjacentHTML('beforeend', itemHtml);
    });
    console.log("renderProducts: Produtos renderizados.");
}

// Função para renderizar um item manual na interface
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
        // Se o foco não estiver mais no campo de nome, não faz nada.
        if (document.activeElement !== dom.customerName) {
            return;
        }

        const name = dom.customerName.value.trim();
        const phone = dom.customerPhone.value.trim();
        const rawPhone = phone.replace(/\D/g, '');

        // Cenário 1: Campo de nome está vazio. Mostra o próximo pedido.
        if (name.length === 0) {
            clearAutocomplete();
            await displayNextUpcomingOrder();
            return;
        }

        // Cenário 2: Campo de nome muito curto. Esconde tudo.
        if (name.length < 2) {
            clearAutocomplete();
            hideClientSeal();
            if (dom.pdvAiSuggestions?.container) dom.pdvAiSuggestions.container.classList.add('hidden');
            return;
        }

        // Cenário 3: Telefone é válido. Busca por telefone tem prioridade.
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
            // Cenário 4: Telefone inválido, busca por nome parcial.
            const clients = await searchClientsByName(name);
            renderAutocompleteSuggestions(clients);
        }
    }, 400); // Atraso de 400ms para uma resposta mais rápida.
};

// NOVO: Funções para a interface de autocompletar (serão implementadas depois)
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

// Função para remover um item manual da interface e do pdvCurrentOrder
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

    // 1. Limpa os itens do objeto de pedido atual
    if (pdvCurrentOrder) {
        pdvCurrentOrder.items = [];
    }

    // 2. Reseta os inputs de quantidade no cardápio
    document.querySelectorAll('#pdv-cardapio-grid .product-quantity').forEach(input => {
        input.value = '0';
        // Remove classes de destaque
        input.classList.remove('bg-yellow-100', 'border-2', 'border-amber-500', 'font-bold', 'text-amber-700');
    });

    // 3. Recalcula os totais, o que vai atualizar a UI
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

        // Usa toggle para adicionar/remover classes de forma mais limpa
        input.classList.toggle('bg-yellow-100', isHighlighted);
        input.classList.toggle('border-2', isHighlighted);
        input.classList.toggle('border-amber-500', isHighlighted);
        input.classList.toggle('font-bold', isHighlighted);
        input.classList.toggle('text-amber-700', isHighlighted);
    });
}

// Calcula os totais do pedido
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
                    // // VERIFICAÇÃO DE ESTOQUE (Temporariamente desativada conforme solicitado)
                    // if (typeof product.stock === 'number' && quantity > product.stock) {
                    //     showToast(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock}`, 'error');
                    //     quantity = product.stock; // Corrige a quantidade para o máximo disponível
                    //     quantityInput.value = quantity; // Atualiza o campo na tela
                    // }

                    if (quantity > 0) { // Re-verifica a quantidade após a correção
                        const price = product.price;
                        // CORREÇÃO: Arredonda o subtotal para evitar erros de ponto flutuante.
                        const subtotal = parseFloat((quantity * price).toFixed(2));
                        total += subtotal;
                        items.push({
                            id,
                            name: product.name,
                            quantity,
                            unitPrice: price,
                            subtotal, // subtotal agora está arredondado
                            category: category,
                            // AÇÃO CORRETIVA: Garante que o valor de 'stock' não seja 'undefined'.
                            // O Firestore não permite valores 'undefined', o que causava erro ao salvar.
                            stock: product.stock ?? null // Se product.stock for undefined ou null, usa null.
                        });
                    }
                }
            }
        }
    });
    
    // Adiciona itens manuais já existentes no pedido
    if (pdvCurrentOrder && pdvCurrentOrder.items) {
        pdvCurrentOrder.items.filter(item => item.isManual).forEach(item => {
            total += item.subtotal;
            items.push(item);
        });
    }

    // CORREÇÃO: Arredonda todos os totais para garantir precisão e evitar erros de dívida.
    total = parseFloat(total.toFixed(2));
    const sinal = parseCurrency(dom.sinal.value);
    const restante = parseFloat((total - sinal).toFixed(2));

    dom.totalValue.textContent = formatCurrency(total);
    dom.restanteValue.textContent = formatCurrency(restante);
    
    const minSinalValue = parseFloat((total * 0.10).toFixed(2));
    if (dom.sinalMinimoDisplay) {
        dom.sinalMinimoDisplay.textContent = `(Mínimo ${formatCurrency(minSinalValue)})`;
    }

    updatePaymentStatus(restante, total, sinal);
    if (pdvCurrentOrder) {
        // Atualiza pdvCurrentOrder com a nova lista de items e valores arredondados
        Object.assign(pdvCurrentOrder, { items, total, sinal, restante, paymentStatus: (total > 0 && restante <= 0.01) ? 'pago' : 'devedor' });
    }
    updateButtonStates();

    // NOVO: Atualiza o seletor de horário em tempo real se estiver aberto
    const timeSelectorModal = document.getElementById('interactive-time-selector-modal');
    if (timeSelectorModal && timeSelectorModal.classList.contains('active')) {
        openInteractiveTimeSelector();
    }

    // NOVO: Centraliza a atualização de estilos dos inputs de quantidade
    updateQuantityInputStyles();

    // NOVO: Chama a atualização do painel de resumo sempre que os totais são recalculados
    updateLiveSummary(pdvCurrentOrder);
}

// NOVO: Exporta uma função para obter os itens atuais da UI do PDV
// Esta função é usada pelo seletor de horário interativo para calcular a carga.
export function getItemsFromUI() {
    const items = [];
    // 1. Coleta itens dos inputs do cardápio
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

    // 2. Coleta itens manuais que já estão no pedido atual
    if (pdvCurrentOrder && pdvCurrentOrder.items) {
        pdvCurrentOrder.items.filter(item => item.isManual).forEach(manualItem => {
            items.push(manualItem);
        });
    }

    return items;
}

// Inicia um novo pedido
export async function startNewOrder() {
    // NOVO: Lógica para iniciar pedido em modo offline
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
            createdAt: new Date().toISOString() // Timestamp do cliente
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

    // Lógica online existente
    console.log("startNewOrder: Iniciando novo pedido.");
    const nextOrderNum = await peekNextOrderNumber();

    pdvCurrentOrder = {
        // Armazena o número que está sendo exibido. Ele será substituído pelo número real ao salvar.
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
        // O createdAt real será definido ao salvar o pedido.
        createdAt: serverTimestamp()
    };
    clearForm();
    calculateTotals();
    if (dom.searchInput) {
        // Exibe o próximo número disponível no campo de busca.
        dom.searchInput.value = nextOrderNum;
    }
    // Garante que o botão de limpar horário seja escondido
    if (dom.deliveryTime) {
        dom.deliveryTime.dispatchEvent(new Event('input', { bubbles: true }));
    }
    updateStatusLabel('novo', 'Novo Pedido');
    if (dom.deliveryDate) {
        dom.deliveryDate.value = getTodayDateString('yyyy-mm-dd');
        updateWeekdayDisplay(dom.deliveryDate.value);
        // NOVO: Limpa os horários manuais ao mudar a data
        // Esta chamada foi movida para o listener 'change' do deliveryDate
        // clearManuallyAddedTimeSlots(dom.deliveryDate.value); 
    }
    // NOVO: Exibe a próxima entrega na caixa de sugestão
    await displayNextUpcomingOrder();
    console.log("startNewOrder: Novo pedido iniciado com sucesso, exibindo o número: ", nextOrderNum);
}

// Carrega um pedido no formulário
export async function loadOrderIntoForm(order) {
    console.log("loadOrderIntoForm: Carregando pedido no formulário:", order.orderNumber);
    pdvCurrentOrder = order;
    clearForm();
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
    // Garante que o botão de limpar horário seja atualizado
    if (dom.deliveryTime) {
        dom.deliveryTime.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ADIÇÃO DE CÓDIGO AQUI:
    // Verifica o telefone do cliente para exibir o selo automaticamente
    if (order.customer?.phone) {
        const clientData = await findClientByPhone(order.customer.phone);
        if (clientData) {
            displayClientSeal(clientData);
            // NOVO: Verificação e alerta para saldo em aberto expirado
            checkExpiredDebtAndAlert(clientData);
        } else {
            hideClientSeal();
        }
    } else {
        hideClientSeal();
    }
    
    // NOVO: Mostra a última compra do cliente carregado
    displayLastOrderInfo(order);
    console.log("loadOrderIntoForm: Pedido carregado com sucesso.");
}

// Salva um novo pedido
async function saveOrder() {
    console.log("saveOrder: Tentando finalizar pedido...");
    calculateTotals();
    if (!validateForm(true)) return;

    // NOVO: Se estiver offline, salva localmente e ignora a verificação de sobrecarga
    if (!isAppOnline()) {
        await _executeOfflineSave();
        return;
    }


    // --- LÓGICA DE VERIFICAÇÃO DE SOBRECARGA FINAL ---
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

        // Adiciona um listener de clique que só executa uma vez
        continueBtn.addEventListener('click', handleContinue, { once: true });

        // O botão de alterar apenas fecha o modal e remove o listener do outro botão
        changeTimeBtn.onclick = () => {
            modal.classList.remove('active');
            continueBtn.removeEventListener('click', handleContinue);
        };

        modal.classList.add('active');
    } else {
        await _executeSaveOrder(); // Se não estiver sobrecarregado, salva diretamente
    }
}

// NOVO: Função para salvar o pedido localmente quando offline
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

    // Monta o objeto do pedido com dados do formulário
    const orderData = {
        // Não inclui orderNumber, será gerado na sincronização
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
    
    // Inicia um novo pedido offline
    await startNewOrder();
}

// Lógica de salvamento real, separada para ser chamada após a verificação
async function _executeSaveOrder() {
    // Isso garante que o número só seja consumido se o pedido for realmente salvo.
    // CORREÇÃO DE SEGURANÇA: Pega o operador do seletor, em vez de usar o usuário logado.
    // Isso garante que a venda seja atribuída corretamente, sem alterar o usuário autenticado.
    const operatorName = dom.employeeSwitcherSelect.value;
    let operator = employees.find(e => e.name === operatorName);

    // AÇÃO CORRETIVA: Se o operador não for encontrado na lista (ex: "Gerência"),
    // usa o currentUser, mas garante que ele tenha um ID. O usuário 'gerente' não
    // vem da coleção 'employees', então seu ID não existe por padrão.
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

    // CORREÇÃO CRÍTICA: Converte a data YYYY-MM-DD para DD/MM/YYYY sem usar new Date()
    // para evitar problemas de fuso horário que salvavam o pedido no dia anterior.
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

    const orderData = {
        ...pdvCurrentOrder,
        // CORREÇÃO CRÍTICA: Garante que o número do pedido seja salvo como NÚMERO, não como texto.
        orderNumber: parseInt(pdvCurrentOrder.orderNumber, 10),
        status: 'ativo',
        // CORREÇÃO: Salva o telefone exatamente como está no campo (já formatado por formatPhone)
        customer: { name: dom.customerName.value, phone: dom.customerPhone.value }, 
        // Usa a data formatada corretamente, garantindo que "29/07/2024" seja salvo como "29/07/2024"
        // CORREÇÃO: Adiciona .trim() para remover espaços em branco antes de salvar.
        delivery: { date: deliveryDateFormatted, time: deliveryTimeValue },
        createdBy: { id: operator.id, name: operator.name, role: operator.role },
        observations: dom.orderObservations.value.trim() || null, // NOVO: Salva as observações
        createdAt: serverTimestamp(),
        deliveryTimestamp: deliveryTimestamp // NOVO: Adiciona o timestamp para ordenação
    };
    console.log("saveOrder: Dados do pedido a serem salvos:", orderData);
    try {
        // Passo 1: Salva o pedido no banco de dados
        const savedOrder = await firebaseSaveOrder(orderData);
        
        // Passo 2: Dá baixa no estoque para cada item do pedido (Temporariamente desativado)
        // showToast("Dando baixa no estoque...", "info", 2000);
        // for (const item of savedOrder.items) {
        //     await updateProductStock(item.id, -item.quantity, 'Venda', savedOrder.orderNumber);
        // }

        // Passo 3: Atualiza/Cria o cliente
        await upsertClientOnOrder(savedOrder, true);

        // NOVO: Passo 3.5: Cria a notificação para o gerente
        await createNotification(
            'new_order',
            'Novo Pedido Recebido',
            `Pedido #${savedOrder.orderNumber} para ${savedOrder.customer.name} no valor de ${formatCurrency(savedOrder.total)}.`,
            { orderId: savedOrder.id } // Adiciona o ID do pedido ao contexto
        );

        // Passo 4: Mostra o ticket e inicia um novo pedido
        // CORREÇÃO: O objeto 'savedOrder' contém um 'serverTimestamp' que não pode ser formatado.
        // Criamos uma versão para exibição com a data atual do cliente.
        const orderForDisplay = { ...savedOrder, createdAt: new Date() };
        pdvCurrentOrder = orderForDisplay;
        showTicketModal(orderForDisplay);
        startNewOrder();
        console.log("saveOrder: Pedido finalizado com sucesso.");
    } catch (error) {
        console.error("saveOrder: Erro ao finalizar pedido:", error);
        // NOVO: Tratamento de erro específico para estoque insuficiente.
        // Isso acontece se o estoque acabar enquanto o pedido está sendo feito (condição de corrida).
        if (error.message && error.message.includes("Estoque insuficiente")) {
            showToast(error.message, "error", 5000); // Mostra a mensagem de erro exata do sistema.
            showToast("O estoque foi atualizado. Verifique as quantidades e tente novamente.", "info", 6000);
            renderProducts(); // Re-renderiza a lista de produtos para mostrar o estoque atualizado (desabilitando itens sem estoque).
        } else {
            // Tratamento para outros erros inesperados.
            showToast("Ocorreu um erro inesperado ao salvar o pedido.", "error");
        }
    }
}

// Atualiza um pedido existente
async function updateOrder() {
    console.log("updateOrder: Tentando atualizar pedido...");
    if (!pdvCurrentOrder || !pdvCurrentOrder.id) {
        return showToast("Nenhum pedido carregado para atualizar.", "error");
    }

    calculateTotals();
    if (!validateForm(false)) return;

    // --- LÓGICA DE VERIFICAÇÃO DE SOBRECARGA FINAL ---
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
    // CORREÇÃO DE SEGURANÇA: Pega o operador do seletor para o campo 'updatedBy'.
    // Isso garante que a alteração seja atribuída corretamente, sem usar o usuário autenticado.
    const operatorName = dom.employeeSwitcherSelect.value;
    let operator = employees.find(e => e.name === operatorName);

    // AÇÃO CORRETIVA: Se o operador não for encontrado na lista (ex: "Gerência"),
    // usa o currentUser, mas garante que ele tenha um ID. O usuário 'gerente' não
    // vem da coleção 'employees', então seu ID não existe por padrão.
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

    // CORREÇÃO CRÍTICA: Converte a data YYYY-MM-DD para DD/MM/YYYY sem usar new Date()
    // para evitar problemas de fuso horário que salvavam o pedido no dia anterior.
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

    const orderData = {
        ...pdvCurrentOrder,
        status: 'alterado',
        // CORREÇÃO: Salva o telefone exatamente como está no campo (já formatado por formatPhone)
        customer: { name: dom.customerName.value, phone: dom.customerPhone.value }, 
        // Usa a data formatada corretamente, garantindo que "29/07/2024" seja salvo como "29/07/2024"
        // CORREÇÃO: Adiciona .trim() para remover espaços em branco antes de salvar.
        delivery: { date: deliveryDateFormatted, time: deliveryTimeValue },
        updatedAt: serverTimestamp(),
        observations: dom.orderObservations.value.trim() || null, // NOVO: Salva as observações
        updatedBy: { id: operator.id, name: operator.name, role: operator.role },
        deliveryTimestamp: deliveryTimestamp // NOVO: Adiciona o timestamp para ordenação
    };

    // Acessa firebase.firestore.FieldValue.delete() via db
    // CORREÇÃO: Substituído `firebase.firestore.FieldValue.delete()` por `deleteField()`
    if (pdvCurrentOrder.managerOverrideEdit) {
        orderData.managerOverrideEdit = deleteField(); 
    }
    console.log("updateOrder: Dados do pedido a serem atualizados:", orderData);
    try {
        await firebaseUpdateOrder(pdvCurrentOrder.id, orderData);
        // CORREÇÃO: O objeto 'orderData' contém um 'serverTimestamp' que não pode ser formatado.
        // Criamos uma versão para exibição com a data atual do cliente.
        const orderForDisplay = { ...orderData, updatedAt: new Date() };
        pdvCurrentOrder = orderForDisplay;
        updateStatusLabel('alterado', 'Pedido Alterado');
        showTicketModal(orderForDisplay);
        console.log("updateOrder: Pedido atualizado com sucesso.");
    } catch (error) {
        console.error("updateOrder: Erro ao atualizar:", error);
    }
}

// Cancela um pedido
async function cancelOrder() {
    console.log("cancelOrder: Tentando cancelar pedido...");
    if (!pdvCurrentOrder || !pdvCurrentOrder.id || !['ativo', 'alterado'].includes(pdvCurrentOrder.status)) {
        return showToast("Apenas pedidos ativos ou alterados podem ser cancelados.", "error");
    }
    const confirmCancel = await showCustomConfirm("Confirmar Cancelamento", `Tem certeza que deseja cancelar o pedido ${pdvCurrentOrder.orderNumber}?`);
    if (!confirmCancel) return;

    try {
        // Passo 1: Cancela o pedido no banco de dados
        await firebaseCancelOrder(pdvCurrentOrder.id, currentUser, pdvCurrentOrder.orderNumber);
        
        // // Passo 2: Devolve os itens ao estoque (Temporariamente desativado)
        // showToast("Devolvendo itens ao estoque...", "info", 2000);
        // for (const item of pdvCurrentOrder.items) {
        //     await updateProductStock(item.id, item.quantity, 'Cancelamento', pdvCurrentOrder.orderNumber);
        // }

        // Passo 3: Atualiza a interface e o backup
        pdvCurrentOrder.status = 'cancelado';
        updateStatusLabel('cancelado', 'Cancelado');
        showToast(`Pedido ${pdvCurrentOrder.orderNumber} cancelado.`, "success"); // Mensagem ajustada
        console.log("cancelOrder: Pedido cancelado com sucesso.");
    } catch (error) {
        console.error("cancelOrder: Erro ao cancelar:", error);
        showToast("Erro ao cancelar o pedido. Verifique o console.", "error");
    }
}

// Liquida o saldo de um pedido
async function settleDebt() {
    console.log("settleDebt: Tentando liquidar saldo...");
    if (!pdvCurrentOrder || !pdvCurrentOrder.id || pdvCurrentOrder.paymentStatus === 'pago') {
        return showToast("Este pedido já está pago ou não é válido.", "error");
    }
    const confirmSettle = await showCustomConfirm("Confirmar Liquidação", `Tem certeza que deseja liquidar o saldo do pedido ${pdvCurrentOrder.orderNumber}?`);
    if (!confirmSettle) return;

    const newSinal = pdvCurrentOrder.total;
    try {
        await firebaseSettleDebt(pdvCurrentOrder.id, newSinal, currentUser, pdvCurrentOrder.orderNumber);
        pdvCurrentOrder.paymentStatus = 'pago';
        pdvCurrentOrder.sinal = newSinal;
        pdvCurrentOrder.restante = 0;
        if (dom.sinal) {
            dom.sinal.value = formatCurrency(newSinal).replace('R$ ', '');
        }
        calculateTotals();
        console.log("settleDebt: Saldo liquidado com sucesso.");
    } catch (error) {
        console.error("settleDebt: Erro ao liquidar:", error);
    }
}

// Encontra e carrega um pedido pelo número de busca
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

// Navega para o pedido anterior ou próximo
async function navigateOrder(direction) {
    console.log(`MapsOrder: Navegando pedido. Direção: ${direction}`);
    let orderData;
    const currentOrderIsNew = pdvCurrentOrder?.status === 'novo';
    const currentOrderNumber = parseInt(pdvCurrentOrder?.orderNumber, 10);

    if (currentOrderIsNew) {
        // Se o pedido atual é NOVO (ainda não salvo)
        if (direction === -1) { // Botão '<' (Anterior)
            // O "anterior" a um novo pedido é simplesmente o último pedido salvo.
            orderData = await findLastOrder();
        } else { // Botão '>' (Próximo)
            // Não há pedido "próximo" a um novo pedido.
            showToast("Você já está em um novo pedido.", "info");
            return;
        }
    } else {
        // Se o pedido atual já está salvo, usa a lógica normal.
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

// Limpa o formulário do pedido
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
    // NOVO: Esconde a sugestão da IA ao limpar o formulário
    if (dom.pdvAiSuggestions?.container) {
        dom.pdvAiSuggestions.container.classList.add('hidden');
    }
    hideClientSeal();
    clearAutocomplete();
    console.log("clearForm: Formulário limpo.");
}

/**
 * NOVO: Limpa o campo de nome do cliente e aciona a lógica para mostrar o próximo pedido.
 */
function clearCustomerNameAndSuggest() {
    if (dom.customerName) {
        dom.customerName.value = '';
        // Aciona o evento de input para que o debouncedClientLookup seja chamado
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

// Valida o formulário do pedido
function validateForm(isNewOrder) {
    console.log("validateForm: Validando formulário.");
    const errors = [];
    const fieldsToValidate = [
        dom.customerName, dom.customerPhone, dom.deliveryDate, dom.deliveryTime
    ];

    // Remove a classe de erro de todos os campos antes de validar
    fieldsToValidate.forEach(field => field?.classList.remove('invalid-field'));

    // 1. Validação do Nome do Cliente
    const nameError = validateCustomerName(dom.customerName.value);
    if (nameError) {
        errors.push(nameError);
    }

    // 2. Validação do Telefone
    const phoneError = validateCustomerPhone(dom.customerPhone.value);
    if (phoneError) {
        errors.push(phoneError);
    }

    // 3. Validação da Data e Hora de Retirada (Lógica unificada e corrigida)
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

    // Apenas prossegue para a validação de tempo se a data e a hora tiverem um formato válido
    if (deliveryDateValue && deliveryTimeValue && timeRegex.test(deliveryTimeValue)) {
        // --- NOVA LÓGICA DE VALIDAÇÃO USANDO date-fns (MAIS SEGURA E SIMPLES) ---

        // 1. Combina as strings de data e hora para criar uma string completa.
        const combinedStr = `${deliveryDateValue} ${deliveryTimeValue}`;

        // 2. Usa a função 'parse' do date-fns para criar o objeto Date corretamente no fuso horário local.
        //    'yyyy-MM-dd HH:mm' informa ao  exatamente como interpretar a string.
        //    O 'new Date()' é a data de referência, garantindo que a análise seja consistente.
        const deliveryDateTime = dateFns.parse(combinedStr, 'yyyy-MM-dd HH:mm', new Date());
        
        // 3. Cria a data/hora atual com uma tolerância para evitar erros por segundos.
        //    Subtrai 5 minutos do tempo atual, então um pedido para "agora" ainda é válido.
        const nowWithTolerance = dateFns.subMinutes(new Date(), 5);

        // --- LOGS DE DEPURAÇÃO PARA DIAGNÓSTICO ---
        console.log("--- DEBUG DE HORÁRIO (date-fns) ---");
        console.log(`String Combinada: ${combinedStr}`);
        console.log(`Horário Escolhido (Parseado): ${deliveryDateTime.toLocaleString('pt-BR')}`);
        console.log(`Horário Atual (com tolerância de 5min): ${nowWithTolerance.toLocaleString('pt-BR')}`);
        console.log("------------------------------------");

        // 4. Compara as datas. 'isBefore' do date-fns é seguro e explícito.
        if (dateFns.isBefore(deliveryDateTime, nowWithTolerance)) {
            errors.push({ field: dom.deliveryTime, message: "Este horário já passou. Por favor, escolha um horário futuro." });
        }
    }

    // 4. Validação dos Itens do Pedido
    if (!pdvCurrentOrder || pdvCurrentOrder.items.length === 0) {
        errors.push({ message: "Adicione ao menos um item ao pedido." });
    }

    // Se houver erros, destaca os campos e mostra o primeiro erro
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
        }
        return false;
    }

    console.log("validateForm: Formulário válido.");
    return true;
}

// Atualiza o rótulo de status do pedido e o estilo do input
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

// Atualiza o estado dos botões do PDV
export function updateButtonStates() {
    if (!pdvCurrentOrder) return;

    const isOffline = !isAppOnline();
    const isNew = pdvCurrentOrder.status === 'novo' || pdvCurrentOrder.status === 'novo_offline';
    const isActive = ['ativo', 'alterado'].includes(pdvCurrentOrder.status);
    const isCancelled = pdvCurrentOrder.status === 'cancelado';
    const isPaid = pdvCurrentOrder.paymentStatus === 'pago';
    
    const buttonsToCheck = [
        dom.btnFechar, dom.btnAtualizar, dom.btnCancelar,
        dom.btnComprovante, dom.liquidarBtn,
        // NOVO: Adiciona botões de navegação à verificação
        dom.btnAnterior, dom.btnProximo, dom.searchBtn
    ];

    buttonsToCheck.forEach(btn => {
        if (btn) {
            let disabled = false;
            let title = '';
            
            if (btn === dom.btnFechar) {
                disabled = !isNew; // Funciona para novo e novo_offline
                title = 'Finalizar Pedido';
            } else if (btn === dom.btnAtualizar) {
                disabled = !isActive || isOffline; // Desabilita se offline
                title = isOffline ? 'Função indisponível offline' : 'Atualizar Pedido';
            } else if (btn === dom.btnCancelar) {
                disabled = !isActive || isOffline; // Desabilita se offline
                title = isOffline ? 'Função indisponível offline' : 'Cancelar Pedido';
            } else if (btn === dom.btnComprovante) {
                // Permite comprovante para pedidos offline já salvos, mas não para um novo
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

// Atualiza o status de pagamento exibido
export function updatePaymentStatus(restante, total, sinal) {
    if (!dom.paymentStatus || !dom.liquidarBtn) {
        console.warn("Elementos de status de pagamento ou botão liquidar não encontrados.");
        return;
    }

    if (total > 0 && restante <= 0.01) {
        dom.paymentStatus.textContent = "SALDO TOTAL PAGO";
        dom.paymentStatus.className = "payment-status payment-pago";
        dom.liquidarBtn.innerHTML = `<i class="fa fa-check-circle mr-2"></i> Saldo Liquidado`;
    } else {
        dom.paymentStatus.textContent = "SALDO EM ABERTO";
        dom.paymentStatus.className = "payment-status payment-devedor";
        dom.liquidarBtn.innerHTML = total > 0 ? `<i class="fa fa-exclamation-triangle mr-2"></i> Liquidar Saldo` : `Liquidar Saldo`;
    }
}

// Mostra o modal de lembrete de produção
export function showReminderModal(orders) {
    console.log("showReminderModal: Exibindo modal de lembrete de produção.");
    const { modal, date, summaryItems, ordersList, closeBtn, printBtn, weekdayHighlight, title } = dom.reminder;

    // CORREÇÃO: Verifica os elementos essenciais e permite que a função continue mesmo se os opcionais (título/dia da semana) estiverem faltando.
    if (!modal || !date || !summaryItems || !ordersList || !closeBtn || !printBtn) {
        console.error("showReminderModal: Elementos essenciais do modal de lembrete não foram encontrados.");
        return;
    }

    // Atualiza os elementos visuais opcionais apenas se eles existirem.
    if (weekdayHighlight && title) {
        const weekdays = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
        const today = new Date();
        weekdayHighlight.textContent = weekdays[today.getDay()];
        title.textContent = 'Lembrete de Produção (HOJE)';
    } else {
        // Fallback para o título antigo se os novos elementos não existirem
        const mainTitle = document.querySelector('#reminder-modal h2');
        if (mainTitle) mainTitle.textContent = 'Lembrete de Produção (Hoje)';
    }

    currentReminderOrders.splice(0, currentReminderOrders.length, ...orders); // Atualiza a variável global no app.js

    // CORREÇÃO: Passa o formato 'dd/mm/yyyy' para exibir a data corretamente para o usuário.
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
        // Usa a função de texto para garantir que a pré-visualização seja idêntica à impressão.
        dom.ticketContent.textContent = generateTicketText(order);
        dom.ticketPrintBtn.onclick = null;
        dom.ticketWhatsappBtn.onclick = null;

        // As funções de impressão/WhatsApp CONTINUAM usando generateTicketText (texto simples)
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

// NOVO: Lida com a alteração de senha do funcionário
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
        // O toast de erro já é mostrado pela função do serviço, não precisa fazer nada aqui.
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

    // Função para fechar o modal
    const closeModal = () => {
        modal.classList.remove('active');
        // Remove o listener para evitar duplicação
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

    // 1. Atualiza o status de pagamento
    if (clientData.totalDebt > 0) {
        paymentIcon.className = 'fas fa-thumbs-down text-xl mb-1 text-red-500';
        paymentStatus.textContent = 'Com Saldo Pendente'; // Menos agressivo
    } else {
        paymentIcon.className = 'fas fa-thumbs-up text-xl mb-1 text-green-500';
        paymentStatus.textContent = 'Bom Pagador';
    }

    // 2. Atualiza a quantidade de compras (mantido como está, é útil)
    orderCount.textContent = clientData.orderCount || 0;

    // 3. NOVO: Mostra a quantidade de salgados da última compra em vez de "Cliente Desde"
    let lastOrderSalgados = 0;
    // Verifica se há pedidos e se o último pedido tem itens
    if (clientData.orders && clientData.orders.length > 0 && clientData.orders[0].items) {
        const lastOrder = clientData.orders[0]; // O orders já vem ordenado do mais recente para o mais antigo
        lastOrderSalgados = getSalgadosCountFromItems(lastOrder.items || []); // Usa a função de utilitários
    }
    clientSince.textContent = `${lastOrderSalgados} Salgados`; // Atualiza o texto do selo
    clientSince.title = `Última compra: ${lastOrderSalgados} salgados`; // Adiciona um tooltip para clareza

    // Adiciona o evento de clique para abrir o histórico
    // Remove o listener antigo antes de adicionar um novo para evitar duplicação
    container.onclick = () => showClientHistoryModal(clientData);

    // NOVO: Esconde a caixa de sugestão da IA quando o selo do cliente é exibido.
    if (dom.pdvAiSuggestions?.container) {
        dom.pdvAiSuggestions.container.classList.add('hidden');
    }

    container.classList.remove('hidden');
    // NOVO: Exibe o cabeçalho "Histórico Cliente"
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
    // Remove o evento de clique para limpar
    container.onclick = null;
    // NOVO: Esconde o cabeçalho "Histórico Cliente"
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

    // Tenta o formato ISO (AAAA-MM-DD), que é o padrão do <input type="date">
    let date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // Tenta o formato brasileiro (DD/MM/AAAA)
    const parts = dateString.split('/');
    if (parts.length === 3) {
        // new Date(year, monthIndex, day)
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
    
    // Apenas executa se houver saldo em aberto e pedidos para verificar
    if (clientData.totalDebt > 0 && clientData.orders && clientData.orders.length > 0) {
        console.log("checkExpiredDebtAndAlert: Cliente tem dívida. Verificando pedidos.");
        
        let foundExpiredDebt = false;

        // Itera sobre TODOS os pedidos e verifica individualmente
        clientData.orders.forEach(order => {
            // Verifica se o pedido está ativo e se o status de pagamento não é "pago"
            const hasDebt = (order.paymentStatus === 'devedor' || (order.restante > 0 && order.restante !== null));
            const isActive = order.status === 'ativo' || order.status === 'alterado';

            if (hasDebt && isActive && order.delivery?.date) {
                const orderDate = parseDateString(order.delivery.date);
                if (orderDate) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    console.log(`Pedido #${order.orderNumber} - Data de entrega: ${orderDate.toISOString()}, Data de hoje: ${today.toISOString()}`);
                    
                    // Verifica se a data de entrega já passou
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

// Configura os event listeners globais e do PDV
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
        // NOVO: Elementos da IA
        // REMOVIDO: Os elementos da IA PDV foram removidos da verificação, pois a caixa de sugestões foi retirada da tela.
    ];

    const allPdvElementsFound = essentialPdvElements.every(el => el !== null && el !== undefined);

    if (!allPdvElementsFound) {
        console.error("setupPdvEventListeners: Um ou mais elementos DOM essenciais do PDV não foram encontrados. Event listeners não serão configurados.");
        essentialPdvElements.forEach(el => {
            if (el === null || el === undefined) {
                // CORREÇÃO: Lógica de log aprimorada para encontrar o nome correto da propriedade.
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
        }
    });

    dom.sinal.addEventListener("blur", (e) => {
        formatInputAsCurrency(e.target);
        let value = parseCurrency(e.target.value);
        value = roundSinal(value);
        e.target.value = formatCurrency(value).replace('R$ ', '');
        calculateTotals();
    });
    // AÇÃO CORRETIVA: Substitui os listeners de 'blur' por 'input' e usa a função
    // debounced para evitar chamadas excessivas à API e o erro 429.
    dom.customerName.addEventListener("input", debouncedClientLookup);
    dom.customerName.addEventListener("blur", (e) => {
        // Formata o nome para o padrão "Nome Sobrenome" ao sair do campo.
        e.target.value = formatNameToTitleCase(e.target.value);

        // Esconde o autocompletar após um pequeno atraso para permitir o clique na sugestão.
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
        // NOVO: A função openInteractiveTimeSelector em manager.js agora gerencia a limpeza
        // dos horários manuais ao detectar uma mudança de data.
    });

    // NOVO: Listener para o autocompletar (usando delegação de eventos)
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
    dom.btnFechar.addEventListener("click", saveOrder);
    dom.btnAtualizar.addEventListener("click", updateOrder);
    dom.btnCancelar.addEventListener("click", cancelOrder);
    dom.btnComprovante.addEventListener("click", () => showTicketModal(pdvCurrentOrder));
    dom.liquidarBtn.addEventListener("click", settleDebt);
    dom.btnAnterior.addEventListener("click", () => navigateOrder(-1));
    dom.btnProximo.addEventListener("click", () => navigateOrder(1));
    dom.searchBtn.addEventListener("click", findOrderById);
    dom.searchInput.addEventListener("keydown", e => { if (e.key === "Enter") findOrderById(); });
    
    // ATUALIZADO: Chama openEmployeeReport do módulo employeeReport.js
    dom.reportBtn.addEventListener("click", () => {
        openEmployeeReport();
    });

    dom.returnToManagerBtn.addEventListener("click", () => {
        if (navigateToManagerView) {
            dom.mainContent.style.display = 'none';
            dom.managerDashboard.style.display = 'flex';
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

        // Pede a senha do novo operador diretamente no PDV
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
            
            // Compara a senha digitada com a senha do funcionário selecionado
            if (selectedEmployee && String(selectedEmployee.password) === String(confirmation.pass)) {
                // Senha correta: Efetua a troca
                showToast(`Sessão iniciada para ${newEmployeeName}.`, "success");
                
                await logUserActivity(originalEmployee.name, 'logout'); // Registra o logout do operador anterior
                setCurrentUser(selectedEmployee); // Atualiza o usuário global da aplicação
                await logUserActivity(newEmployeeName, 'login'); // Registra o login do novo operador
                
            } else {
                // Senha incorreta
                showToast("Senha incorreta. A troca de operador foi cancelada.", "error");
                e.target.value = originalEmployee.name; // Reverte a seleção no dropdown
            }
        } else {
            // O usuário cancelou o pop-up
            console.log("Troca de operador cancelada pelo usuário.");
            e.target.value = originalEmployee.name; // Reverte a seleção no dropdown
        }
    });

    // NOVO: Lógica para o botão de limpar o campo de horário
    const deliveryTimeInput = dom.deliveryTime;
    const clearDeliveryTimeBtn = document.getElementById('clear-delivery-time-btn');

    if (deliveryTimeInput && clearDeliveryTimeBtn) {
        const checkTimeValue = () => {
            const hasValue = !!deliveryTimeInput.value;
            clearDeliveryTimeBtn.classList.toggle('hidden', !hasValue);
        };

        // Ouve o evento 'input', que será disparado tanto pela digitação do usuário
        // quanto programaticamente pelo seletor de horário.
        deliveryTimeInput.addEventListener('input', checkTimeValue);

        // Listener para o clique no botão de limpar
        clearDeliveryTimeBtn.addEventListener('click', () => {
            deliveryTimeInput.value = '';
            checkTimeValue(); // Esconde o botão
            // Foca no campo para que o seletor de horário abra novamente
            deliveryTimeInput.focus();
        });
    }

    // NOVO: Listeners para o modal de alteração de senha (garante que sejam adicionados apenas uma vez)
    const { modal, currentPassInput, newPassInput, confirmPassInput, saveBtn, cancelBtn } = dom.changePasswordModal;

    if (dom.changePasswordBtn && modal && !dom.changePasswordBtn.dataset.listenerAttached) {
        dom.changePasswordBtn.addEventListener('click', () => {
            // Limpa os campos e abre o modal
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

    // NOVO: Listeners para o seletor de horário interativo (local correto)
    if (dom.deliveryTime) {
        dom.deliveryTime.addEventListener('focus', (e) => {
            e.preventDefault(); // Impede a abertura do seletor de tempo padrão do navegador
            dom.deliveryTime.blur(); // Tira o foco para evitar que o teclado móvel apareça
            openInteractiveTimeSelector();
        });
    }

    // NOVO: Listener para o botão de limpar carrinho
    const clearCartBtn = document.getElementById('clear-cart-btn');
    if (clearCartBtn) {
        clearCartBtn.addEventListener('click', clearCart);
    } else {
        console.warn("Elemento 'clear-cart-btn' não encontrado. O botão de limpar carrinho não funcionará.");
    }

    const closeTimeSelectorBtn = document.getElementById('interactive-time-selector-close-btn');
    if (closeTimeSelectorBtn) {
        const modal = document.getElementById('interactive-time-selector-modal');
        // Garante que o listener de fechar seja adicionado apenas uma vez
        if (!closeTimeSelectorBtn.dataset.listenerAttached) {
            closeTimeSelectorBtn.addEventListener('click', () => modal.classList.remove('active'));
            closeTimeSelectorBtn.dataset.listenerAttached = 'true';
        }
    }
}
