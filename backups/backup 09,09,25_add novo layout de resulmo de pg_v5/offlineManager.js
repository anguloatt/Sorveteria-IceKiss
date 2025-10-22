import { showToast } from './utils.js';
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

export function isAppOnline() {
    return isOnline;
}

function updateOnlineStatusUI() {
    const onlineIndicator = document.getElementById('pdv-employee-online-status');
    const offlineIndicator = document.getElementById('offline-indicator');

if (onlineIndicator) onlineIndicator.classList.toggle('hidden', !isOnline);
    if (offlineIndicator) offlineIndicator.classList.toggle('hidden', isOnline);
}

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

export async function cacheEssentialData() {
    if (!isAppOnline()) {
        console.log('Offline. Usando dados do cache existente.');
        return;
    }

try {
        console.log('Online. Fazendo cache dos dados essenciais...');
        const { storeSettings } = await import('./app.js');

const products = await fetchAllProductsWithStock();

localStorage.setItem(CACHED_PRODUCTS_KEY, JSON.stringify(products));
        localStorage.setItem(CACHED_SETTINGS_KEY, JSON.stringify(storeSettings));

console.log('Cache de produtos e configurações atualizado com sucesso.');
    } catch (error) {
        console.error('Erro ao fazer cache dos dados essenciais:', error);
        showToast('Erro ao atualizar dados locais para modo offline.', 'error');
    }
}

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

export function queueOrderForSync(orderData) {
    console.log('MODO OFFLINE: Pedido enfileirado para sincronização:', orderData);
    try {
        const pendingOrders = getPendingOrders();
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

function getPendingOrders() {
    const pending = localStorage.getItem(PENDING_ORDERS_KEY);
    if (pending) {
        try {
            return JSON.parse(pending);
        } catch (e) {
            console.error("Erro ao parsear pedidos pendentes:", e);
            localStorage.removeItem(PENDING_ORDERS_KEY);
            return [];
        }
    }
    return [];
}

async function syncPendingOrders() {
    const pendingOrders = getPendingOrders();

if (pendingOrders.length === 0) {
        console.log('Sincronização: Nenhum pedido pendente para sincronizar.');
        return;
    }

showToast(`Sincronizando ${pendingOrders.length} pedido(s) pendente(s)...`, 'info', 5000);

const { getNextOrderNumber } = await import('./app.js');

const remainingOrders = [];
    let successCount = 0;
    let failureCount = 0;

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

delete finalOrderData.offlineId;
            delete finalOrderData.queuedAt;

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

