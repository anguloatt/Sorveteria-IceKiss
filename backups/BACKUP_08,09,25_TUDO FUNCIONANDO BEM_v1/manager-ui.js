import { dom } from './domRefs.js';

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

