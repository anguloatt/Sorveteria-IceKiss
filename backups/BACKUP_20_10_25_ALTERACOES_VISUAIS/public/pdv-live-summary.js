import { formatCurrency, getProductInfoById } from './utils.js';

const liveOrderItemsContainer = document.getElementById('live-order-items');
const liveOrderTotalEl = document.getElementById('live-order-total');
const liveOrderKibeWarning = document.getElementById('live-order-kibe-warning');
const liveOrderPlaceholder = document.getElementById('live-order-placeholder');

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

export function updateLiveSummary(order) {
    if (!liveOrderItemsContainer || !liveOrderTotalEl || !liveOrderPlaceholder || !liveOrderKibeWarning) return;

liveOrderItemsContainer.innerHTML = '';
    const items = order?.items || [];

liveOrderPlaceholder.classList.toggle('hidden', items.length > 0);

items.forEach(item => {
        liveOrderItemsContainer.appendChild(createLiveOrderItemElement(item));
    });

const totalSalgados = items.reduce((acc, item) => {
        if (item.category === 'fritos' || item.category === 'assados' || item.category === 'revenda') {
            return acc + (item.quantity || 0);
        }
        return acc;
    }, 0);

const hasKibe = items.some(item => item.name.toLowerCase().includes('kibe'));
    liveOrderKibeWarning.classList.toggle('hidden', !hasKibe);

liveOrderTotalEl.textContent = totalSalgados;

const isOverloaded = totalSalgados > 100;
    liveOrderTotalEl.classList.toggle('text-red-600', isOverloaded);
    liveOrderTotalEl.classList.toggle('animate-pulse', isOverloaded);
    liveOrderTotalEl.classList.toggle('text-gray-800', !isOverloaded);
}

