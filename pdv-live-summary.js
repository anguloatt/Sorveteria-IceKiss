// pdv-live-summary.js - Módulo para atualizar o painel de resumo do pedido em tempo real.

import { formatCurrency, getProductInfoById } from './utils.js';

// Referências aos elementos do DOM para evitar múltiplas buscas
const liveOrderItemsContainer = document.getElementById('live-order-items');
const liveOrderTotalEl = document.getElementById('live-order-total');
const liveOrderPlaceholder = document.getElementById('live-order-placeholder');

/**
 * Renderiza um único item no painel de resumo.
 * @param {object} item - O item do pedido.
 * @returns {HTMLDivElement} O elemento div do item.
 */
function createLiveOrderItemElement(item) {
    const itemEl = document.createElement('div');
    // Usa a classe de estilo definida no style.css e adiciona uma classe para animação
    itemEl.className = 'live-order-item animate-fade-in';

    // Obtém o nome do produto, seja ele manual ou do cardápio
    const productName = item.isManual ? item.name : getProductInfoById(item.id)?.name || 'Produto não encontrado';

    itemEl.innerHTML = `
        <div class="item-name">
            <span class="font-normal text-gray-500">${item.quantity}x</span> ${productName}
        </div>
        <div class="font-mono text-gray-600">${formatCurrency(item.subtotal)}</div>
    `;
    return itemEl;
}

/**
 * Atualiza o painel de resumo do pedido com os dados mais recentes.
 * Esta função é exportada para ser chamada de outros módulos (como o pdv.js) sempre que o pedido for alterado.
 * @param {object} order - O objeto do pedido atual.
 */
export function updateLiveSummary(order) {
    if (!liveOrderItemsContainer || !liveOrderTotalEl || !liveOrderPlaceholder) return;

    liveOrderItemsContainer.innerHTML = '';
    const items = order?.items || [];

    liveOrderPlaceholder.classList.toggle('hidden', items.length > 0);

    items.forEach(item => {
        liveOrderItemsContainer.appendChild(createLiveOrderItemElement(item));
    });

    // ALTERAÇÃO: Em vez de mostrar o total em R$, mostra a contagem de salgados.
    const totalSalgados = (items || []).reduce((acc, item) => {
        // A contagem de "salgados" inclui fritos, assados e itens de revenda,
        // para refletir o volume total do pedido.
        if (item.category === 'fritos' || item.category === 'assados' || item.category === 'revenda') {
            return acc + (item.quantity || 0);
        }
        return acc;
    }, 0);

    // Altera o rótulo e o valor
    const labelEl = liveOrderTotalEl.previousElementSibling;
    if (labelEl) {
        labelEl.textContent = 'Total de Salgados:';
    }
    liveOrderTotalEl.textContent = totalSalgados;

    // NOVO: Adiciona a lógica de cor condicional para o total de salgados.
    if (totalSalgados > 100) {
        liveOrderTotalEl.classList.remove('text-gray-800');
        liveOrderTotalEl.classList.add('text-red-600', 'animate-pulse'); // Adiciona um pulso para chamar atenção
    } else {
        liveOrderTotalEl.classList.remove('text-red-600', 'animate-pulse');
        liveOrderTotalEl.classList.add('text-gray-800');
    }
}