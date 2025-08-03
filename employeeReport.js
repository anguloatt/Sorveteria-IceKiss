// employeeReport.js - Lógica e funcionalidades do Relatório do Funcionário

import { dom } from './domRefs.js'; // Importa o objeto dom centralizado
import {
    showToast, formatCurrency, getTodayDateString, formatDateToBR,
    formatDateTimeToBR, getProductInfoById, generateTicketText, printEmployeeReport
} from './utils.js'; // Importa funções utilitárias
import { db, currentUser, employeeReportData, productsConfig } from './app.js'; // Importa variáveis globais do app.js
import { fetchAllOrders } from './firebaseService.js'; // Importa funções de serviço Firebase
import { pendingAlerts } from './alertState.js'; // NOVO: Importa a lista de alertas pendentes

// Variável local para os dados do relatório do funcionário
// employeeReportData é importado de app.js e será a fonte de dados.

// Abre o modal de relatório do funcionário
export async function openEmployeeReport() {
    console.log("openEmployeeReport: Abrindo relatório do funcionário.");
    // CORRIGIDO: Removida a verificação detalhada aqui, pois o setupListeners já faz isso
    // O modal só deve ser aberto se o dom.employeeReport.modal existir.
    if (!dom.employeeReport || !dom.employeeReport.modal) {
        console.error("openEmployeeReport: Elemento do modal de relatório do funcionário não encontrado.");
        return;
    }
    // Limpa os filtros ao abrir
    if (dom.employeeReport.deliveryDatePicker) dom.employeeReport.deliveryDatePicker.value = '';
    if (dom.employeeReport.requestDatePicker) dom.employeeReport.requestDatePicker.value = '';
    if (dom.employeeReport.searchInput) dom.employeeReport.searchInput.value = '';
    if (dom.employeeReport.filterDevedor) dom.employeeReport.filterDevedor.checked = false;
    if (dom.employeeReport.filterPago) dom.employeeReport.filterPago.checked = false;
    
    await loadEmployeeReportData(); // Carrega os dados mais recentes
    switchEmployeeMainTab('pedidos'); // Define a aba padrão como "Pedidos"
    dom.employeeReport.modal.classList.add('active'); // Exibe o modal
}

// Carrega os dados de pedidos para o relatório do funcionário
async function loadEmployeeReportData() {
    console.log("loadEmployeeReportData: Carregando dados para o relatório do funcionário.");
    try {
        // Busca todos os pedidos via serviço Firebase
        const allOrders = await fetchAllOrders();
        
        // Mostra todos os pedidos para todos os funcionários, para que o relatório
        // seja uma ferramenta operacional completa, espelhando o que o lembrete de produção mostra.
        // O acesso a dados sensíveis (como relatórios financeiros) continua restrito ao gerente.
        employeeReportData.all = allOrders;

        filterAndDisplayEmployeeReport(); // Filtra e exibe os dados carregados
        console.log("loadEmployeeReportData: Dados do relatório do funcionário carregados.");
    } catch (error) {
        console.error("loadEmployeeReportData: Erro ao carregar dados do relatório do funcionário:", error);
        showToast("Erro ao carregar dados do relatório.", "error");
    }
}

// Filtra e exibe os dados do relatório do funcionário com base nos filtros da UI
function filterAndDisplayEmployeeReport() {
    console.log("filterAndDisplayEmployeeReport: Filtrando e exibindo relatório do funcionário.");
    if (!dom.employeeReport || !dom.employeeReport.requestDatePicker || !dom.employeeReport.deliveryDatePicker || !dom.employeeReport.searchInput || !dom.employeeReport.filterDevedor || !dom.employeeReport.filterPago || !dom.employeeReport.contentMainPedidos) {
        console.error("Elementos de filtro do relatório do funcionário não encontrados.");
        return;
    }
    const todayStr = getTodayDateString('dd/mm/yyyy');
    let dataToFilter = [...employeeReportData.all]; // Cria uma cópia para filtrar

    // Filtro por Data de Solicitação
    const requestDate = dom.employeeReport.requestDatePicker.value;
    if (requestDate) {
        const filterDate = new Date(requestDate);
        filterDate.setMinutes(filterDate.getMinutes() + filterDate.getTimezoneOffset()); // Ajusta para fuso horário local
        dataToFilter = dataToFilter.filter(order => {
            if (!order.createdAt) return false;
            const orderDate = order.createdAt.toDate();
            return orderDate.getFullYear() === filterDate.getFullYear() &&
                   orderDate.getMonth() === filterDate.getMonth() &&
                   orderDate.getDate() === filterDate.getDate();
        });
    }
    
    // Filtro por Data de Retirada
    const deliveryDateFilter = dom.employeeReport.deliveryDatePicker.value;
    const activeSubTab = document.querySelector('#employee-content-main-pedidos .active-tab')?.id;

    if (deliveryDateFilter) {
        // Se um filtro de data de retirada for aplicado, ele tem precedência sobre as abas.
        const [y, m, d] = deliveryDateFilter.split('-');
        const filterDateStr = `${d}/${m}/${y}`; // Converte para o formato DD/MM/YYYY
        dataToFilter = dataToFilter.filter(order => order.delivery?.date === filterDateStr);
    } else if (activeSubTab === 'employee-sub-tab-pedidos-dia') {
        // Se nenhuma data for selecionada, filtra pelos pedidos do dia
        dataToFilter = dataToFilter.filter(o => o.delivery?.date === todayStr);
    } else if (activeSubTab === 'employee-sub-tab-pedidos-futuros') {
        // Se nenhuma data for selecionada, filtra pelos pedidos futuros
        dataToFilter = dataToFilter.filter(o => {
            if (!o.delivery?.date) return false;
            try {
                const [day, month, year] = o.delivery.date.split('/');
                const deliveryDate = new Date(year, month - 1, day);
                const [todayDay, todayMonth, todayYear] = todayStr.split('/');
                const todayDate = new Date(todayYear, todayMonth - 1, todayDay);
                return deliveryDate > todayDate; // Compara datas
            } catch(e) { return false; } // Lida com datas inválidas
        });
    }

    // Filtro por Termo de Busca (nome do cliente ou número do pedido)
    const searchTerm = dom.employeeReport.searchInput.value.toLowerCase();
    if (searchTerm) {
        dataToFilter = dataToFilter.filter(order => 
            (order.customer?.name || '').toLowerCase().includes(searchTerm) || 
            String(order.orderNumber).includes(searchTerm)
        );
    }

    // Filtro por Status de Pagamento (Devedor/Pago)
    const showDevedor = dom.employeeReport.filterDevedor.checked;
    const showPago = dom.employeeReport.filterPago.checked;
    if (showDevedor && !showPago) {
        dataToFilter = dataToFilter.filter(order => order.paymentStatus === 'devedor' && order.status !== 'cancelado');
    } else if (!showDevedor && showPago) {
        dataToFilter = dataToFilter.filter(order => order.paymentStatus === 'pago' && order.status !== 'cancelado');
    } else if (showDevedor && showPago) {
        dataToFilter = dataToFilter.filter(order => order.status !== 'cancelado'); // Mostra todos não cancelados
    } else { // Se nenhum checkbox estiver marcado, mostra todos os pedidos não cancelados
        dataToFilter = dataToFilter.filter(order => order.status !== 'cancelado');
    }
    
    renderEmployeeReportTable(dataToFilter);
}

// Alterna entre as abas principais do relatório (Pedidos / Resumo de Produção)
function switchEmployeeMainTab(tab) {
    console.log("switchEmployeeMainTab: Alternando aba principal do relatório do funcionário:", tab);
    if (!dom.employeeReport || !dom.employeeReport.mainTabPedidos || !dom.employeeReport.mainTabProducao || !dom.employeeReport.contentMainPedidos || !dom.employeeReport.contentMainProducao) {
        console.error("Elementos da aba principal do relatório do funcionário não encontrados.");
        return;
    }
    dom.employeeReport.mainTabPedidos.classList.remove('active-tab');
    dom.employeeReport.mainTabProducao.classList.remove('active-tab');
    dom.employeeReport.contentMainPedidos.classList.add('hidden');
    dom.employeeReport.contentMainProducao.classList.add('hidden');
    
    // Adiciona as classes de estilo para o estado 'inativo'
    dom.employeeReport.mainTabPedidos.classList.add('text-gray-500', 'hover:text-gray-700', 'border-transparent');
    dom.employeeReport.mainTabProducao.classList.add('text-gray-500', 'hover:text-gray-700', 'border-transparent');


    if (tab === 'pedidos') {
        dom.employeeReport.mainTabPedidos.classList.add('active-tab', 'text-blue-600', 'border-blue-500');
        dom.employeeReport.mainTabPedidos.classList.remove('text-gray-500', 'hover:text-gray-700', 'border-transparent');
        dom.employeeReport.contentMainPedidos.classList.remove('hidden');
        switchEmployeeSubTab('pedidos-dia'); // Garante que a sub-aba padrão seja ativada
    } else { // 'producao'
        dom.employeeReport.mainTabProducao.classList.add('active-tab', 'text-blue-600', 'border-blue-500');
        dom.employeeReport.mainTabProducao.classList.remove('text-gray-500', 'hover:text-gray-700', 'border-transparent');
        dom.employeeReport.contentMainProducao.classList.remove('hidden');
        renderDailyProductionSummary(); // Renderiza o resumo de produção
    }
}

// Alterna entre as sub-abas de pedidos (Pedidos do Dia / Pedidos Futuros)
function switchEmployeeSubTab(subTab) {
    console.log("switchEmployeeSubTab: Alternando sub-aba do relatório do funcionário:", subTab);
    if (!dom.employeeReport || !dom.employeeReport.subTabPedidosDia || !dom.employeeReport.subTabPedidosFuturos) {
        console.error("Elementos da sub-aba do relatório do funcionário não encontrados.");
        return;
    }
    dom.employeeReport.subTabPedidosDia.classList.remove('active-tab', 'text-blue-600', 'border-blue-500');
    dom.employeeReport.subTabPedidosFuturos.classList.remove('active-tab', 'text-blue-600', 'border-blue-500');
    
    // Adiciona as classes de estilo para o estado 'inativo'
    dom.employeeReport.subTabPedidosDia.classList.add('text-gray-500', 'hover:text-gray-700', 'border-transparent');
    dom.employeeReport.subTabPedidosFuturos.classList.add('text-gray-500', 'hover:text-gray-700', 'border-transparent');


    if (subTab === 'pedidos-dia') {
        dom.employeeReport.subTabPedidosDia.classList.add('active-tab', 'text-blue-600', 'border-blue-500');
        dom.employeeReport.subTabPedidosDia.classList.remove('text-gray-500', 'hover:text-gray-700', 'border-transparent');
        filterAndDisplayEmployeeReport(); // Re-filtra e exibe para a nova sub-aba
    } else { // 'pedidos-futuros'
        dom.employeeReport.subTabPedidosFuturos.classList.add('active-tab', 'text-blue-600', 'border-blue-500');
        dom.employeeReport.subTabPedidosFuturos.classList.remove('text-gray-500', 'hover:text-gray-700', 'border-transparent');
        filterAndDisplayEmployeeReport(); // Re-filtra e exibe para a nova sub-aba
    }
}

// Renderiza a tabela de pedidos no relatório do funcionário
function renderEmployeeReportTable(orders) {
    console.log(`renderEmployeeReportTable: Renderizando tabela de relatório do funcionário com ${orders.length} pedidos.`);
    if (!dom.employeeReport || !dom.employeeReport.tableBody) {
        console.error("Elemento dom.employeeReport.tableBody não encontrado.");
        return;
    }
    const tableBody = dom.employeeReport.tableBody;
    tableBody.innerHTML = ''; // Limpa o corpo da tabela
    orders.forEach(order => {
        const row = tableBody.insertRow();
        row.className = `border-b hover:bg-gray-50 ${order.status === 'cancelado' ? 'opacity-50 bg-red-50' : ''}`; // Estilo para pedidos cancelados
        const allItems = [...(order.items || [])];
        const itemsSummary = allItems.map(i => `${i.quantity} ${i.name || getProductInfoById(i.id)?.name}`).join(', ');

        // NOVO: Verifica se o pedido tem um alerta pendente
        const hasAlert = pendingAlerts.some(alertOrder => alertOrder.id === order.id);
        const alertIcon = hasAlert ? '<span class="text-yellow-500" title="Pedido com pendência expirada">⚠️</span>' : '';

        row.innerHTML = `
            <td class="p-2 text-center"><input type="checkbox" class="highlight-checkbox order-checkbox" data-order-id="${order.id}"></td>
            <td class="py-2 px-3">${alertIcon} ${order.orderNumber}</td>
            <td class="py-2 px-3">${formatDateTimeToBR(order.createdAt)}</td>
            <td class="py-2 px-3">${order.customer?.name || 'N/A'}</td>
            <td class="py-2 px-3 text-xs" title="${itemsSummary}">${itemsSummary.substring(0, 30)}...</td>
            <td class="py-2 px-3 font-semibold">${formatCurrency(order.total)}</td>
            <td class="py-2 px-3 font-semibold ${order.restante > 0.01 ? 'text-orange-600' : 'text-green-600'}">${formatCurrency(order.restante)}</td>
            <td class="py-2 px-3">${order.delivery?.date || 'N/A'}</td>
            <td class="py-2 px-3">${order.delivery?.time || 'N/A'}</td>
            <td class="py-2 px-3 text-center no-print">
                <button class="text-green-500 hover:text-green-700 text-lg whatsapp-report-btn" data-phone="${order.customer?.phone}" data-order-id="${order.id}" title="Enviar WhatsApp para ${order.customer?.name}">
                    <i class="fab fa-whatsapp"></i>
                </button>
            </td>
            <td class="py-2 px-3 text-xs">${order.createdBy?.name || 'N/A'}</td>
            <td class="py-2 px-3 text-xs">${order.settledBy?.name || '---'}</td>
        `;
        // Adiciona listener para carregar o pedido no PDV ao dar duplo clique
        row.addEventListener('dblclick', async () => {
            const orderToLoad = employeeReportData.all.find(o => o.id === order.id);
            if (orderToLoad) {
                // Importa loadOrderIntoForm e outras funções do PDV dinamicamente para evitar circular dependency
                const pdvModule = await import('./pdv.js');
                pdvModule.loadOrderIntoForm(orderToLoad);
                dom.employeeReport.modal.classList.remove('active'); // Fecha o modal do relatório
                dom.mainContent.style.display = 'flex'; // Exibe o PDV
                dom.managerDashboard.style.display = 'none'; // Garante que o dashboard do gerente esteja oculto
                showToast(`Pedido ${orderToLoad.orderNumber} carregado no PDV para edição.`, "info");
            } else {
                showToast("Erro ao carregar pedido no PDV.", "error");
            }
        });
    });

    // Adiciona event listener para os botões de WhatsApp no relatório
    document.querySelectorAll('.whatsapp-report-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const phoneRaw = e.currentTarget.dataset.phone;
            const orderId = e.currentTarget.dataset.orderId;

            if (!phoneRaw) {
                showToast("Telefone do cliente não informado no relatório.", "error");
                console.error("whatsapp-report-btn: Telefone do cliente não encontrado no dataset.");
                return;
            }
            const phone = phoneRaw.replace(/\D/g, '');
            if (phone.length < 10) {
                showToast("Número de telefone inválido. Verifique o DDD e o número.", "error");
                console.error("whatsapp-report-btn: Número de telefone inválido:", phoneRaw);
                return;
            }

            const orderToShare = employeeReportData.all.find(o => o.id === orderId);
            if (!orderToShare) {
                showToast("Erro: Pedido não encontrado para gerar mensagem.", "error");
                console.error("whatsapp-report-btn: Pedido não encontrado para orderId:", orderId);
                return;
            }

            const ticketText = generateTicketText(orderToShare); // Usa generateTicketText de utils
            if (!ticketText) {
                showToast("Erro ao gerar mensagem do comprovante.", "error");
                console.error("whatsapp-report-btn: Mensagem do comprovante vazia.");
                return;
            }

            const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(ticketText)}`;
            console.log("whatsapp-report-btn: Abrindo URL do WhatsApp:", whatsappUrl);

            try {
                window.open(whatsappUrl, '_blank');
            } catch (e) {
                console.error("whatsapp-report-btn: Erro ao abrir janela do WhatsApp:", e);
                showToast("Não foi possível abrir o WhatsApp. Verifique as permissões do navegador.", "error");
            }
        });
    });
}

// Renderiza o resumo de produção diária
function renderDailyProductionSummary() {
    console.log("renderDailyProductionSummary: Renderizando resumo de produção diária.");
    if (!dom.employeeReport || !dom.employeeReport.dailySummaryDate || !dom.employeeReport.dailySummaryContent || !dom.employeeReport.totalSalgadosProducao) {
        console.error("Elementos de resumo de produção diária não encontrados.");
        return;
    }
    const summary = {};
    let totalSalgados = 0;
    // CORREÇÃO: Usar o formato de data correto (DD/MM/YYYY) para corresponder aos dados do pedido.
    const todayStr = getTodayDateString('dd/mm/yyyy');
    dom.employeeReport.dailySummaryDate.textContent = todayStr; // Exibe a data no formato correto para o usuário.
    
    // Filtra pedidos para a data de hoje e que não foram cancelados
    const ordersToSummarize = employeeReportData.all.filter(o => o.delivery?.date === todayStr && o.status !== 'cancelado');
    
    ordersToSummarize.forEach(order => {
        const allItems = [...(order.items || [])];
        allItems.forEach(item => {
            let key = item.name || getProductInfoById(item.id)?.name;
            if (key) {
                summary[key] = (summary[key] || 0) + item.quantity;
            }
            if (item.category === 'fritos' || item.category === 'assados') {
                totalSalgados += item.quantity;
            }
        });
    });
    
    dom.employeeReport.dailySummaryContent.innerHTML = Object.entries(summary).sort((a,b) => b[1] - a[1]).map(([name, qty]) => `<div class="flex justify-between items-center bg-white/60 p-1.5 rounded"><span class="truncate pr-2">${name}</span><span class="font-bold bg-amber-500 text-white rounded-full px-2 py-0.5">${qty}</span></div>`).join('') || '<p class="text-center col-span-full">Nenhum item para produzir hoje.</p>';
    dom.employeeReport.totalSalgadosProducao.textContent = totalSalgados;
}

// Configura os event listeners para o modal de relatório do funcionário
export function setupEmployeeReportListeners() {
    console.log("setupEmployeeReportListeners: Configurando listeners do relatório do funcionário.");
    // CORRIGIDO: Verificação mais robusta de todos os elementos necessários
    const essentialElements = [
        dom.employeeReport.closeBtn,
        dom.employeeReport.mainTabPedidos,
        dom.employeeReport.mainTabProducao,
        dom.employeeReport.subTabPedidosDia,
        dom.employeeReport.subTabPedidosFuturos,
        dom.employeeReport.deliveryDatePicker,
        dom.employeeReport.requestDatePicker,
        dom.employeeReport.searchInput,
        dom.employeeReport.filterDevedor,
        dom.employeeReport.filterPago,
        dom.employeeReport.printBtn
    ];

    if (essentialElements.every(el => el)) {
        dom.employeeReport.closeBtn.addEventListener('click', () => dom.employeeReport.modal.classList.remove('active'));
        dom.employeeReport.mainTabPedidos.addEventListener('click', () => switchEmployeeMainTab('pedidos'));
        dom.employeeReport.mainTabProducao.addEventListener('click', () => switchEmployeeMainTab('producao'));
        dom.employeeReport.subTabPedidosDia.addEventListener('click', () => switchEmployeeSubTab('pedidos-dia'));
        dom.employeeReport.subTabPedidosFuturos.addEventListener('click', () => switchEmployeeSubTab('pedidos-futuros'));

        const reportFilterListener = () => filterAndDisplayEmployeeReport();
        dom.employeeReport.deliveryDatePicker.addEventListener('change', reportFilterListener);
        dom.employeeReport.requestDatePicker.addEventListener('change', reportFilterListener);
        dom.employeeReport.searchInput.addEventListener('input', reportFilterListener);
        dom.employeeReport.filterDevedor.addEventListener('change', reportFilterListener);
        dom.employeeReport.filterPago.addEventListener('change', reportFilterListener);

        dom.employeeReport.printBtn.addEventListener('click', () => printEmployeeReport()); // Chama a função de impressão de utils
    } else {
        console.error("Elementos essenciais do relatório do funcionário não encontrados para configurar listeners.");
        essentialElements.forEach(el => {
            if (!el) {
                console.error(`Elemento essencial não encontrado: dom.employeeReport.${Object.keys(dom.employeeReport).find(key => dom.employeeReport[key] === el)}`);
            }
        });
    }
}
