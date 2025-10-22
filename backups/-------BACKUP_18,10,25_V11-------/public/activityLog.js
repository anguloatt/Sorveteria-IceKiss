import { collection, query, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { showToast, formatDateTimeToBR } from './utils.js';
import { db } from './firebase-config.js'; // AÇÃO CORRETIVA: Importo a instância do Firestore diretamente.

let allLogs = []; // Meu cache para os logs, para evitar múltiplas leituras do banco de dados.
let hasLoadedOnce = false; // Minha flag para controlar se o carregamento inicial já foi feito.

async function fetchActivityLogs() {
    if (hasLoadedOnce) {
        console.log("Usando logs de atividade em cache.");
        return allLogs;
    }

console.log("Buscando logs de atividade do Firebase...");
    try {
        const logsRef = collection(db, 'activity_logs');
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
        const user = log.user || log.userName || 'Desconhecido'; // Compatibilidade com logs antigos (userName)
        const action = log.action || log.type || 'N/A'; // Compatibilidade com logs antigos (type)
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

export async function initActivityLogView() {
    showToast("Carregando logs...", "info", 1500);
    const logs = await fetchActivityLogs();
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

