// manager-realtime.js - Módulo para gerenciar atualizações em tempo real no painel do gerente.

import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { db } from './app.js'; // Importa a instância do DB a partir do módulo principal

// Referência para o corpo da tabela de pedidos no painel do gerente
const managerOrdersTableBody = document.getElementById('manager-orders-table-body');

// Usamos um Map para associar o ID de um pedido à sua linha <tr> na tabela.
// Isso torna a atualização e remoção de linhas muito mais eficiente.
const orderRowMap = new Map();

// Variável para guardar a função de unsubscribe e evitar múltiplos listeners
let unsubscribeOrders = null;

/**
 * Cria ou atualiza uma linha <tr> na tabela de pedidos do gerente.
 * @param {object} orderData - Os dados completos do pedido, incluindo seu ID.
 * @returns {HTMLTableRowElement} O elemento <tr> criado ou atualizado.
 */
function createOrUpdateOrderRow(orderData) {
    const orderId = orderData.id;
    // Verifica se a linha já existe no nosso Map
    const existingRow = orderRowMap.get(orderId);
    const row = existingRow || document.createElement('tr');

    // Adiciona um ID e um cursor para indicar que a linha é clicável
    row.id = `order-row-${orderId}`;
    row.style.cursor = 'pointer';

    // Formatação dos dados para exibição amigável
    const formattedDate = new Date(orderData.dataSolicitacao.seconds * 1000).toLocaleDateString('pt-BR');
    const formattedValue = `R$ ${orderData.valorAPagar.toFixed(2).replace('.', ',')}`;
    
    // Define a cor e o texto do status do pedido
    let statusClass = '';
    let statusText = '';
    switch (orderData.status) {
        case 'pago':
            statusClass = 'text-green-600';
            statusText = 'Pago';
            break;
        case 'cancelado':
            statusClass = 'text-gray-500 line-through';
            statusText = 'Cancelado';
            break;
        default: // 'devedor' ou outros
            statusClass = 'text-red-600';
            statusText = 'Em Aberto';
    }

    // Preenche o HTML da linha com os dados do pedido
    row.innerHTML = `
        <td class="py-2 px-3 border-b border-gray-200">${orderData.numeroPedido}</td>
        <td class="py-2 px-3 border-b border-gray-200">${formattedDate}</td>
        <td class="py-2 px-3 border-b border-gray-200 font-medium">${orderData.cliente.nome}</td>
        <td class="py-2 px-3 border-b border-gray-200 font-bold">${formattedValue}</td>
        <td class="py-2 px-3 border-b border-gray-200 font-semibold ${statusClass}">${statusText}</td>
        <td class="py-2 px-3 border-b border-gray-200">${orderData.vendedor}</td>
        <td class="py-2 px-3 border-b border-gray-200">${orderData.recebedor || '--'}</td>
    `;

    // Adiciona o evento de clique para abrir o modal de detalhes (se necessário)
    row.onclick = () => {
        console.log(`Abrir detalhes do pedido: ${orderId}`);
        // Aqui você chamaria a função que abre o modal de detalhes do pedido, ex:
        // openManagerOrderDetailModal(orderId);
    };

    // Se a linha é nova, a adicionamos ao nosso Map de controle
    if (!existingRow) {
        orderRowMap.set(orderId, row);
    }
    
    return row;
}

/**
 * Inicia o "ouvinte" de pedidos em tempo real.
 * Esta função deve ser chamada quando a view de pedidos do gerente é exibida.
 */
export function setupRealtimeOrderListener() {
    // Prevenção: Se o listener já estiver ativo, não faz nada.
    if (unsubscribeOrders) {
        console.log("Listener de pedidos em tempo real já está ativo.");
        return;
    }

    const ordersRef = collection(db, 'pedidos');
    const q = query(ordersRef, orderBy('dataSolicitacao', 'desc'));

    console.log("Iniciando listener de pedidos em tempo real...");

    unsubscribeOrders = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const orderData = { id: change.doc.id, ...change.doc.data() };

            if (change.type === "added") {
                const newRow = createOrUpdateOrderRow(orderData);
                managerOrdersTableBody.prepend(newRow); // Adiciona no topo da lista
            }
            if (change.type === "modified") {
                createOrUpdateOrderRow(orderData); // A função já sabe como atualizar uma linha existente
            }
            if (change.type === "removed") {
                const rowToRemove = orderRowMap.get(orderData.id);
                if (rowToRemove) {
                    rowToRemove.remove();
                    orderRowMap.delete(orderData.id);
                }
            }
        });
    });
}