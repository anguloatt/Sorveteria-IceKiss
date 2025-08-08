import { formatCurrency, getProductInfoById } from './utils.js';

const liveOrderItemsContainer = document.getElementById('live-order-items');
const liveOrderTotalEl = document.getElementById('live-order-total');
const liveOrderKibeWarning = document.getElementById('live-order-kibe-warning');
const liveOrderPlaceholder = document.getElementById('live-order-placeholder');

/**
 * Para cada item do pedido, eu crio e retorno o elemento HTML
 * que será exibido no painel de resumo.
 * @param {object} item - O objeto do item do pedido que vou processar.
 * @returns {HTMLDivElement} O elemento div do item, pronto para ser exibido.
 */
function createLiveOrderItemElement(item) {
    const itemEl = document.createElement('div');
    itemEl.className = 'live-order-item animate-fade-in';

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
 * Esta é a minha função principal para atualizar o painel de resumo.
 * Eu a exporto para que outros módulos (como o pdv.js) possam chamá-la
 * sempre que o pedido mudar.
 * @param {object} order - O objeto do pedido atual que uso para atualizar a tela.
 */
export function updateLiveSummary(order) {
    if (!liveOrderItemsContainer || !liveOrderTotalEl || !liveOrderPlaceholder || !liveOrderKibeWarning) return;

    liveOrderItemsContainer.innerHTML = '';
    const items = order?.items || [];

    liveOrderPlaceholder.classList.toggle('hidden', items.length > 0);

    items.forEach(item => {
        liveOrderItemsContainer.appendChild(createLiveOrderItemElement(item));
    });

    // Aqui, em vez de mostrar o total em R$, eu calculo e exibo a contagem total de salgados.
    const totalSalgados = items.reduce((acc, item) => {
        // Para a contagem de "salgados", considero fritos, assados e também os de revenda.
        if (item.category === 'fritos' || item.category === 'assados' || item.category === 'revenda') {
            return acc + (item.quantity || 0);
        }
        return acc;
    }, 0);

    // NOVO: Verifica se há "Kibe" no pedido e exibe o aviso.
    const hasKibe = items.some(item => item.name.toLowerCase().includes('kibe'));
    liveOrderKibeWarning.classList.toggle('hidden', !hasKibe);

    liveOrderTotalEl.textContent = totalSalgados;

    // Lógica para destacar o total de salgados se passar de 100.
    const isOverloaded = totalSalgados > 100;
    liveOrderTotalEl.classList.toggle('text-red-600', isOverloaded);
    liveOrderTotalEl.classList.toggle('animate-pulse', isOverloaded);
    liveOrderTotalEl.classList.toggle('text-gray-800', !isOverloaded);
}
