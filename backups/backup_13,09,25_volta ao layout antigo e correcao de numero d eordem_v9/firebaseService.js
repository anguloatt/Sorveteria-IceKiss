import { db, storage } from './firebase-config.js';
import { showToast, getTomorrowDateString } from './utils.js';
import {
    collection, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, getDocs,
    addDoc, serverTimestamp, runTransaction, increment, writeBatch, deleteField,
    orderBy, limit, Timestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
export { serverTimestamp, Timestamp };

import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

export function _standardizeOrderData(doc) {
    const data = doc.data();
    if (!data) {
        return { id: doc.id };
    }
    const standardized = { id: doc.id, ...data };

const numericFields = ['total', 'sinal', 'restante', 'orderNumber'];
    for (const field of numericFields) {
        if (standardized[field] && typeof standardized[field] === 'string') {
            standardized[field] = parseFloat(standardized[field].replace(',', '.')) || 0;
        } else if (typeof standardized[field] !== 'number') {
            standardized[field] = Number(standardized[field]) || 0;
        }
    }

const dateFields = ['createdAt', 'settledAt', 'cancelledAt', 'updatedAt', 'firstOrderDate', 'lastOrderDate'];
    for (const field of dateFields) {
        if (standardized[field] && typeof standardized[field].toDate === 'function') {
            standardized[field] = standardized[field].toDate();
        }
    }

if (standardized.items && Array.isArray(standardized.items)) {
        standardized.items = standardized.items.map(item => {
            const newItem = { ...item };
            if (newItem.quantity && typeof newItem.quantity === 'string') {
                newItem.quantity = parseInt(newItem.quantity, 10) || 0;
            }
            if (newItem.subtotal && typeof newItem.subtotal === 'string') {
                newItem.subtotal = parseFloat(newItem.subtotal.replace(',', '.')) || 0;
            }
            return newItem;
        });
    }

return standardized;
}

export function normalizePhone(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('55')) {
        const withoutDDI = digits.substring(2);
        return withoutDDI.length > 11 ? withoutDDI.slice(-11) : withoutDDI;
    }
    return digits.length > 11 ? digits.slice(-11) : digits;
}
export async function createNotification(type, message, context = {}) {
    console.log(`createNotification: Criando notificação do tipo '${type}'.`);
    try {
        await addDoc(collection(db, "notifications"), {
            type, // ex: 'new_order', 'low_stock'
            message,
            context, // ex: { orderId: '...' } ou { productId: '...' }
            timestamp: serverTimestamp(),
            read: false // Começa como não lida
        });
        console.log("createNotification: Notificação criada com sucesso.");
    } catch (error) {
        console.error("createNotification: Erro ao criar notificação:", error);
    }
}

export async function fetchEmployees() {
    console.log("fetchEmployees: Buscando funcionários...");
    try {
        const employeesCol = collection(db, "employees");
        const employeeSnapshot = await getDocs(employeesCol);
        const employeeList = employeeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`fetchEmployees: ${employeeList.length} funcionários encontrados.`);
        return employeeList;
    } catch (error) {
        console.error("fetchEmployees: Erro ao buscar funcionários:", error);
        showToast("Erro ao carregar funcionários.", "error");
        return [];
    }
}

export async function findEmployeeByName(name) {
    console.log(`findEmployeeByName: Buscando funcionário pelo nome: ${name}`);
    try {
        const employeesCol = collection(db, "employees");
        const q = query(employeesCol, where("name", "==", name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const employeeDoc = querySnapshot.docs[0];
            console.log(`findEmployeeByName: Funcionário ${name} encontrado.`);
            return { id: employeeDoc.id, ...employeeDoc.data() };
        } else {
            console.log(`findEmployeeByName: Funcionário ${name} não encontrado.`);
            return null;
        }
    } catch (error) {
        console.error("findEmployeeByName: Erro ao buscar funcionário por nome:", error);
        return null;
    }
}

export async function addEmployee(name, role) {
    console.log(`addEmployee: Adicionando funcionário: ${name} com cargo: ${role}`);
    try {
        const employeesCol = collection(db, "employees");
        const q = query(employeesCol, where("name", "==", name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            showToast(`O funcionário "${name}" já existe.`, "error");
            return null;
        }
        const docRef = await addDoc(employeesCol, {
            name: name,
            role: role,
            password: '1234', // Senha padrão inicial
            createdAt: serverTimestamp()
        });
        showToast(`Funcionário "${name}" adicionado com sucesso!`, "success");
        console.log(`addEmployee: Funcionário ${name} adicionado.`);
        return { id: docRef.id, name, role };
    } catch (error) {
        console.error("addEmployee: Erro ao adicionar funcionário:", error);
        showToast("Erro ao adicionar funcionário.", "error");
        return null;
    }
}

export async function editEmployee(employeeId, newName, newRole) {
    console.log(`editEmployee: Editando funcionário ${employeeId} para ${newName} com cargo ${newRole}`);
    try {
        const employeeRef = doc(db, "employees", employeeId);
        const employeesCol = collection(db, "employees");
        const q = query(employeesCol, where("name", "==", newName));
        const querySnapshot = await getDocs(q);
        const existingEmployee = querySnapshot.docs.find(d => d.id !== employeeId);

if (existingEmployee) {
            showToast(`O nome "${newName}" já está em uso por outro funcionário.`, "error");
            return null;
        }

await updateDoc(employeeRef, { name: newName, role: newRole, updatedAt: serverTimestamp() });
        showToast(`Funcionário atualizado para "${newName}"!`, "success");
        console.log(`editEmployee: Funcionário ${employeeId} atualizado para ${newName}.`);
    } catch (error) {
        console.error("editEmployee: Erro ao editar funcionário:", error);
        showToast("Erro ao editar funcionário.", "error");
        throw error;
    }
}

export async function changeEmployeePassword(employeeId, currentPassword, newPassword) {
    console.log(`changeEmployeePassword: Tentando alterar a senha para o funcionário ${employeeId}`);
    try {
        const employeeRef = doc(db, "employees", employeeId);
        const employeeSnap = await getDoc(employeeRef);

if (!employeeSnap.exists()) {
            showToast("Erro: Funcionário não encontrado.", "error");
            throw new Error("Funcionário não encontrado.");
        }

const employeeData = employeeSnap.data();
        if (employeeData.password !== currentPassword) {
            showToast("Senha atual incorreta.", "error");
            throw new Error("Senha atual incorreta.");
        }

await updateDoc(employeeRef, { password: newPassword });
        showToast("Senha alterada com sucesso!", "success");
        console.log(`changeEmployeePassword: Senha do funcionário ${employeeId} alterada com sucesso.`);
    } catch (error) {
        console.error("changeEmployeePassword: Erro ao alterar senha:", error.message);
        throw error;
    }
}

export async function deleteEmployee(employeeId, employeeName) {
    console.log(`deleteEmployee: Deletando funcionário: ${employeeId} (${employeeName})`);
    try {
        const employeeRef = doc(db, "employees", employeeId);
        await deleteDoc(employeeRef);
        showToast(`Funcionário "${employeeName}" excluído com sucesso!`, "success");
        console.log(`deleteEmployee: Funcionário ${employeeId} excluído.`);
    } catch (error) {
        console.error("deleteEmployee: Erro ao deletar funcionário:", error);
        showToast("Erro ao excluir funcionário.", "error");
    }
}

export async function updateEmployeeLastLogin(employeeId) {
    console.log(`updateEmployeeLastLogin: Atualizando último login para o funcionário ${employeeId}`);
    try {
        const employeeRef = doc(db, "employees", employeeId);
        await updateDoc(employeeRef, { lastLogin: serverTimestamp() });
        console.log(`updateEmployeeLastLogin: Último login de ${employeeId} atualizado.`);
    } catch (error) {
        console.error("updateEmployeeLastLogin: Erro ao atualizar último login:", error);
    }
}

export async function resetEmployeePassword(employeeId) {
    console.log(`resetEmployeePassword: Resetando senha para o funcionário ${employeeId}`);
    try {
        const employeeRef = doc(db, "employees", employeeId);
        await updateDoc(employeeRef, { password: '1234' });
        console.log(`resetEmployeePassword: Senha do funcionário ${employeeId} resetada para o padrão.`);
    } catch (error) {
        console.error("resetEmployeePassword: Erro ao resetar senha:", error);
        showToast("Erro ao resetar a senha do funcionário.", "error");
        throw error;
    }
}

export async function logActivity(user, action, details = {}) {
    console.log(`logActivity: Registrando ação '${action}' para o usuário '${user}'.`);
    try {
        await addDoc(collection(db, "activity_logs"), {
            user: user, // Nome do usuário que realizou a ação
            action: action, // Descrição da ação (ex: 'Login', 'Logout', 'Salvou Cardápio')
            details: details, // Objeto com detalhes adicionais (ex: { categoria: 'fritos' })
            timestamp: serverTimestamp()
        });
        console.log(`logActivity: Atividade '${action}' registrada com sucesso.`);
    } catch (error) {
        console.error("logActivity: Erro ao registrar atividade:", error);
    }
}

export async function getNextOrderNumber() {
    console.log("getNextOrderNumber: Buscando próximo número de pedido.");
    const counterRef = doc(db, "counters", "orders");
    const ordersColRef = collection(db, "orders");
try {
        // Lê o último pedido primeiro (fora da transação)
        const lastOrderQuery = query(ordersColRef, orderBy("orderNumber", "desc"), limit(1));
        const lastOrderSnap = await getDocs(lastOrderQuery);
        let lastSavedOrderNumber = 0;
        if (!lastOrderSnap.empty) {
            lastSavedOrderNumber = Number(lastOrderSnap.docs[0].data().orderNumber) || 0;
        }

        // Política: sempre usar o próximo baseado no último pedido salvo (lastSaved + 1)
        const nextBasedOnLastSaved = lastSavedOrderNumber + 1;

        const newOrderNumber = await runTransaction(db, async (transaction) => {
            // Alinha e grava o contador para o próximo valor baseado no último pedido salvo.
            transaction.set(counterRef, { count: nextBasedOnLastSaved });
            console.log(`getNextOrderNumber: Alinhando contador para ${nextBasedOnLastSaved} (último salvo ${lastSavedOrderNumber}).`);
            return nextBasedOnLastSaved;
        });

        return String(newOrderNumber).padStart(4, '0');
    } catch (error) {
        console.error("getNextOrderNumber: Erro ao obter número do pedido.", error);
        showToast("Erro ao obter número do pedido. Tente novamente.", "error");
        return String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
    }
}

export async function saveOrder(orderData) {
    console.log("saveOrder: Salvando novo pedido.");
    try {
        const ordersCol = collection(db, "orders");
        const docRef = await addDoc(ordersCol, orderData);
        showToast("Pedido salvo com sucesso!", "success");
        console.log(`saveOrder: Pedido ${orderData.orderNumber} salvo com ID: ${docRef.id}.`);
        return { id: docRef.id, ...orderData };
    } catch (error) {
        console.error("saveOrder: Erro ao salvar pedido:", error);
        showToast("Erro ao salvar pedido.", "error");
        throw error;
    }
}

export async function updateOrder(orderId, updatedData) {
    console.log(`updateOrder: Atualizando pedido ${orderId}.`);
    try {
        const sanitizedData = Object.fromEntries(
            Object.entries(updatedData).filter(([_, value]) => value !== undefined)
        );
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, sanitizedData);
        showToast("Pedido atualizado com sucesso!", "success");
        console.log(`updateOrder: Pedido ${orderId} atualizado.`);
    } catch (error) {
        console.error("updateOrder: Erro ao atualizar pedido:", error);
        showToast("Erro ao atualizar pedido.", "error");
        throw error;
    }
}

export async function findOrder(orderNumber) {
    const searchString = String(orderNumber).trim();
    const searchNumber = parseInt(searchString, 10);

console.log(`findOrder: Buscando pedido: ${searchString} (como texto e número)`);

try {
        const ordersCol = collection(db, "orders");

if (!isNaN(searchNumber)) {
            const qNumber = query(ordersCol, where("orderNumber", "==", searchNumber));
            const querySnapshotNumber = await getDocs(qNumber);
            if (!querySnapshotNumber.empty) {
                const orderDoc = querySnapshotNumber.docs[0];
                console.log(`findOrder: Pedido ${searchNumber} encontrado (como NÚMERO).`);
                return { id: orderDoc.id, ...orderDoc.data() };
            }
        }

const qString = query(ordersCol, where("orderNumber", "==", searchString));
        const querySnapshotString = await getDocs(qString);
        if (!querySnapshotString.empty) {
            const orderDoc = querySnapshotString.docs[0];
            console.log(`findOrder: Pedido ${searchString} encontrado (como TEXTO).`);
            return { id: orderDoc.id, ...orderDoc.data() };
        }

console.log(`findOrder: Pedido ${orderNumber} não encontrado.`);
        return null;

} catch (error) {
        console.error("findOrder: Erro ao buscar pedido por número:", error);
        showToast("Erro ao buscar pedido.", "error");
        return null;
    }
}

export async function findNextOrder(currentOrderNumber) {
    console.log(`findNextOrder: Buscando próximo pedido após o número: ${currentOrderNumber}`);
    try {
        const ordersCol = collection(db, "orders");
        const q = query(ordersCol,
            where("orderNumber", ">", currentOrderNumber),
            orderBy("orderNumber", "asc"),
            limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const orderDoc = querySnapshot.docs[0];
            console.log(`findNextOrder: Próximo pedido encontrado: ${orderDoc.data().orderNumber}`);
            return { id: orderDoc.id, ...orderDoc.data() };
        } else {
            console.log(`findNextOrder: Nenhum pedido encontrado após ${currentOrderNumber}.`);
            return null;
        }
    } catch (error) {
        console.error("findNextOrder: Erro ao buscar próximo pedido:", error);
        showToast("Erro ao buscar próximo pedido.", "error");
        return null;
    }
}

export async function findPreviousOrder(currentOrderNumber) {
    console.log(`findPreviousOrder: Buscando pedido anterior ao número: ${currentOrderNumber}`);
    try {
        const ordersCol = collection(db, "orders");
        const q = query(ordersCol,
            where("orderNumber", "<", currentOrderNumber),
            orderBy("orderNumber", "desc"),
            limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const orderDoc = querySnapshot.docs[0];
            console.log(`findPreviousOrder: Pedido anterior encontrado: ${orderDoc.data().orderNumber}`);
            return { id: orderDoc.id, ...orderDoc.data() };
        } else {
            console.log(`findPreviousOrder: Nenhum pedido encontrado antes de ${currentOrderNumber}.`);
            return null;
        }
    } catch (error) {
        console.error("findPreviousOrder: Erro ao buscar pedido anterior:", error);
        showToast("Erro ao buscar pedido anterior.", "error");
        return null;
    }
}

export async function findLastOrder() {
    console.log(`findLastOrder: Buscando último pedido salvo.`);
    try {
        const ordersCol = collection(db, "orders");
        const q = query(ordersCol,
            orderBy("orderNumber", "desc"),
            limit(1)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const orderDoc = querySnapshot.docs[0];
            console.log(`findLastOrder: Último pedido encontrado: ${orderDoc.data().orderNumber}`);
            return { id: orderDoc.id, ...orderDoc.data() };
        } else {
            console.log(`findLastOrder: Nenhum pedido encontrado.`);
            return null;
        }
    } catch (error) {
        console.error("findLastOrder: Erro ao buscar último pedido:", error);
        showToast("Erro ao buscar último pedido.", "error");
        return null;
    }
}

export async function cancelOrder(orderId, currentUser, orderNumber) {
    console.log(`cancelOrder: Iniciando cancelamento do pedido ${orderId}`);
    const orderRef = doc(db, "orders", orderId);
    try {
        const orderDoc = await getDoc(orderRef);
        if (!orderDoc.exists()) {
            throw new Error("Pedido não encontrado para cancelar.");
        }
        const orderData = orderDoc.data();

await runTransaction(db, async (transaction) => {
            for (const item of orderData.items) {
                if (!item.isManual && item.id) {
                    const productRef = doc(db, "products", item.id);
                    transaction.update(productRef, { stock: increment(item.quantity) });
                }
            }
            transaction.update(orderRef, {
                status: 'cancelado',
                cancelledBy: deleteField(),
                cancelledAt: deleteField(),
                updatedAt: serverTimestamp()
            });
        });

for (const item of orderData.items) {
            if (!item.isManual && item.id) {
                const productDocAfterTransaction = await getDoc(doc(db, "products", item.id));
                const stockBeforeCancel = productDocAfterTransaction.data().stock - item.quantity;
                const stockAfterCancel = productDocAfterTransaction.data().stock;
                await logStockMovement(item.id, item.name, item.quantity, stockBeforeCancel, stockAfterCancel, 'Cancelamento', orderNumber);
            }
        }

showToast("Pedido cancelado e estoque estornado com sucesso!", "success");
        console.log(`cancelOrder: Pedido ${orderId} cancelado e estoque estornado.`);
    } catch (error) {
        console.error("cancelOrder: Erro ao cancelar pedido:", error);
        showToast("Falha ao cancelar pedido.", "error");
    }
}

export async function reactivateOrder(orderId, currentUser) {
    console.log(`reactivateOrder: Iniciando reativação do pedido ${orderId}`);
    const orderRef = doc(db, "orders", orderId);
    try {
        const orderDoc = await getDoc(orderRef);
        if (!orderDoc.exists()) throw new Error("Pedido não encontrado para reativar.");
        const orderData = orderDoc.data();

        if (orderData.status !== 'cancelado') {
            showToast('Pedido já está ativo ou não está cancelado.', 'info');
            return;
        }

        // Pré-checagem de estoque dos itens não manuais
        const insufficient = [];
        for (const item of orderData.items || []) {
            if (item.isManual || !item.id) continue;
            try {
                const prodSnap = await getDoc(doc(db, 'products', item.id));
                if (!prodSnap.exists()) {
                    insufficient.push({ name: item.name, reason: 'Produto não encontrado' });
                } else {
                    const stock = prodSnap.data().stock || 0;
                    if (stock < item.quantity) {
                        insufficient.push({ name: prodSnap.data().name || item.name, estoque: stock, necessario: item.quantity });
                    }
                }
            } catch (e) {
                insufficient.push({ name: item.name, reason: 'Erro ao consultar estoque' });
            }
        }
        if (insufficient.length > 0) {
            console.warn('reactivateOrder: Estoque insuficiente para reativar:', insufficient);
            showToast('Não foi possível reativar: estoque insuficiente em um ou mais itens.', 'error');
            throw new Error('Estoque insuficiente: ' + insufficient.map(i => `${i.name} (${i.estoque ?? '?'} / ${i.necessario ?? '?'})`).join(', '));
        }

        // Atualiza estoque (consome) dos itens não manuais
        for (const item of orderData.items || []) {
            if (item.isManual || !item.id) continue;
            await updateProductStock(item.id, -item.quantity, 'Reativação', orderData.orderNumber, currentUser);
        }

        await updateDoc(orderRef, {
            status: 'ativo',
            cancelledBy: deleteField(),
            cancelledAt: deleteField(),
            updatedAt: serverTimestamp(),
            updatedBy: currentUser ? { name: currentUser.name, id: currentUser.id } : { name: 'Gerência', id: 'manager' }
        });

        showToast("Pedido reativado com sucesso!", "success");
        console.log(`reactivateOrder: Pedido ${orderId} reativado e estoque atualizado.`);
    } catch (error) {
        console.error("reactivateOrder: Erro ao reativar pedido:", error);
        // showToast já chamado em alguns casos acima; evitar duplicação agressiva.
        if (!/Estoque insuficiente/.test(error?.message || '')) {
            showToast("Falha ao reativar pedido.", "error");
        }
        throw error;
    }
}

export async function releaseOrderForEdit(orderId, currentUser) {
    console.log(`releaseOrderForEdit: Liberando pedido ${orderId} para edição.`);
    try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
            status: 'alterado',
            updatedAt: serverTimestamp(),
            updatedBy: currentUser ? { name: currentUser.name, id: currentUser.id } : { name: 'Gerência', id: 'manager' }
        });
        showToast("Pedido liberado para edição no PDV!", "success");
        console.log(`releaseOrderForEdit: Pedido ${orderId} liberado para edição.`);
    } catch (error) {
        console.error("releaseOrderForEdit: Erro ao liberar pedido para edição:", error);
        showToast("Falha ao liberar pedido para edição.", "error");
        throw error;
    }
}

export async function settleDebt(orderId, newSinal, currentUser, orderNumber) {
    console.log(`settleDebt: Liquidando saldo do pedido ${orderId}`);
    const orderRef = doc(db, "orders", orderId);
    try {
        await updateDoc(orderRef, {
            restante: 0,
            paymentStatus: 'pago',
            settledBy: { name: currentUser.name, id: currentUser.id },
            settledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        showToast(`Saldo do pedido ${orderNumber} liquidado com sucesso!`, "success");
        console.log(`settleDebt: Saldo do pedido ${orderId} liquidado.`);
    } catch (error) {
        console.error("settleDebt: Erro ao liquidar saldo:", error);
        showToast("Falha ao liquidar saldo do pedido.", "error");
    }
}

export async function findOrderByDocId(orderId) {
    console.log(`findOrderByDocId: Buscando pedido pelo ID do documento: ${orderId}`);
    try {
        const orderRef = doc(db, "orders", orderId);
        const orderSnap = await getDoc(orderRef);
        if (orderSnap.exists()) {
            console.log(`findOrderByDocId: Pedido ${orderId} encontrado.`);
            return { id: orderSnap.id, ...orderSnap.data() };
        } else {
            console.log(`findOrderByDocId: Pedido com ID ${orderId} não encontrado.`);
            showToast(`Pedido com ID ${orderId} não encontrado.`, "error");
            return null;
        }
    } catch (error) {
        console.error(`findOrderByDocId: Erro ao buscar pedido por ID do documento:`, error);
        showToast("Erro ao buscar pedido.", "error");
        return null;
    }
}

export async function fetchAllOrders() {
    console.log("fetchAllOrders: Buscando todos os pedidos.");
    try {
        const ordersCol = collection(db, "orders");
        const q = query(ordersCol, orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const orders = querySnapshot.docs.map(doc => _standardizeOrderData(doc));
        console.log(`fetchAllOrders: ${orders.length} pedidos encontrados.`);
        return orders;
    } catch (error) {
        console.error("fetchAllOrders: Erro ao buscar todos os pedidos:", error);
        showToast("Erro ao carregar pedidos.", "error");
        return [];
    }
}

export async function checkForDailyDeliveries() {
    console.log("checkForDailyDeliveries: Verificando pedidos para retirada hoje.");
    const today = new Date();
    const todayFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

try {
        const ordersCol = collection(db, "orders");
        const q = query(ordersCol,
            where("delivery.date", "==", todayFormatted)
        );
    const querySnapshot = await getDocs(q);
    const dailyDeliveries = querySnapshot.docs.map(doc => _standardizeOrderData(doc)).filter(order => order.status !== 'cancelado');
        console.log(`checkForDailyDeliveries: ${dailyDeliveries.length} pedidos para retirada hoje.`);
        return dailyDeliveries;
    } catch (error) {
        console.error("checkForDailyDeliveries: Erro ao verificar entregas diárias:", error);
        showToast("Erro ao verificar lembretes de produção.", "error");
        return [];
    }
}

export async function checkForTomorrowDeliveries() {
    console.log("checkForTomorrowDeliveries: Verificando pedidos para retirada amanhã.");
    const tomorrowFormatted = getTomorrowDateString('dd/mm/yyyy');

try {
        const ordersCol = collection(db, "orders");
        const q = query(ordersCol,
            where("delivery.date", "==", tomorrowFormatted)
        );
    const querySnapshot = await getDocs(q);
    const tomorrowDeliveries = querySnapshot.docs.map(doc => _standardizeOrderData(doc)).filter(order => order.status !== 'cancelado');
        console.log(`checkForTomorrowDeliveries: ${tomorrowDeliveries.length} pedidos para retirada amanhã.`);
        return tomorrowDeliveries;
    } catch (error) {
        console.error("checkForTomorrowDeliveries: Erro ao verificar entregas de amanhã:", error);
        showToast("Erro ao verificar lembretes de produção para amanhã.", "error");
        return [];
    }
}

export async function fetchClients() {
    console.log("fetchClients: Buscando todos os clientes e agregando dados de pedidos.");
    try {
        const ordersCol = collection(db, "orders");
        const ordersSnapshot = await getDocs(ordersCol);
        const clientsMap = new Map();

ordersSnapshot.docs.forEach(doc => {
            const order = _standardizeOrderData(doc);
            const clientPhone = order.customer?.phone;
            const clientName = order.customer?.name;

if (clientPhone && clientName) {
                const key = normalizePhone(clientPhone) || clientPhone;

if (!clientsMap.has(key)) {
                    clientsMap.set(key, {
                        name: clientName,
                        phone: clientPhone,
                        orderCount: 0,
                        totalSpent: 0,
                        totalDebt: 0,
                        firstOrderDate: (order.createdAt instanceof Date) ? order.createdAt : (order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date()),
                        lastOrderDate: (order.createdAt instanceof Date) ? order.createdAt : (order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date()),
                        orders: []
                    });
                }

const clientData = clientsMap.get(key);
                clientData.name = clientName;
                clientData.orders.push({
                    id: order.id,
                    orderNumber: order.orderNumber,
                    createdAt: (order.createdAt instanceof Date) ? order.createdAt : (order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date()),
                    total: Number(order.total) || 0,
                    paymentStatus: order.paymentStatus,
                    status: order.status,
                    items: order.items
                });

if (order.status !== 'cancelado') {
                    clientData.orderCount++;
                    clientData.totalSpent += order.total || 0;

if (order.paymentStatus === 'devedor') {
                        clientData.totalDebt += order.restante || 0;
                    }

const createdAtDate = (order.createdAt instanceof Date) ? order.createdAt : (order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date());
                    if (createdAtDate < clientData.firstOrderDate) {
                        clientData.firstOrderDate = createdAtDate;
                    }
                    if (createdAtDate > clientData.lastOrderDate) {
                        clientData.lastOrderDate = createdAtDate;
                    }
                }
            }
        });

try {
            const clientsDocsSnapshot = await getDocs(collection(db, 'clients'));
            clientsDocsSnapshot.forEach(clientDoc => {
                const data = clientDoc.data();
                const key = (data.phone || '').replace(/\D/g, '') || data.phone;
                if (!key) return;
                const existing = clientsMap.get(key);
                if (existing) {
                    existing.name = data.name || existing.name;
                    if (data.firstName || data.lastName) {
                        const full = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
                        if (full) existing.name = full;
                    }
                    if (Array.isArray(data.phones)) {
                        existing.phones = data.phones;
                    }
                    if (data.phone && !existing.phone) existing.phone = data.phone;
                } else {
                    clientsMap.set(key, {
                        name: data.name || [data.firstName, data.lastName].filter(Boolean).join(' ').trim() || 'Cliente',
                        phone: data.phone || '',
                        phones: Array.isArray(data.phones) ? data.phones : (data.phone ? [data.phone] : []),
                        orderCount: 0,
                        totalSpent: 0,
                        totalDebt: 0,
                        firstOrderDate: null,
                        lastOrderDate: null,
                        orders: []
                    });
                }
            });
        } catch (e) {
            console.warn('fetchClients: Falha ao enriquecer com coleção clients:', e);
        }

const clientsList = Array.from(clientsMap.values());

clientsList.forEach(client => {
            client.orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        });

console.log(`fetchClients: ${clientsList.length} clientes únicos com dados agregados encontrados.`);
        return clientsList;
    } catch (error) {
        console.error("fetchClients: Erro ao buscar clientes e agregar dados:", error);
        showToast("Erro ao carregar lista de clientes.", "error");
        return [];
    }
}

export async function addClient(client) {
    const firstName = (client.firstName || '').trim();
    const lastName = (client.lastName || '').trim();
    const phone1 = (client.phone1 || '').trim();
    const phone2 = (client.phone2 || '').trim();
    if (!firstName || !phone1) throw new Error('Nome e Telefone 1 são obrigatórios');
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    const phones = [phone1, phone2].filter(Boolean);
    const colRef = collection(db, 'clients');
    const docRef = await addDoc(colRef, {
        firstName, lastName, name, phone: phone1, phones, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateClientByPhone(initialPhone, updates) {
    const normalized = (initialPhone || '').replace(/\D/g, '');
    const colRef = collection(db, 'clients');
    const q = query(colRef, where('phone', '==', initialPhone));
    const snap = await getDocs(q);
    if (snap.empty && normalized) {
        const q2 = query(colRef, where('phone', '==', normalized));
        const snap2 = await getDocs(q2);
        if (!snap2.empty) return _applyClientUpdate(snap2.docs[0].id, updates);
    }
    if (snap.empty) throw new Error('Cliente não encontrado para atualizar');
    return _applyClientUpdate(snap.docs[0].id, updates);
}

async function _applyClientUpdate(docId, updates) {
    const firstName = updates.firstName?.trim?.() || undefined;
    const lastName = updates.lastName?.trim?.() || undefined;
    const phone1 = updates.phone1?.trim?.() || undefined;
    const phone2 = updates.phone2?.trim?.() || undefined;
    const partial = { updatedAt: serverTimestamp() };
    if (firstName !== undefined) partial.firstName = firstName;
    if (lastName !== undefined) partial.lastName = lastName;
    if (phone1 !== undefined) partial.phone = phone1;
    const phones = [phone1, phone2].filter(Boolean);
    if (phones.length > 0) partial.phones = phones;
    if (firstName !== undefined || lastName !== undefined) {
        partial.name = [firstName, lastName].filter(Boolean).join(' ').trim();
    }
    await updateDoc(doc(db, 'clients', docId), partial);
}

export async function deleteClientByPhone(initialPhone) {
    const colRef = collection(db, 'clients');
    const q = query(colRef, where('phone', '==', initialPhone));
    const snap = await getDocs(q);
    if (snap.empty) return false;
    await deleteDoc(doc(db, 'clients', snap.docs[0].id));
    return true;
}

export async function findClientByPhone(phone) {
    if (!phone || phone.length < 10) {
        return null;
    }
    console.log(`findClientByPhone: Buscando cliente com telefone: ${phone}`);

try {
        const ordersCol = collection(db, "orders");
        const q = query(ordersCol, where("customer.phone", "==", phone));
        const ordersSnapshot = await getDocs(q);

if (ordersSnapshot.empty) {
            console.log(`findClientByPhone: Nenhum pedido (e, portanto, nenhum cliente) encontrado para o telefone ${phone}.`);
            return null;
        }

const clientData = {
            name: '',
            phone: phone,
            orderCount: 0,
            totalSpent: 0,
            totalDebt: 0,
            firstOrderDate: new Date(),
            lastOrderDate: new Date(0),
            orders: []
        };

ordersSnapshot.docs.forEach(doc => {
            const order = { id: doc.id, ...doc.data() };
            if (!clientData.phone) clientData.phone = order.customer.phone;
            clientData.name = order.customer.name;

clientData.orders.push({
                id: order.id,
                orderNumber: order.orderNumber,
                createdAt: order.createdAt.toDate(),
                total: order.total,
                paymentStatus: order.paymentStatus,
                status: order.status,
                items: order.items
            });

if (order.status !== 'cancelado') {
                clientData.orderCount++;
                clientData.totalSpent += order.total || 0;
                if (order.paymentStatus === 'devedor') {
                    clientData.totalDebt += order.restante || 0;
                }
                if (order.createdAt.toDate() < clientData.firstOrderDate) clientData.firstOrderDate = order.createdAt.toDate();
                if (order.createdAt.toDate() > clientData.lastOrderDate) clientData.lastOrderDate = order.createdAt.toDate();
            }
        });

clientData.orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

console.log(`findClientByPhone: Cliente ${clientData.name} encontrado com ${clientData.orderCount} pedido(s).`);
        return clientData;
    } catch (error) {
        console.error(`findClientByPhone: Erro ao buscar cliente pelo telefone ${phone}:`, error);
        showToast("Erro ao buscar dados do cliente.", "error");
        return null;
    }
}

export async function findClientByName(name) {
    if (!name || name.length < 3) {
        return null;
    }
    console.log(`findClientByName: Buscando cliente com nome: ${name}`);
    try {
        const clientsRef = collection(db, "clients");
        const q = query(clientsRef, where("name", "==", name), limit(1));
        const querySnapshot = await getDocs(q);

if (querySnapshot.empty) {
            console.log(`findClientByName: Nenhum cliente encontrado para o nome ${name}.`);
            return null;
        }

const clientDoc = querySnapshot.docs[0];
        console.log(`findClientByName: Cliente ${name} encontrado.`);
        return { id: clientDoc.id, ...clientDoc.data() };

} catch (error) {
        console.error(`findClientByName: Erro ao buscar cliente pelo nome ${name}:`, error);
        showToast("Erro ao buscar dados do cliente.", "error");
        return null;
    }
}

export async function upsertClientOnOrder(order, isNewOrder = false, clientIdToUpdate = null) {
    console.log(`upsertClientOnOrder: Upserting client for order ${order.orderNumber}`);
    const clientPhoneFormatted = order.customer?.phone || '';
    const clientName = order.customer?.name || '';

if (!clientName || !clientPhoneFormatted) {
        console.warn("upsertClientOnOrder: Nome ou telefone do cliente não fornecido no pedido. Pulando upsert.");
        return;
    }

const clientData = {
        name: clientName,
        phone: clientPhoneFormatted,
        updatedAt: serverTimestamp()
    };

try {
        if (clientIdToUpdate) {
            const clientRef = doc(db, "clients", clientIdToUpdate);
            await updateDoc(clientRef, clientData);
            console.log(`upsertClientOnOrder: Cliente existente (ID: ${clientIdToUpdate}) atualizado com o novo telefone.`);
        } else {
            const clientsCol = collection(db, "clients");
            const q = query(clientsCol, where("phone", "==", clientPhoneFormatted));
            const querySnapshot = await getDocs(q);

if (querySnapshot.empty) {
                await addDoc(clientsCol, {
                    ...clientData,
                    createdAt: serverTimestamp(),
                    firstOrderDate: order.createdAt,
                    totalDebt: 0, // Inicializa campos agregados
                    totalOrders: 0,
                    totalSpent: 0
                });
                console.log(`upsertClientOnOrder: Novo cliente adicionado: ${clientName}`);
            } else {
                const clientId = querySnapshot.docs[0].id;
                await updateDoc(doc(db, "clients", clientId), clientData);
                console.log(`upsertClientOnOrder: Cliente existente atualizado: ${clientName}`);
            }
        }
    } catch (error) {
        console.error("upsertClientOnOrder: Erro ao fazer upsert do cliente:", error);
    }
}

export async function saveManagerConfig(productsConfig) {
    console.log("saveManagerConfig: Salvando configurações do cardápio.");
    try {
        const configRef = doc(db, "config", "main");
        const productsArrayForFirestore = Object.keys(productsConfig).map(key => ({
            id: key,
            items: productsConfig[key]
        }));

await updateDoc(configRef, { products: productsArrayForFirestore });
        showToast("Cardápio salvo com sucesso!", "success");
        console.log("saveManagerConfig: Cardápio atualizado no Firebase.");
    } catch (error) {
        console.error("saveManagerConfig: Erro ao salvar cardápio:", error);
        showToast("Falha ao salvar cardápio.", "error");
    }
}

export async function saveTicketSettings(settings) {
    console.log("saveTicketSettings: Salvando configurações de ticket.");
    try {
        const configRef = doc(db, "config", "main");
        await updateDoc(configRef, { settings: settings });
        showToast("Configurações de ticket salvas!", "success");
        console.log("saveTicketSettings: Configurações de ticket atualizadas no Firebase.");
    } catch (error) {
        console.error("saveTicketSettings: Erro ao salvar configurações de ticket:", error);
        showToast("Falha ao salvar configurações de ticket.", "error");
    }
}

export async function saveSystemSettings(settings) {
    console.log("saveSystemSettings: Salvando configurações do sistema.");
    try {
        const configRef = doc(db, "config", "main");
        await updateDoc(configRef, { settings: settings });
        showToast("Configurações do sistema salvas!", "success");
        console.log("saveSystemSettings: Configurações do sistema atualizadas no Firebase.");
    } catch (error) {
        console.error("saveSystemSettings: Erro ao salvar configurações do sistema:", error);
        showToast("Falha ao salvar configurações do sistema.", "error");
    }
}

export async function saveManagerPassword(newPassword) {
    console.log("saveManagerPassword: Salvando nova senha do gerente.");
    try {
        const configRef = doc(db, "config", "main");
        await updateDoc(configRef, { manager: { user: 'gerencia', pass: newPassword } });
        showToast("Senha de gerência atualizada com sucesso!", "success");
        console.log("saveManagerPassword: Senha de gerência atualizada no Firebase.");
    } catch (error) {
        console.error("saveManagerPassword: Erro ao salvar senha do gerente:", error);
        showToast("Falha ao salvar a senha de gerência.", "error");
    }
}

export async function clearDatabase() {
    console.log("clearDatabase: Iniciando limpeza completa do banco de dados.");
    try {
        const ordersSnapshot = await getDocs(collection(db, "orders"));
        const deleteOrdersPromises = ordersSnapshot.docs.map(d => deleteDoc(doc(db, "orders", d.id)));
        await Promise.all(deleteOrdersPromises);
        console.log("clearDatabase: Todos os pedidos foram apagados.");

const activityLogsSnapshot = await getDocs(collection(db, "activity_logs"));
        const deleteActivityLogsPromises = activityLogsSnapshot.docs.map(d => deleteDoc(doc(db, "activity_logs", d.id)));
        await Promise.all(deleteActivityLogsPromises);
        console.log("clearDatabase: Todos os logs de atividade foram apagados.");

const stockLogsSnapshot = await getDocs(collection(db, "stock_logs"));
        const deleteStockLogsPromises = stockLogsSnapshot.docs.map(d => deleteDoc(doc(db, "stock_logs", d.id)));
        await Promise.all(deleteStockLogsPromises);
        console.log("clearDatabase: Todos os logs de estoque foram apagados.");

const configRef = doc(db, "config", "main");
        await updateDoc(configRef, { lastOrderNumber: 0 });
        console.log("clearDatabase: lastOrderNumber resetado para 0.");

showToast("Banco de dados limpo com sucesso! A aplicação será recarregada.", "success", 3000);
        console.log("clearDatabase: Limpeza do banco de dados concluída.");
    } catch (error) {
        console.error("clearDatabase: Erro ao limpar o banco de dados:", error);
        showToast("Falha ao limpar o banco de dados.", "error");
        throw error;
    }
}

export async function fetchTeamActivityLogs(start, end, userName = null) {
    console.log(`fetchTeamActivityLogs: Buscando logs de atividade para o período de ${start.toLocaleString()} a ${end.toLocaleString()}.`);
    let q = query(collection(db, "activity_logs"),
        where("timestamp", ">=", start),
        where("timestamp", "<=", end)
    );
    if (userName) {
        q = query(q, where("userName", "==", userName));
    }
    try {
        const querySnapshot = await getDocs(q);
        const logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`fetchTeamActivityLogs: ${logs.length} logs de atividade encontrados.`);
        return logs;
    } catch (error) {
        console.error("fetchTeamActivityLogs: Erro ao buscar logs de atividade:", error);
        showToast("Erro ao carregar logs de atividade da equipe.", "error");
        return [];
    }
}

export async function fetchTeamActivityOrders(start, end, employeeName = null) {
    console.log(`fetchTeamActivityOrders: Buscando pedidos para o período de ${start.toLocaleString()} a ${end.toLocaleString()}.`);
    let q = query(collection(db, "orders"), where("createdAt", ">=", start), where("createdAt", "<=", end));
    if (employeeName) {
        q = query(q, where("createdBy.name", "==", employeeName));
    }
    try {
        const querySnapshot = await getDocs(q);
        let orders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        orders = orders.filter(o => {
            const name = String(o?.createdBy?.name || '').trim();
            if (!name) return false;
            if (name.toLowerCase() === 'undefined') return false;
            return true;
        });
        console.log(`fetchTeamActivityOrders: ${orders.length} pedidos válidos encontrados (após filtragem).`);
        return orders;
    } catch (error) {
        console.error("fetchTeamActivityOrders: Erro ao buscar pedidos da equipe:", error);
        showToast("Erro ao carregar pedidos para o relatório da equipe.", "error");
        return [];
    }
}

export async function fetchAllProductsWithStock() {
    console.log("fetchAllProductsWithStock: Buscando todos os produtos com estoque.");
    try {
        const productsCol = collection(db, "products");
        const productSnapshot = await getDocs(productsCol);
        const productsList = productSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`fetchAllProductsWithStock: ${productsList.length} produtos com estoque encontrados.`);
        return productsList;
    } catch (error) {
        console.error("fetchAllProductsWithStock: Erro ao buscar produtos com estoque:", error);
        showToast("Erro ao carregar produtos para estoque.", "error");
        return [];
    }
}

export async function fetchProductPriceHistory(productId) {
    console.log(`fetchProductPriceHistory: Buscando histórico de preços para o produto ${productId}`);
    try {
        const historyColRef = collection(db, `products/${productId}/priceHistory`);
        const q = query(historyColRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

if (querySnapshot.empty) {
            console.log(`fetchProductPriceHistory: Nenhum histórico de preços encontrado para ${productId}.`);
            return [];
        }

const history = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
            };
        });

console.log(`fetchProductPriceHistory: ${history.length} registros de histórico encontrados.`);
        return history;
    } catch (error) {
        console.error(`fetchProductPriceHistory: Erro ao buscar histórico de preços para ${productId}:`, error);
        showToast("Erro ao carregar o histórico de preços.", "error");
        return [];
    }
}

export async function getMonthlyProfitMargin(productId) {
    console.log(`getMonthlyProfitMargin: Calculando margem de lucro para o produto ${productId}`);
    try {
        const productRef = doc(db, "products", productId);
        const productSnap = await getDoc(productRef);
        if (!productSnap.exists()) throw new Error("Produto não encontrado para calcular a margem.");

const prodData = productSnap.data();
        let productCost = 0;
        if (typeof prodData.cost === 'number') {
            productCost = prodData.cost;
        } else if (typeof prodData.costPercent === 'number' && typeof prodData.price === 'number' && prodData.price > 0) {
            productCost = +(prodData.price * (prodData.costPercent / 100));
        } else {
            productCost = 0;
        }
        const ordersCol = collection(db, "orders");
        const ordersSnapshot = await getDocs(ordersCol);
        const monthlyData = {};

ordersSnapshot.forEach(orderDoc => {
            const order = orderDoc.data();
            if (order.status === 'cancelado') return;

(order.items || []).forEach(item => {
                if (item.id === productId) {
                    const orderDate = order.createdAt.toDate();
                    const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
                    if (!monthlyData[monthKey]) monthlyData[monthKey] = { revenue: 0, cost: 0 };
                    monthlyData[monthKey].revenue += item.subtotal || 0;
                    monthlyData[monthKey].cost += (item.quantity || 0) * productCost;
                }
            });
        });

return Object.keys(monthlyData).map(monthKey => ({ month: monthKey, revenue: monthlyData[monthKey].revenue, profit: monthlyData[monthKey].revenue - monthlyData[monthKey].cost })).sort((a, b) => a.month.localeCompare(b.month));
    } catch (error) {
        console.error(`getMonthlyProfitMargin: Erro ao calcular margem de lucro para ${productId}:`, error);
        showToast("Erro ao calcular a margem de lucro.", "error");
        return [];
    }
}

export async function updateProductStock(productId, quantityChange, reason = 'Ajuste', orderNumber = null, currentUser) {
    console.log(`updateProductStock: Atualizando estoque do produto ${productId} em ${quantityChange}. Motivo: ${reason}`);
    if (!productId || productId.startsWith('manual_')) {
        console.log("updateProductStock: Ignorando item manual ou sem ID.");
        return;
    }
    try {
        const productRef = doc(db, "products", productId);
        let productName = '';
        let stockBefore = 0;
        let stockAfter = 0;

let shouldNotifyLowStock = false;
        const LOW_STOCK_THRESHOLD = 5;
        await runTransaction(db, async (transaction) => {
            const productDoc = await transaction.get(productRef);

if (!productDoc.exists()) {
                console.warn(`Produto com ID ${productId} não encontrado na coleção 'products'. Estoque não atualizado.`);
                return;
            }

productName = productDoc.data().name;
            stockBefore = productDoc.data().stock || 0;
            stockAfter = stockBefore + quantityChange;

if (stockAfter < 0) {
                const error = new Error(`Estoque insuficiente para ${productName}. Disponível: ${stockBefore}, Pedido: ${Math.abs(quantityChange)}`);
                error.code = 'stock/insufficient-funds';
                throw error;
            }

if (stockAfter <= LOW_STOCK_THRESHOLD && stockBefore > LOW_STOCK_THRESHOLD) {
                shouldNotifyLowStock = true;
            }

transaction.update(productRef, { stock: increment(quantityChange) });
        });

if (productName) {
            await logStockMovement(productId, productName, quantityChange, stockBefore, stockAfter, reason, orderNumber, currentUser);
        }

if (shouldNotifyLowStock && productName) {
            await createNotification(
                'low_stock',
                'Estoque Baixo',
                `O estoque de "${productName}" está baixo (${stockAfter} unidades restantes).`,
                { productId: productId }
            );
        }

} catch (error) {
        console.error(`updateProductStock: Erro transacional ao atualizar estoque para o produto ${productId}:`, error);
        throw error;
    }
}

export async function logStockMovement(productId, productName, quantityChange, stockBefore, stockAfter, reason, orderNumber = null, currentUser) {
    try {
        const logData = {
            productId,
            productName,
            quantityChange,
            stockBefore,
            stockAfter,
            reason,
            orderNumber,
            user: currentUser?.name || 'Sistema',
            timestamp: serverTimestamp()
        };
        await addDoc(collection(db, "stock_logs"), logData);
        console.log("logStockMovement: Log de estoque registrado com sucesso.", logData);
    } catch (error) {
        console.error("logStockMovement: Erro ao registrar log de estoque:", error);
    }
}

export async function fetchStockLogs() {
    console.log("fetchStockLogs: Buscando logs de movimentação de estoque.");
    try {
        const logsRef = collection(db, "stock_logs");
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(200));
        const snapshot = await getDocs(q);
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`fetchStockLogs: ${logs.length} logs de estoque encontrados.`);
        return logs;
    } catch (error) {
        console.error("fetchStockLogs: Erro ao buscar logs de estoque:", error);
        showToast("Erro ao carregar histórico de estoque.", "error");
        return [];
    }
}

export async function fetchNextUpcomingOrder() {
    console.log("fetchNextUpcomingOrder: Buscando o próximo pedido agendado.");
    const ordersCol = collection(db, "orders");
    const nowTimestamp = Timestamp.fromDate(new Date());

try {
        const q = query(
            ordersCol,
            where("status", "in", ["ativo", "alterado"]),
            where("deliveryTimestamp", ">", nowTimestamp), // Filtra apenas por pedidos futuros.
            orderBy("deliveryTimestamp", "asc"), // Ordena pela data/hora correta.
            limit(1) // Pega apenas o próximo pedido.
        );

const querySnapshot = await getDocs(q);

if (!querySnapshot.empty) {
            const nextOrder = { id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() };
            console.log(`fetchNextUpcomingOrder: Próximo pedido agendado encontrado: #${nextOrder.orderNumber} para ${nextOrder.customer?.name} em ${nextOrder.delivery?.date} às ${nextOrder.delivery?.time}.`);
            return nextOrder;
        } else {
            console.log("fetchNextUpcomingOrder: Nenhum pedido agendado futuro encontrado.");
            return null;
        }

} catch (error) {
        console.error("fetchNextUpcomingOrder: Erro ao buscar o próximo pedido agendado:", error);
        return null;
    }
}

export async function fetchExpiredPendingOrders() {
    console.log("firebaseService: Buscando pedidos com pendências...");
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const sixMonthsAgoTimestamp = Timestamp.fromDate(sixMonthsAgo);

const ordersRef = collection(db, "orders");
        const q = query(
            ordersRef,
            where("paymentStatus", "==", "devedor"),
            where("status", "!=", "cancelado"),
            where("createdAt", ">=", sixMonthsAgoTimestamp),
            orderBy("createdAt", "desc")
        );

const querySnapshot = await getDocs(q);

const pendingOrders = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const unresolvedAlerts = pendingOrders.filter(order => order.alertStatus !== 'resolvido');

console.log(`firebaseService: Encontrados ${unresolvedAlerts.length} pedidos com pendências não resolvidas.`);
        return unresolvedAlerts;

} catch (error) {
        console.error("firebaseService: Erro ao buscar pedidos pendentes:", error);
        showToast("Falha ao verificar alertas de pedidos.", "error");
        return [];
    }
}

export async function updateOrderAlertStatus(orderId, status, user) {
    console.log(`firebaseService: Atualizando status do alerta para o pedido ${orderId} para "${status}"...`);
    if (!orderId || !status || !user) {
        console.error("ID do pedido, novo status ou usuário não fornecido.");
        return;
    }

try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
            alertStatus: status,
            alertHandledBy: {
                id: user.id,
                name: user.name
            },
            alertHandledAt: serverTimestamp()
        });
        showToast(`Alerta do pedido marcado como "${status}".`, "success");
    } catch (error) {
        console.error(`firebaseService: Erro ao atualizar status do alerta para o pedido ${orderId}:`, error);
        showToast("Falha ao atualizar o status do alerta.", "error");
        throw error;
    }
}

export async function resolveExpiredOrder(orderId, orderData, user) {
    console.log(`firebaseService: Resolvendo e liquidando pedido expirado ${orderId}`);
    if (!orderId || !orderData || !user) {
        console.error("Dados insuficientes para resolver o pedido expirado.");
        showToast("Erro ao resolver alerta.", "error");
        return;
    }

const orderRef = doc(db, "orders", orderId);
    const updatePayload = {
        sinal: orderData.total,
        restante: 0,
        paymentStatus: 'pago',
        settledBy: { name: user.name, id: user.id },
        settledAt: serverTimestamp(),
        alertStatus: 'resolvido',
        alertHandledBy: { id: user.id, name: user.name },
        alertHandledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

try {
        await updateDoc(orderRef, updatePayload);
        showToast(`Pedido #${orderData.orderNumber} liquidado e alerta resolvido!`, "success");
    } catch (error) {
        console.error(`firebaseService: Erro ao resolver pedido expirado ${orderId}:`, error);
        showToast("Falha ao resolver o alerta e liquidar o pedido.", "error");
        throw error;
    }
}

export async function fetchSalesDataForDashboard(startDate, endDate) {
    console.log(`fetchSalesDataForDashboard: Buscando dados de vendas entre ${startDate.toLocaleDateString()} e ${endDate.toLocaleDateString()}`);

try {
        const allProducts = await fetchAllProductsWithStock();
        const productsMap = new Map(allProducts.map(p => [p.id, p]));

const ordersRef = collection(db, "orders");
        const q = query(ordersRef,
            where("createdAt", ">=", startDate),
            where("createdAt", "<=", endDate)
        );

const querySnapshot = await getDocs(q);
        const orders = querySnapshot.docs.map(doc => doc.data()).filter(order =>
            order.status === 'ativo' || order.status === 'alterado'
        );

const productSummary = new Map();
        const customerSpending = new Map();
        const dailyRevenue = new Map();
        const categoryRevenue = new Map();
        const categoryQuantity = new Map();
        const salesByHour = new Map();

const missingProductIds = new Set();

orders.forEach(order => {
            const orderDate = order.createdAt instanceof Timestamp ? order.createdAt.toDate() : order.createdAt;
            if (!(orderDate instanceof Date)) return;

const orderDateString = orderDate.toISOString().split('T')[0];
            const orderHour = orderDate.getHours();

if (!dailyRevenue.has(orderDateString)) {
                dailyRevenue.set(orderDateString, 0);
            }
            dailyRevenue.set(orderDateString, dailyRevenue.get(orderDateString) + order.total);

const customerName = order.customer?.name || 'Cliente Desconhecido';
            if (!customerSpending.has(customerName)) {
                customerSpending.set(customerName, 0);
            }
            customerSpending.set(customerName, customerSpending.get(customerName) + order.total);

if (!salesByHour.has(orderHour)) {
                salesByHour.set(orderHour, 0);
            }
            salesByHour.set(orderHour, salesByHour.get(orderHour) + order.total);

(order.items || []).forEach(item => {
                const productDetails = productsMap.get(item.id);

if (!item.isManual && !productDetails) {
                    missingProductIds.add(item.id);
                }

const productName = item.isManual ? item.name : (productDetails?.name || item.name || 'Produto Desconhecido');
                let productCost = null;
                if (productDetails) {
                    if (typeof productDetails.cost === 'number') {
                        productCost = productDetails.cost;
                    } else if (typeof productDetails.costPercent === 'number' && typeof productDetails.price === 'number' && productDetails.price > 0) {
                        productCost = +(productDetails.price * (productDetails.costPercent / 100));
                    } else {
                        productCost = null;
                    }
                }
                const productCategory = item.isManual ? 'manual' : (productDetails?.category || item.category || 'outros');
                const productId = item.id || `manual_${productName.replace(/\s/g, '_')}`;

if (!productSummary.has(productId)) {
                    productSummary.set(productId, { id: productId, name: productName, category: productCategory, quantity: 0, revenue: 0, totalCost: 0, costIsDefined: productCost !== null });
                }

const summary = productSummary.get(productId);
                summary.quantity += item.quantity;
                summary.revenue += item.subtotal;
                if (summary.costIsDefined) {
                    summary.totalCost += item.quantity * productCost;
                }

if (!categoryRevenue.has(productCategory)) {
                    categoryRevenue.set(productCategory, 0);
                }
                categoryRevenue.set(productCategory, categoryRevenue.get(productCategory) + item.subtotal);

if (!categoryQuantity.has(productCategory)) {
                    categoryQuantity.set(productCategory, 0);
                }
                categoryQuantity.set(productCategory, categoryQuantity.get(productCategory) + item.quantity);
            });
        });

if (missingProductIds.size > 0) {
            const message = `[Dashboard Data] Análise histórica: ${missingProductIds.size} produto(s) que não existem mais no cardápio atual foram encontrados em pedidos antigos. Usando dados históricos do pedido para garantir a precisão do relatório. IDs:`;
            console.info(message, Array.from(missingProductIds));
        }

const productsList = Array.from(productSummary.values()).map(summary => ({
            ...summary,
            profit: summary.costIsDefined ? (summary.revenue - summary.totalCost) : null
        }));
        const totalGrossProfit = productsList.reduce((sum, p) => {
            return sum + (typeof p.profit === 'number' ? p.profit : 0);
        }, 0);
        const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
        const averageTicket = orders.length > 0 ? totalRevenue / orders.length : 0;

const topCustomerData = Array.from(customerSpending.entries()).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];
        const peakDayData = Array.from(dailyRevenue.entries()).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];

const salesByHourFormatted = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            value: salesByHour.get(i) || 0
        }));

return {
            products: productsList,
            totalGrossProfit,
            totalRevenue,
            averageTicket,
            topCustomer: { name: topCustomerData[0], totalSpent: topCustomerData[1] },
            salesPeak: { date: peakDayData[0], amount: peakDayData[1] },
            revenueByCategory: Array.from(categoryRevenue.entries()).map(([name, value]) => ({ name, value })),
            quantityByCategory: Array.from(categoryQuantity.entries()).map(([name, value]) => ({ name, value })),
            salesByHour: salesByHourFormatted,
            totalOrders: orders.length,
        };
    } catch (error) {
        console.error("fetchSalesDataForDashboard: Erro ao buscar e processar dados de vendas:", error);
        showToast("Erro ao carregar dados para o dashboard.", "error");
        return { products: [], totalGrossProfit: 0, totalRevenue: 0, averageTicket: 0, topCustomer: { name: 'N/A', totalSpent: 0 }, salesPeak: { date: 'N/A', amount: 0 }, revenueByCategory: [], quantityByCategory: [], salesByHour: [], totalOrders: 0 };
    }
}

export async function searchClientsByName(searchString) {
    if (!searchString || searchString.length < 2) {
        return [];
    }
    const formattedSearch = searchString.charAt(0).toUpperCase() + searchString.slice(1).toLowerCase();

console.log(`searchClientsByName: Buscando clientes que começam com: ${formattedSearch}`);
    const clientsRef = collection(db, "clients");
    const q = query(
        clientsRef,
        where("name", ">=", formattedSearch),
        where("name", "<=", formattedSearch + '\uf8ff'),
        limit(5) // Limita a 5 sugestões para não sobrecarregar a UI.
    );

try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Erro ao buscar clientes por nome:", error);
        return [];
    }
}

