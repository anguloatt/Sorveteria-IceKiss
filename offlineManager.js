// Módulo para gerenciar o estado offline, cache de dados e sincronização.

import { showToast } from './utils.js';
// CORREÇÃO: Importa 'db' diretamente de 'firebase-config.js' para resolver o erro de exportação.
import { db } from './firebase-config.js';
import {
    fetchAllProductsWithStock,
    saveOrder as firebaseSaveOrder,
    serverTimestamp,
    createNotification,
    upsertClientOnOrder
} from './firebaseService.js';

const PENDING_ORDERS_KEY = 'pendingOrders';
const CACHED_PRODUCTS_KEY = 'cachedProducts';
const CACHED_SETTINGS_KEY = 'cachedSettings';

let isOnline = navigator.onLine;

/**
 * Inicializa o gerenciador offline.
 * Adiciona listeners para detectar mudanças no status da conexão.
 */
export function initOfflineManager() {
    updateOnlineStatusUI();
    updatePendingOrdersUI(); // NOVO: Verifica se há pedidos pendentes na inicialização

    window.addEventListener('online', () => {
        isOnline = true;
        updateOnlineStatusUI();
        showToast('Você está online novamente. Sincronizando dados...', 'success');
        syncPendingOrders();
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        updateOnlineStatusUI();
        showToast('Conexão perdida. Entrando em modo offline.', 'warning');
    });

    console.log('Offline Manager inicializado.');
}

/**
 * Retorna o status atual da conexão.
 * @returns {boolean} True se estiver online, false caso contrário.
 */
export function isAppOnline() {
    return isOnline;
}

/**
 * Atualiza o indicador visual de status online/offline na interface.
 */
function updateOnlineStatusUI() {
    const onlineIndicator = document.getElementById('pdv-employee-online-status');
    const offlineIndicator = document.getElementById('offline-indicator');

    if (onlineIndicator) onlineIndicator.classList.toggle('hidden', !isOnline);
    if (offlineIndicator) offlineIndicator.classList.toggle('hidden', isOnline);
}

/**
 * NOVO: Atualiza o contador visual de pedidos pendentes na interface.
 */
function updatePendingOrdersUI() {
    const counterContainer = document.getElementById('pending-orders-counter');
    const countEl = document.getElementById('pending-orders-count');
    if (!counterContainer || !countEl) return;

    const pendingOrders = getPendingOrders();
    const count = pendingOrders.length;

    if (count > 0) {
        countEl.textContent = count;
        counterContainer.classList.remove('hidden');
    } else {
        counterContainer.classList.add('hidden');
    }
}

/**
 * Busca os dados mais recentes do Firebase e os salva no localStorage.
 * Isso deve ser chamado quando o app está online, na inicialização.
 */
export async function cacheEssentialData() {
    if (!isAppOnline()) {
        console.log('Offline. Usando dados do cache existente.');
        return;
    }

    try {
        console.log('Online. Fazendo cache dos dados essenciais...');
        // CORREÇÃO: Importa dinamicamente para obter as configurações e evitar dependência circular com app.js.
        const { storeSettings } = await import('./app.js');

        // CORREÇÃO: Usa a função correta 'fetchAllProductsWithStock' que não precisa do argumento 'db'.
        const products = await fetchAllProductsWithStock();

        // Salva como texto JSON no localStorage
        localStorage.setItem(CACHED_PRODUCTS_KEY, JSON.stringify(products));
        // CORREÇÃO: Salva as configurações carregadas do app.js.
        localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(storeSettings));

        console.log('Cache de produtos e configurações atualizado com sucesso.');
    } catch (error) {
        console.error('Erro ao fazer cache dos dados essenciais:', error);
        showToast('Erro ao atualizar dados locais para modo offline.', 'error');
    }
}

/**
 * NOVO: Busca os produtos do cache local (localStorage).
 * @returns {Array|null} A lista de produtos ou null se não houver cache.
 */
export function getCachedProducts() {
    const cachedData = localStorage.getItem(CACHED_PRODUCTS_KEY);
    if (cachedData) {
        try {
            return JSON.parse(cachedData);
        } catch (e) {
            console.error("Erro ao parsear produtos do cache:", e);
            return null;
        }
    }
    return null;
}

/**
 * Adiciona um pedido à fila de sincronização no localStorage.
 * @param {object} orderData - O objeto do pedido a ser salvo.
 */
export function queueOrderForSync(orderData) {
    console.log('MODO OFFLINE: Pedido enfileirado para sincronização:', orderData);
    try {
        const pendingOrders = getPendingOrders();
        // Adiciona um ID temporário para o pedido offline e um timestamp
        const offlineOrder = {
            ...orderData,
            offlineId: `offline_${Date.now()}`,
            queuedAt: new Date().toISOString()
        };
        pendingOrders.push(offlineOrder);
        localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(pendingOrders));
        updatePendingOrdersUI(); // NOVO: Atualiza o contador após enfileirar um pedido
    } catch (error) {
        console.error("Erro ao enfileirar pedido para sincronização:", error);
        showToast("Falha ao salvar o pedido localmente.", "error");
    }
}

/**
 * NOVO: Retorna a lista de pedidos pendentes do localStorage.
 * @returns {Array} A lista de pedidos pendentes.
 */
function getPendingOrders() {
    const pending = localStorage.getItem(PENDING_ORDERS_KEY);
    if (pending) {
        try {
            return JSON.parse(pending);
        } catch (e) {
            console.error("Erro ao parsear pedidos pendentes:", e);
            // Se o JSON estiver corrompido, limpa para evitar mais erros.
            localStorage.removeItem(PENDING_ORDERS_KEY);
            return [];
        }
    }
    return [];
}

/**
 * Sincroniza os pedidos pendentes do localStorage com o Firebase.
 * É chamada quando o aplicativo volta a ficar online.
 */
async function syncPendingOrders() {
    const pendingOrders = getPendingOrders();

    if (pendingOrders.length === 0) {
        console.log('Sincronização: Nenhum pedido pendente para sincronizar.');
        return;
    }

    showToast(`Sincronizando ${pendingOrders.length} pedido(s) pendente(s)...`, 'info', 5000);

    // Importa dinamicamente para quebrar a dependência circular com app.js
    const { getNextOrderNumber } = await import('./app.js');

    const remainingOrders = [];
    let successCount = 0;
    let failureCount = 0;

    // Processa os pedidos um por um para obter um número de pedido novo para cada um.
    for (const offlineOrder of pendingOrders) {
        try {
            const newOrderNumber = await getNextOrderNumber();

            const finalOrderData = {
                ...offlineOrder,
                orderNumber: parseInt(newOrderNumber, 10),
                status: 'ativo', // Muda o status de 'pendente_sync' para 'ativo'
                createdAt: serverTimestamp(), // Usa o timestamp do servidor
                syncedAt: serverTimestamp(), // Adiciona um timestamp de sincronização para rastreamento
                isOfflineOrder: true // Adiciona uma flag para identificar que foi um pedido offline
            };

            // Remove os campos temporários do pedido offline
            delete finalOrderData.offlineId;
            delete finalOrderData.queuedAt;

            // Salva o pedido no Firebase e executa ações pós-salvamento
            const savedOrder = await firebaseSaveOrder(finalOrderData);
            await upsertClientOnOrder(savedOrder, true); // true para isNewOrder
            await createNotification(
                'new_order',
                'Novo Pedido (Offline) Sincronizado',
                `Pedido #${savedOrder.orderNumber} para ${savedOrder.customer.name} foi sincronizado.`,
                { orderId: savedOrder.id }
            );

            successCount++;
            console.log(`Pedido offline ${offlineOrder.offlineId} sincronizado com sucesso como Pedido #${newOrderNumber}.`);
        } catch (error) {
            console.error(`Falha ao sincronizar o pedido offline ${offlineOrder.offlineId}:`, error);
            remainingOrders.push(offlineOrder); // Mantém o pedido na lista para tentar novamente
            failureCount++;
        }
    }

    localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(remainingOrders));
    updatePendingOrdersUI(); // NOVO: Atualiza o contador após a tentativa de sincronização

    if (failureCount > 0) {
        showToast(`Sincronização concluída. ${successCount} pedidos salvos. ${failureCount} falharam e tentarão novamente.`, 'warning', 7000);
    } else if (successCount > 0) {
        showToast(`Sincronização concluída! ${successCount} pedido(s) foram salvos com sucesso.`, 'success');
    }
}