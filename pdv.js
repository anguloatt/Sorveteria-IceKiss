// pdv.js - Lógica e funcionalidades do Ponto de Venda (PDV)

import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
// NOVO: Importa a função para atualizar o painel de resumo em tempo real
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
    printReminderList // Esta função agora usa generatePrintableReminderText internamente
} from './utils.js'; // Importa funções utilitárias
import {
    currentUser, currentOrder, productsConfig, storeSettings, getNextOrderNumber, peekNextOrderNumber, employees, setCurrentUser,
    managerCredentials, masterCredentials, currentReminderOrders
} from './app.js'; // Importa variáveis globais do app.js
import {
    saveOrder as firebaseSaveOrder, updateOrder as firebaseUpdateOrder,
    cancelOrder as firebaseCancelOrder, settleDebt as firebaseSettleDebt, logUserActivity,
    findOrder as firebaseFindOrder, updateBackupCSV, checkForDailyDeliveries, createNotification, findLastOrder, serverTimestamp,
    findNextOrder as firebaseFindNextOrder, findPreviousOrder as firebaseFindPreviousOrder, changeEmployeePassword, findClientByPhone, findClientByName,
    updateProductStock
} from './firebaseService.js'; // Importa funções de serviço Firebase

// Importa funções do gerente que podem ser chamadas do PDV
import { handleManagerAccess, navigateToManagerView, openInteractiveTimeSelector, calculateWindowLoad } from './manager.js';

// Importa a função para abrir o relatório do funcionário
import { openEmployeeReport } from './employeeReport.js';

// NOVO: Importa o serviço de IA e a biblioteca para renderizar Markdown
import { generatePdvSuggestion } from './aiService.js';
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

// Variável local para o pedido atual no PDV
let pdvCurrentOrder = null;
// NOVO: Timer para o debounce da sugestão da IA, para evitar chamadas excessivas.
let suggestionDebounceTimer = null;

// Renderiza os produtos no PDV com o novo layout de colunas
export function renderProducts() {
    console.log("renderProducts: Iniciando renderização dos produtos.");
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

// Calcula os totais do pedido
export function calculateTotals() {
    let total = 0;
    const items = [];
    document.querySelectorAll('#pdv-cardapio-grid .cardapio-item').forEach(el => {
        const quantityInput = el.querySelector('.product-quantity');
        if (quantityInput && !quantityInput.disabled) {
            let quantity = parseInt(quantityInput.value) || 0;

            // NOVO: Adiciona ou remove as classes de destaque com base na quantidade
            if (quantity > 0) {
                // Adiciona classes do Tailwind para destacar o campo
                quantityInput.classList.add('bg-yellow-100', 'border-2', 'border-amber-500', 'font-bold', 'text-amber-700');
            } else {
                // Remove as classes de destaque se a quantidade for zero
                quantityInput.classList.remove('bg-yellow-100', 'border-2', 'border-amber-500', 'font-bold', 'text-amber-700');
            }

            if (quantity > 0) {
                const id = el.dataset.productId;
                const category = el.dataset.productCategory;
                let product = null;
                
                if (productsConfig && productsConfig[category]) {
                    product = productsConfig[category].find(p => p.id === id);
                }

                if (product) {
                    // VERIFICAÇÃO DE ESTOQUE
                    if (typeof product.stock === 'number' && quantity > product.stock) {
                        showToast(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock}`, 'error');
                        quantity = product.stock; // Corrige a quantidade para o máximo disponível
                        quantityInput.value = quantity; // Atualiza o campo na tela
                    }

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
                            stock: product.stock // Passa a informação de estoque junto
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
    console.log("startNewOrder: Iniciando novo pedido.");
    // PASSO 1: Apenas "espia" o próximo número para exibir na tela, sem consumi-lo.
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
    // NOVO: Gera uma sugestão de IA ao iniciar um novo pedido
    generatePdvAISuggestion(null); // Passa null para indicar novo cliente/pedido
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
    
    // NOVO: Gera uma sugestão de IA ao carregar um pedido existente
    // NOTA: A lógica anterior foi movida para dentro da verificação do cliente para evitar conflitos com o selo.
    // A função generatePdvAISuggestion agora é chamada apenas se o selo não for exibido.
    // Se o cliente for encontrado e o selo for exibido, a sugestão da IA é escondida.
    // Se o cliente não for encontrado, a sugestão da IA é exibida.
    // O código acima já lida com essa lógica, então não precisamos de uma chamada explícita aqui.
    console.log("loadOrderIntoForm: Pedido carregado com sucesso.");
}

// Salva um novo pedido
async function saveOrder() {
    console.log("saveOrder: Tentando finalizar pedido...");
    calculateTotals();
    if (!validateForm(true)) return;

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

// Lógica de salvamento real, separada para ser chamada após a verificação
async function _executeSaveOrder() {
    // Isso garante que o número só seja consumido se o pedido for realmente salvo.
    // CORREÇÃO DE SEGURANÇA: Pega o operador do seletor, em vez de usar o usuário logado.
    // Isso garante que a venda seja atribuída corretamente, sem alterar o usuário autenticado.
    const operatorName = dom.employeeSwitcherSelect.value;
    const operator = employees.find(e => e.name === operatorName) || currentUser;

    const roundedSinal = roundSinal(parseCurrency(dom.sinal.value));
    pdvCurrentOrder.sinal = roundedSinal;
    pdvCurrentOrder.restante = pdvCurrentOrder.total - roundedSinal;
    pdvCurrentOrder.paymentStatus = (pdvCurrentOrder.total > 0 && pdvCurrentOrder.restante <= 0.01) ? 'pago' : 'devedor';

    // CORREÇÃO CRÍTICA: Converte a data YYYY-MM-DD para DD/MM/YYYY sem usar new Date()
    // para evitar problemas de fuso horário que salvavam o pedido no dia anterior.
    const deliveryDateValue = dom.deliveryDate.value;
    let deliveryDateFormatted = '';
    if (deliveryDateValue) {
        const [year, month, day] = deliveryDateValue.split('-');
        deliveryDateFormatted = `${day}/${month}/${year}`;
    }

    const orderData = {
        ...pdvCurrentOrder,
        status: 'ativo',
        // CORREÇÃO: Salva o telefone exatamente como está no campo (já formatado por formatPhone)
        customer: { name: dom.customerName.value, phone: dom.customerPhone.value }, 
        // Usa a data formatada corretamente, garantindo que "29/07/2024" seja salvo como "29/07/2024"
        // CORREÇÃO: Adiciona .trim() para remover espaços em branco antes de salvar.
        delivery: { date: deliveryDateFormatted, time: dom.deliveryTime.value.trim() },
        createdBy: { id: operator.id, name: operator.name, role: operator.role },
        createdAt: serverTimestamp()
    };
    console.log("saveOrder: Dados do pedido a serem salvos:", orderData);
    try {
        // Passo 1: Salva o pedido no banco de dados
        const savedOrder = await firebaseSaveOrder(orderData);
        
        // Passo 2: Dá baixa no estoque para cada item do pedido
        showToast("Dando baixa no estoque...", "info", 2000);
        for (const item of savedOrder.items) {
            await updateProductStock(item.id, -item.quantity, 'Venda', savedOrder.orderNumber);
        }

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
        pdvCurrentOrder = savedOrder;
        showTicketModal(pdvCurrentOrder);
        startNewOrder();
        console.log("saveOrder: Pedido finalizado com sucesso.");
    } catch (error) {
        console.error("saveOrder: Erro ao finalizar pedido:", error);
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
    const operator = employees.find(e => e.name === operatorName) || currentUser;

    const roundedSinal = roundSinal(parseCurrency(dom.sinal.value));
    pdvCurrentOrder.sinal = roundedSinal;
    pdvCurrentOrder.restante = pdvCurrentOrder.total - roundedSinal;
    pdvCurrentOrder.paymentStatus = (pdvCurrentOrder.total > 0 && pdvCurrentOrder.restante <= 0.01) ? 'pago' : 'devedor';

    // CORREÇÃO CRÍTICA: Converte a data YYYY-MM-DD para DD/MM/YYYY sem usar new Date()
    // para evitar problemas de fuso horário que salvavam o pedido no dia anterior.
    const deliveryDateValue = dom.deliveryDate.value;
    let deliveryDateFormatted = '';
    if (deliveryDateValue) {
        const [year, month, day] = deliveryDateValue.split('-');
        deliveryDateFormatted = `${day}/${month}/${year}`;
    }

    const orderData = {
        ...pdvCurrentOrder,
        status: 'alterado',
        // CORREÇÃO: Salva o telefone exatamente como está no campo (já formatado por formatPhone)
        customer: { name: dom.customerName.value, phone: dom.customerPhone.value }, 
        // Usa a data formatada corretamente, garantindo que "29/07/2024" seja salvo como "29/07/2024"
        // CORREÇÃO: Adiciona .trim() para remover espaços em branco antes de salvar.
        delivery: { date: deliveryDateFormatted, time: dom.deliveryTime.value.trim() },
        updatedAt: serverTimestamp(),
        updatedBy: { id: operator.id, name: operator.name, role: operator.role }
    };

    // Acessa firebase.firestore.FieldValue.delete() via db
    // CORREÇÃO: Substituído `firebase.firestore.FieldValue.delete()` por `deleteField()`
    if (pdvCurrentOrder.managerOverrideEdit) {
        orderData.managerOverrideEdit = deleteField(); 
    }
    console.log("updateOrder: Dados do pedido a serem atualizados:", orderData);
    try {
        await firebaseUpdateOrder(pdvCurrentOrder.id, orderData);
        pdvCurrentOrder = orderData;
        updateStatusLabel('alterado', 'Pedido Alterado');
        showTicketModal(pdvCurrentOrder);
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
        
        // Passo 2: Devolve os itens ao estoque
        showToast("Devolvendo itens ao estoque...", "info", 2000);
        for (const item of pdvCurrentOrder.items) {
            await updateProductStock(item.id, item.quantity, 'Cancelamento', pdvCurrentOrder.orderNumber);
        }

        // Passo 3: Atualiza a interface e o backup
        pdvCurrentOrder.status = 'cancelado';
        updateStatusLabel('cancelado', 'Cancelado');
        await updateBackupCSV(pdvCurrentOrder);
        showToast(`Pedido ${pdvCurrentOrder.orderNumber} cancelado e estoque devolvido.`, "success");
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
        await updateBackupCSV(pdvCurrentOrder);
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
    // NOVO: Esconde o selo do cliente ao limpar o formulário
    hideClientSeal();
    console.log("clearForm: Formulário limpo.");
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
    const nameParts = dom.customerName.value.trim().split(' ');
    if (nameParts.length < 2 || nameParts.some(part => part === '') || dom.customerName.value.trim().length < 3) {
        errors.push({ field: dom.customerName, message: "Por favor, insira o nome e sobrenome do cliente." });
    }

    // 2. Validação do Telefone
    // A validação agora considera o formato com máscara
    const phoneValue = dom.customerPhone.value.trim();
    const rawPhone = phoneValue.replace(/\D/g, '');
    if (rawPhone.length < 10 || rawPhone.length > 11 || !phoneValue.match(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)) {
        errors.push({ field: dom.customerPhone, message: "O telefone deve estar no formato (XX) XXXXX-XXXX." });
    }

    // 3. Validação da Data de Retirada
    if (!dom.deliveryDate.value.trim()) {
        errors.push({ field: dom.deliveryDate, message: "A data de retirada é obrigatória." });
    } else {
        const deliveryDate = new Date(dom.deliveryDate.value + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
        if (deliveryDate < today) {
            errors.push({ field: dom.deliveryDate, message: "A data de retirada não pode ser no passado." });
        }
    }

    // 4. Validação da Hora de Retirada
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!dom.deliveryTime.value.trim()) {
        errors.push({ field: dom.deliveryTime, message: "A hora da retirada é obrigatória." });
    } else if (!timeRegex.test(dom.deliveryTime.value)) {
        errors.push({ field: dom.deliveryTime, message: "Formato de hora inválido. Use HH:MM." });
    }

    // 5. Validação dos Itens do Pedido
    if (!pdvCurrentOrder || pdvCurrentOrder.items.length === 0) {
        errors.push({ message: "Adicione ao menos um item ao pedido." });
    }

    // Se houver erros, destaca os campos e mostra o primeiro erro
    if (errors.length > 0) {
        console.warn("validateForm: Erros de validação encontrados:", errors);
        errors.forEach(error => error.field?.classList.add('invalid-field'));
        showToast(errors[0].message, "error");
        errors[0].field?.focus();
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
    const isNew = pdvCurrentOrder.status === 'novo';
    const isActive = ['ativo', 'alterado'].includes(pdvCurrentOrder.status);
    const isCancelled = pdvCurrentOrder.status === 'cancelado';
    const isPaid = pdvCurrentOrder.paymentStatus === 'pago';
    
    const buttonsToCheck = [
        dom.btnFechar, dom.btnAtualizar, dom.btnCancelar,
        dom.btnComprovante, dom.liquidarBtn
    ];

    buttonsToCheck.forEach(btn => {
        if (btn) {
            let disabled = false;
            let title = '';

            if (btn === dom.btnFechar) {
                disabled = !isNew;
                title = 'Finalizar Pedido';
            } else if (btn === dom.btnAtualizar) {
                disabled = !isActive;
                title = 'Atualizar Pedido';
            } else if (btn === dom.btnCancelar) {
                disabled = !isActive;
                title = 'Cancelar Pedido';
            } else if (btn === dom.btnComprovante) {
                disabled = isNew || isCancelled;
                title = 'Gerar Comprovante';
            } else if (btn === dom.liquidarBtn) {
                disabled = !isActive || isPaid;
                title = 'Liquidar Saldo';
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
    const requiredElements = [
        dom.reminder.modal,
        dom.reminder.date,
        dom.reminder.summaryItems,
        dom.reminder.ordersList,
        dom.reminder.closeBtn,
        dom.reminder.printBtn
    ];

    const allElementsFound = requiredElements.every(el => el !== null && el !== undefined);

    if (!allElementsFound) {
        console.error("showReminderModal: Um ou mais elementos do modal de lembrete não foram encontrados. Verifique os IDs no HTML e a inicialização do objeto 'dom'.");
        requiredElements.forEach((el, index) => {
            if (el === null || el === undefined) {
                const propName = Object.keys(dom.reminder).find(key => dom.reminder[key] === el);
                console.error(`Elemento do modal de lembrete essencial não encontrado: dom.reminder.${propName}`);
            }
        });
        return;
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
        lastOrderSalgados = getSalgadosCountFromItems(lastOrder.items); // Usa a função de utilitários
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
 * NOVO: Gera uma sugestão de IA para o PDV com base no contexto atual.
 * @param {object|null} clientData O objeto completo do cliente, se disponível.
 */
function generatePdvAISuggestion(clientData = null) {
    const { container, text: suggestionTextEl, loader } = dom.pdvAiSuggestions;
    if (!container || !suggestionTextEl || !loader) {
        console.warn("Elementos da sugestão da IA no PDV não encontrados. Funcionalidade desativada.");
        return;
    }

    // Limpa qualquer chamada anterior que ainda não tenha sido executada
    clearTimeout(suggestionDebounceTimer);

    // NOVO: Esconde o selo do cliente quando a caixa de sugestão da IA é exibida.
    hideClientSeal(); 

    // Mostra o loader imediatamente para uma melhor experiência do usuário
    container.classList.remove('hidden');
    suggestionTextEl.innerHTML = '';
    loader.classList.remove('hidden');

    // Agenda a execução da chamada à IA para daqui a 500ms
    suggestionDebounceTimer = setTimeout(async () => {
        let prompt = `Você é um assistente de vendas da Ice Kiss. Forneça uma sugestão curta e útil para o atendente, baseada no contexto abaixo. Seja direto e use no máximo 2 frases.`;
        
        if (clientData && clientData.orderCount > 0) {
            // Cliente recorrente
            prompt += `\n\nEste é um cliente recorrente: ${clientData.name}.`;
            prompt += ` Ele já fez ${clientData.orderCount} pedidos.`;
            if (clientData.totalDebt > 0) {
                prompt += ` Ele tem um débito de ${formatCurrency(clientData.totalDebt)}.`;
                prompt += ` Sugira como abordar a dívida ou como oferecer um desconto para quitar.`;
            } else {
                prompt += ` Ele é um bom pagador. Sugira um produto complementar ou uma oferta para fidelizar.`;
                // Se houver histórico de produtos mais comprados, adicione ao prompt
                if (clientData.orders && clientData.orders.length > 0) {
                    const productFrequency = {};
                    clientData.orders.forEach(order => {
                        (order.items || []).forEach(item => {
                            const productName = item.isManual ? item.name : getProductInfoById(item.id)?.name;
                            if (productName) {
                                productFrequency[productName] = (productFrequency[productName] || 0) + item.quantity;
                            }
                        });
                    });
                    const sortedProducts = Object.entries(productFrequency).sort((a,b) => b[1] - a[1]);
                    if (sortedProducts.length > 0) {
                        prompt += ` Ele costuma comprar ${sortedProducts[0][0]}.`;
                    }
                }
            }
        } else {
            // Novo cliente ou cliente sem histórico de pedidos
            prompt += `\n\nEste é um cliente novo ou sem histórico. Sugira uma saudação de boas-vindas ou uma oferta inicial.`;
        }

        try {
            console.log("generatePdvAISuggestion (debounced): Chamando IA com prompt:", prompt);
            const aiResponse = await generatePdvSuggestion(prompt); // Esta é a chamada para o aiService
            
            if (aiResponse) {
                suggestionTextEl.innerHTML = marked.parse(aiResponse);
            } else {
                // NOVO: Se a resposta for null (IA indisponível), exibe informação do próximo pedido
                // Busca o próximo pedido pendente para exibir no lugar da sugestão da IA
                const nextOrders = currentReminderOrders.filter(order => order.status !== 'cancelado' && order.delivery?.date === getTodayDateString('dd/mm/yyyy'));
                if (nextOrders.length > 0) {
                    const nextOrder = nextOrders[0];
                    const totalSalgadosNextOrder = getSalgadosCountFromItems(nextOrder.items || []);
                    suggestionTextEl.innerHTML = `<i class="fas fa-info-circle mr-2 text-blue-500"></i><span class="text-blue-700">Próximo pedido: #${nextOrder.orderNumber} para ${nextOrder.customer?.name || 'N/A'} às ${nextOrder.delivery?.time || 'N/A'} (${totalSalgadosNextOrder} salgados).</span>`;
                } else {
                    suggestionTextEl.innerHTML = `<i class="fas fa-info-circle mr-2 text-gray-500"></i><span class="text-gray-700">Nenhum pedido pendente para hoje.</span>`;
                }
            }
        } catch (error) {
            console.error("Erro ao gerar sugestão da IA para o PDV (debounced):", error);
            // CORREÇÃO: Exibe mensagem de erro mais explícita
            suggestionTextEl.innerHTML = `<i class="fas fa-exclamation-triangle mr-2 text-red-500"></i><span class="text-red-700">Erro ao gerar sugestão da IA. Por favor, verifique sua conexão ou tente novamente.</span>`;
        } finally {
            loader.classList.add('hidden');
        }
    }, 500); // Atraso de 500ms para evitar chamadas em rajada
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
        dom.pdvAiSuggestions?.container, dom.pdvAiSuggestions?.text, dom.pdvAiSuggestions?.loader
    ];

    const allPdvElementsFound = essentialPdvElements.every(el => el !== null && el !== undefined);

    if (!allPdvElementsFound) {
        console.error("setupPdvEventListeners: Um ou mais elementos DOM essenciais do PDV não foram encontrados. Event listeners não serão configurados.");
        essentialPdvElements.forEach(el => {
            if (el === null || el === undefined) {
                const propName = Object.keys(dom).find(key => dom[key] === el) || Object.keys(dom.pdvAiSuggestions).find(key => dom.pdvAiSuggestions[key] === el);
                console.error(`Elemento PDV essencial não encontrado: dom.reminder.${propName}`);
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
    dom.customerName.addEventListener("blur", async (e) => { // Adicionado 'async'
        const name = formatNameToTitleCase(e.target.value);
        e.target.value = name; // Atualiza o campo com o nome formatado

        // Se o nome for muito curto, esconde o selo e a sugestão
        if (name.length < 3) {
            hideClientSeal();
            if (dom.pdvAiSuggestions?.container) {
                dom.pdvAiSuggestions.container.classList.add('hidden');
            }
            return;
        }

        // Tenta encontrar o cliente pelo nome
        const clientData = await findClientByName(name); // NOVO: Chama findClientByName
        if (clientData) {
            // Cliente encontrado, preenche o telefone se estiver vazio e exibe o selo
            if (!dom.customerPhone.value.trim()) {
                dom.customerPhone.value = clientData.phone || ''; // Atribui o valor diretamente
                formatPhone({ target: dom.customerPhone }); // Chama formatPhone para formatar
            }
            displayClientSeal(clientData); // Exibe o selo e esconde a IA
            // NOVO: Verificação e alerta para saldo em aberto expirado
            checkExpiredDebtAndAlert(clientData);
            // NÃO CHAMA generatePdvAISuggestion AQUI se o cliente foi encontrado,
            // para que o selo permaneça visível.
        } else {
            // Cliente não encontrado, esconde o selo e gera sugestão para novo cliente
            hideClientSeal(); // Esconde o selo
            generatePdvAISuggestion(null); // Exibe a IA (com sugestão ou indisponibilidade)
        }
    });

    dom.customerPhone.addEventListener("input", formatPhone);
    dom.customerPhone.addEventListener("blur", async (e) => {
        const phone = e.target.value; // Pega o telefone como está no campo (já formatado)
        // Esconde o selo se o telefone for curto (após remover não-dígitos para validação)
        if (phone.replace(/\D/g, '').length < 10) {
            hideClientSeal();
            // AJUSTE: Limpa o campo de nome se o telefone for muito curto ou removido
            dom.customerName.value = '';
            // NOVO: Esconde a sugestão da IA se o telefone for limpo ou inválido
            if (dom.pdvAiSuggestions?.container) {
                dom.pdvAiSuggestions.container.classList.add('hidden');
            }
            return;
        }

        const clientData = await findClientByPhone(phone); // Passa o telefone formatado para a busca
        if (clientData) {
            // Cliente encontrado, preenche o nome se estiver vazio e exibe o selo
            if (!dom.customerName.value.trim()) {
                dom.customerName.value = formatNameToTitleCase(clientData.name);
            }
            displayClientSeal(clientData); // Exibe o selo e esconde a IA
            // NOVO: Verificação e alerta para saldo em aberto expirado
            checkExpiredDebtAndAlert(clientData);
            // NÃO CHAMA generatePdvAISuggestion AQUI se o cliente foi encontrado,
            // para que o selo permaneça visível.
        } else {
            // Cliente não encontrado, esconde o selo
            hideClientSeal();
            // AJUSTE: Limpa o campo de nome se o cliente não for encontrado
            dom.customerName.value = '';
            // NOVO: Gera uma sugestão de IA para novo cliente
            generatePdvAISuggestion(null); // Exibe a IA (com sugestão ou indisponibilidade)
        }
    });
    
    dom.deliveryDate.addEventListener("change", (e) => {
        updateWeekdayDisplay(e.target.value);
        // NOVO: A função openInteractiveTimeSelector em manager.js agora gerencia a limpeza
        // dos horários manuais ao detectar uma mudança de data.
    });
    
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
            navigateToManagerView('dashboard');
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
