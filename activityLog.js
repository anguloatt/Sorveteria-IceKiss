import { collection, query, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { showToast, formatDateTimeToBR } from './utils.js';

let allLogs = []; // Meu cache para os logs, para evitar múltiplas leituras do banco de dados.
let hasLoadedOnce = false; // Minha flag para controlar se o carregamento inicial já foi feito.

/**
 * Eu busco os logs de atividade do Firebase.
 * @param {object} db A instância do Firestore.
 * @returns {Promise<Array>} Retorno uma promessa que resolve para um array de logs.
 */
async function fetchActivityLogs(db) {
    // Se eu já carreguei os logs, retorno a versão em cache para economizar leituras.
    if (hasLoadedOnce) {
        console.log("Usando logs de atividade em cache.");
        return allLogs;
    }

    console.log("Buscando logs de atividade do Firebase...");
    try {
        const logsRef = collection(db, 'activityLog');
        // Ordeno por data/hora decrescente e limito aos últimos 200 para melhorar a performance.
        const q = query(logsRef, orderBy("timestamp", "desc"), limit(200));
        const querySnapshot = await getDocs(q);
        
        allLogs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        hasLoadedOnce = true; // Marco que o carregamento inicial foi feito.
        console.log("Logs de atividade carregados:", allLogs.length);
        return allLogs;
    } catch (error) {
        console.error("Erro ao buscar logs de atividade:", error);
        showToast("Falha ao carregar os logs de atividade.", "error");
        return [];
    }
}

/**
 * Eu renderizo os logs na tabela da interface do usuário.
 * @param {Array} logsToRender - O array de logs que vou exibir.
 */
function renderLogs(logsToRender) {
    const tableBody = document.getElementById('activity-log-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Limpo a tabela antes de adicionar os novos logs.

    if (logsToRender.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Nenhum registro encontrado para os filtros aplicados.</td></tr>';
        return;
    }

    logsToRender.forEach(log => {
        const row = document.createElement('tr');
        row.className = 'border-b hover:bg-gray-50';

        const timestamp = log.timestamp ? formatDateTimeToBR(log.timestamp.toDate()) : 'N/A';
        const user = log.user || 'Desconhecido';
        const action = log.action || 'N/A';
        const details = log.details && Object.keys(log.details).length > 0 ? JSON.stringify(log.details) : '--';

        row.innerHTML = `
            <td class="py-2 px-3 text-xs">${timestamp}</td>
            <td class="py-2 px-3 font-semibold">${user}</td>
            <td class="py-2 px-3">${action}</td>
            <td class="py-2 px-3 text-xs text-gray-600 font-mono">${details}</td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * Minha função para filtrar os logs com base nos inputs da UI e depois renderizá-los.
 */
function applyFilters() {
    const searchInput = document.getElementById('log-filter-search');
    const dateInput = document.getElementById('log-filter-date');
    if (!searchInput || !dateInput) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedDate = dateInput.value;

    let filteredLogs = allLogs.filter(log => 
        (!searchTerm || (log.user && log.user.toLowerCase().includes(searchTerm)) || (log.action && log.action.toLowerCase().includes(searchTerm))) &&
        (!selectedDate || (log.timestamp && log.timestamp.toDate().toISOString().split('T')[0] === selectedDate))
    );

    renderLogs(filteredLogs);
}

export async function initActivityLogView(db) {
    showToast("Carregando logs...", "info", 1500);
    const logs = await fetchActivityLogs(db);
    renderLogs(logs);
}

export function setupActivityLogListeners() {
    document.getElementById('log-filter-search')?.addEventListener('input', applyFilters);
    document.getElementById('log-filter-date')?.addEventListener('change', applyFilters);
    document.getElementById('log-clear-filters-btn')?.addEventListener('click', () => {
        document.getElementById('log-filter-search').value = '';
        document.getElementById('log-filter-date').value = '';
        renderLogs(allLogs);
    });
}