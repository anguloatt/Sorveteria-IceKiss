import { dom } from './domRefs.js';
import { formatCurrency, formatDateToBR, formatPhoneNumber as utilsFormatPhone, showToast, openWhatsappModal, chunkedRender } from './utils.js';
import { fetchClients } from './firebaseService.js';
import { deleteClientByPhone as deleteClientByPhoneSvc, addClient as addClientSvc, updateClientByPhone as updateClientByPhoneSvc } from './firebaseService.js';

// Tenta deletar cliente usando telefone formatado primeiro, depois apenas dígitos
async function tryDeleteClient(phone) {
    if (!phone) return false;
    try {
        console.log('manager-clients: tryDeleteClient: tentando deleção com telefone:', phone);
        let res = await deleteClientByPhoneSvc(phone);
        if (res) return true;
        // tentar sem formatação (apenas dígitos)
        const digits = phone.replace(/\D/g, '');
        if (digits && digits.length >= 10) {
            console.log('manager-clients: tryDeleteClient: tentando deleção com telefone (digits):', digits);
            res = await deleteClientByPhoneSvc(digits);
            if (res) return true;
        }
        return false;
    } catch (e) {
        console.error('manager-clients: tryDeleteClient erro:', e);
        return false;
    }
}

export let allClients = [];
export let clientsEventsAttached = false;

export async function loadClients() {
    console.log("loadClients: Carregando clientes.");
    if (!dom.manager || !dom.manager.clientsTableBody) {
        console.error("Elemento dom.manager.clientsTableBody não encontrado.");
        return;
    }
    allClients = await fetchClients();

    renderAlphaTabs();
    await renderClientsTable();
    setupClientsEvents();
    // contagens rápidas pós-load para depuração
    try {
        const editCount = dom.manager.clientsTableBody.querySelectorAll('.client-edit-btn').length;
        const deleteCount = dom.manager.clientsTableBody.querySelectorAll('.client-delete-btn').length;
        const waCount = dom.manager.clientsTableBody.querySelectorAll('.client-whatsapp-btn').length;
        console.log('manager-clients: postLoadCounts', { editCount, deleteCount, waCount });
    } catch (e) { console.log('manager-clients: erro coletando contagens pós-load', e); }
    console.log("loadClients: Clientes carregados e renderizados.");
}

// (Removido badge de debug para produção)

export function renderAlphaTabs() {
    if (!dom.manager.clientsAlphaTabs) return;
    const existingTabs = dom.manager.clientsAlphaTabs.querySelectorAll('.alpha-tab-btn:not([data-letter="all"])');
    existingTabs.forEach(tab => tab.remove());

const letterCounts = {};
    allClients.forEach(client => {
        const firstLetter = client.name.charAt(0).toUpperCase();
        letterCounts[firstLetter] = (letterCounts[firstLetter] || 0) + 1;
    });

for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const count = letterCounts[letter] || 0;
        const tabBtn = document.createElement('button');
        tabBtn.className = 'alpha-tab-btn';
        tabBtn.setAttribute('data-letter', letter);
        tabBtn.textContent = letter;
        if (count > 0) {
            const badge = document.createElement('span');
            badge.className = 'alpha-tab-badge';
            badge.textContent = count;
            tabBtn.appendChild(badge);
        }
        dom.manager.clientsAlphaTabs.appendChild(tabBtn);
    }
}

export async function renderClientsTable(filterLetter = null) {
    if (!dom.manager.clientsTableBody) return;
    dom.manager.clientsTableBody.innerHTML = '';

    let filteredClients = allClients;
    if (filterLetter && filterLetter !== 'all') {
        filteredClients = allClients.filter(client => client.name.charAt(0).toUpperCase() === filterLetter);
    }
    filteredClients.sort((a,b) => a.name.localeCompare(b.name));

    // Render em blocos para evitar travar a UI quando há muitos clientes
    await chunkedRender(filteredClients, (client) => {
        const rank = calculateClientRank(client);
        const status = getClientStatus(client);
        const frequency = getClientFrequency(client);
        const phones = getClientPhones(client);
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-2 text-center"><input type="checkbox" class="highlight-checkbox client-checkbox" data-phone="${client.phone}"></td>
            <td class="py-2 px-3 font-semibold">${client.name}</td>
            <td class="py-2 px-3">${phones}</td>
            <td class="py-2 px-3">${status}</td>
            <td class="py-2 px-3">${frequency}</td>
            <td class="py-2 px-3 text-right font-semibold ${client.totalDebt > 0.01 ? 'text-red-600' : 'text-green-600'}">${client.totalDebt > 0.01 ? formatCurrency(client.totalDebt) : 'Não tem débito'}</td>
            <td class="py-2 px-3 text-center align-middle">
                <span class="inline-block bg-blue-100 text-blue-800 text-base font-bold px-3 py-1 rounded-full">${client.orderCount}</span>
            </td>
            <td class="py-2 px-3">${formatDateToBR(client.firstOrderDate)}</td>
            <td class="py-2 px-3">
                <span class="px-3 py-1 text-xs font-bold rounded-full text-white ${rank.color} inline-flex items-center gap-1.5" title="Ranking do Cliente">
                    <i class="fas ${rank.icon}"></i><span>${rank.text}</span>
                </span>
            </td>
            <td class="py-2 px-3 text-center space-x-3">
                <button class="text-green-500 hover:text-green-700 text-lg client-whatsapp-btn" data-phone="${client.phone}" data-name="${client.name}" title="WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </button>
                <button class="text-blue-600 hover:text-blue-800 text-lg client-edit-btn" data-phone="${client.phone}" data-name="${client.name}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-red-600 hover:text-red-800 text-lg client-delete-btn" data-phone="${client.phone}" data-name="${client.name}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
    return tr;
    }, { container: dom.manager.clientsTableBody, chunkSize: 40, delay: 12 });

    // debug pós-render
    try {
        const editCount = dom.manager.clientsTableBody.querySelectorAll('.client-edit-btn').length;
        const deleteCount = dom.manager.clientsTableBody.querySelectorAll('.client-delete-btn').length;
        const waCount = dom.manager.clientsTableBody.querySelectorAll('.client-whatsapp-btn').length;
        const rowCount = dom.manager.clientsTableBody.querySelectorAll('tr').length;
        const tbodyStyle = window.getComputedStyle(dom.manager.clientsTableBody);
    console.log('manager-clients: renderComplete', { rowCount, editCount, deleteCount, waCount, pointerEvents: tbodyStyle.pointerEvents, display: tbodyStyle.display, visibility: tbodyStyle.visibility, zIndex: tbodyStyle.zIndex });
    } catch (e) {
    console.log('manager-clients: erro ao coletar info pos-render', e);
    }
}

export function getClientStatus(client) {
    if (client.totalDebt > 0.01) {
        return '<span class="client-status-badge client-status-devedor">Devedor</span>';
    }
    const lastOrderDate = client.lastOrderDate ? new Date(client.lastOrderDate) : null;
    const now = new Date();
    const daysSinceLastOrder = lastOrderDate ? Math.floor((now - lastOrderDate) / (1000 * 60 * 60 * 24)) : null;
    if (!lastOrderDate || daysSinceLastOrder > 90) {
        return '<span class="client-status-badge client-status-inativo">Inativo</span>';
    }
    return '<span class="client-status-badge client-status-ativo">Ativo</span>';
}

export function getClientFrequency(client) {
    const stars = Math.min(5, Math.max(1, Math.floor(client.orderCount / 2)));
    const starHtml = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    return `
        <div class="client-frequency">
            <span class="frequency-stars">${starHtml}</span>
            <span class="text-sm text-gray-600">${client.orderCount} pedidos</span>
        </div>
    `;
}

export function getClientPhones(client) {
    const phones = [];
    if (client.phone) phones.push({ number: client.phone, isPrimary: true });
    if (client.phones && Array.isArray(client.phones)) {
        client.phones.forEach(phone => { if (phone && phone !== client.phone) phones.push({ number: phone, isPrimary: false }); });
    }
    if (phones.length === 0) return '<span class="text-gray-400">Sem telefone</span>';
    if (phones.length === 1) return `<span class="font-mono">${utilsFormatPhone(phones[0].number)}</span>`;
    const phoneItems = phones.map(phone => `
        <div class="client-phone-item ${phone.isPrimary ? 'client-phone-primary' : ''}">
            <span class="font-mono">${utilsFormatPhone(phone.number)}</span>
            ${phone.isPrimary ? '<span class="text-xs bg-blue-100 text-blue-800 px-1 rounded">Principal</span>' : ''}
        </div>
    `).join('');
    return `<div class="client-phone-list">${phoneItems}</div>`;
}

export function setupClientsEvents() {
    if (clientsEventsAttached) return;
    clientsEventsAttached = true;
    
    console.log('manager-clients: setupClientsEvents - verificando elementos DOM');
    console.log('manager-clients: dom.manager.clientsTableBody existe?', !!dom.manager.clientsTableBody);
    
    if (dom.manager.clientsAlphaTabs) {
        dom.manager.clientsAlphaTabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('alpha-tab-btn')) {
                const letter = e.target.getAttribute('data-letter');
                dom.manager.clientsAlphaTabs.querySelectorAll('.alpha-tab-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                renderClientsTable(letter);
            }
        });
    }
    if (dom.manager.sendWhatsappMessagesBtn) dom.manager.sendWhatsappMessagesBtn.addEventListener('click', () => openWhatsappSendModal());
    if (dom.manager.sendGoodClientsBtn) dom.manager.sendGoodClientsBtn.addEventListener('click', () => sendToGoodClients());
    if (dom.manager.sendCustomSegmentBtn) dom.manager.sendCustomSegmentBtn.addEventListener('click', () => openMessageTemplatesModal());
    if (dom.manager.viewMarketingReportsBtn) dom.manager.viewMarketingReportsBtn.addEventListener('click', () => openMarketingReportsModal());
    if (dom.manager.nameSearch) dom.manager.nameSearch.addEventListener('input', () => applyAdvancedFilters());
    setupMarketingModalsEvents();
    const addClientBtn = document.getElementById('add-client-btn');
    if (addClientBtn) addClientBtn.addEventListener('click', () => openClientEditModal());

    if (dom.manager.clientsTableBody) {
        dom.manager.clientsTableBody.addEventListener('click', async (e) => {
            console.log('manager-clients: tabela click', e.target && (e.target.className || e.target.tagName));
            const editBtn = e.target.closest('.client-edit-btn');
            const deleteBtn = e.target.closest('.client-delete-btn');
            const whatsappBtn = e.target.closest('.client-whatsapp-btn');
            
            if (editBtn) { 
                console.log('manager-clients: editBtn clicked', editBtn.dataset); 
                const { phone } = editBtn.dataset; 
                const client = allClients.find(c => c.phone === phone); 
                console.log('manager-clients: cliente encontrado para editar:', client);
                try {
                    openClientEditModal(client); 
                } catch (e) {
                    console.error('manager-clients: erro ao chamar openClientEditModal:', e);
                }
                return; 
            }
            
            if (deleteBtn) { 
                console.log('manager-clients: deleteBtn clicked', deleteBtn.dataset); 
                const { phone, name } = deleteBtn.dataset; 
                if (!confirm(`Tem certeza que deseja excluir o cliente "${name}"?`)) return; 
                try {
                    console.log('manager-clients: iniciando deleção do cliente');
                    const deleted = await tryDeleteClient(phone); 
                    console.log('manager-clients: resultado da deleção:', deleted);
                    if (deleted) { 
                        await loadClients(); 
                        showToast('Cliente excluído com sucesso.', 'success'); 
                    } else { 
                        showToast('Não foi possível localizar/excluir o cliente. Verifique o telefone.', 'error'); 
                    } 
                } catch (e) {
                    console.error('manager-clients: erro durante deleção:', e);
                    showToast('Erro ao excluir cliente.', 'error');
                }
                return; 
            }
            
            if (whatsappBtn) { 
                console.log('manager-clients: whatsappBtn clicked', whatsappBtn.dataset); 
                const { name, phone } = whatsappBtn.dataset; 
                try {
                    openWhatsappModal(phone, name); 
                } catch (e) {
                    console.error('manager-clients: erro ao chamar openWhatsappModal:', e);
                    showToast(`Erro ao abrir WhatsApp: ${e.message}`, 'error');
                }
                return; 
            }
        });
    }
}

export function sendToGoodClients() {
    const goodClients = allClients.filter(client => client.orderCount >= 5 && client.totalDebt <= 0.01);
    if (goodClients.length === 0) { alert('Nenhum cliente atende aos critérios de "cliente bom" (5+ pedidos e sem débito).'); return; }
    const message = prompt(`Enviar mensagem para ${goodClients.length} clientes bons:\n\nDigite a mensagem:`);
    if (!message || message.trim() === '') return;
    if (!confirm(`Confirma o envio da mensagem para ${goodClients.length} clientes bons?`)) return;
    sendBulkMessages(goodClients, message, 'Clientes Bons');
}

export async function applyAdvancedFilters() {
    const nameSearch = dom.manager.nameSearch?.value?.toLowerCase().trim() || '';
    if (!nameSearch) { await renderClientsTable(); return; }
    const filteredClients = allClients.filter(client => client.name && client.name.toLowerCase().includes(nameSearch));
    await renderClientsTableWithFilters(filteredClients);
}

export function clearAdvancedFilters() {
    if (dom.manager.nameSearch) dom.manager.nameSearch.value = '';
    if (dom.manager.clientsAlphaTabs) {
        dom.manager.clientsAlphaTabs.querySelectorAll('.alpha-tab-btn').forEach(btn => btn.classList.remove('active'));
        const allTab = dom.manager.clientsAlphaTabs.querySelector('[data-letter="all"]');
        if (allTab) allTab.classList.add('active');
    }
    renderClientsTable();
}

export async function renderClientsTableWithFilters(filteredClients) {
    if (!dom.manager.clientsTableBody) return;
    dom.manager.clientsTableBody.innerHTML = '';
    filteredClients.sort((a,b) => a.name.localeCompare(b.name));

    // Reaproveita a renderização em blocos para a lista filtrada
    await chunkedRender(filteredClients, (client) => {
        const rank = calculateClientRank(client);
        const status = getClientStatus(client);
        const frequency = getClientFrequency(client);
        const phones = getClientPhones(client);
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-2 text-center"><input type="checkbox" class="highlight-checkbox client-checkbox" data-phone="${client.phone}"></td>
            <td class="py-2 px-3 font-semibold">${client.name}</td>
            <td class="py-2 px-3">${phones}</td>
            <td class="py-2 px-3">${status}</td>
            <td class="py-2 px-3">${frequency}</td>
            <td class="py-2 px-3 text-right font-semibold ${client.totalDebt > 0.01 ? 'text-red-600' : 'text-green-600'}">${client.totalDebt > 0.01 ? formatCurrency(client.totalDebt) : 'Não tem débito'}</td>
            <td class="py-2 px-3 text-center align-middle">
                <span class="inline-block bg-blue-100 text-blue-800 text-base font-bold px-3 py-1 rounded-full">${client.orderCount}</span>
            </td>
            <td class="py-2 px-3">${formatDateToBR(client.firstOrderDate)}</td>
            <td class="py-2 px-3">
                <span class="px-3 py-1 text-xs font-bold rounded-full text-white ${rank.color} inline-flex items-center gap-1.5" title="Ranking do Cliente">
                    <i class="fas ${rank.icon}"></i><span>${rank.text}</span>
                </span>
            </td>
            <td class="py-2 px-3 text-center space-x-3">
                <button class="text-green-500 hover:text-green-700 text-lg client-whatsapp-btn" data-phone="${client.phone}" data-name="${client.name}" title="WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </button>
                <button class="text-blue-600 hover:text-blue-800 text-lg client-edit-btn" data-phone="${client.phone}" data-name="${client.name}" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="text-red-600 hover:text-red-800 text-lg client-delete-btn" data-phone="${client.phone}" data-name="${client.name}" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        return tr;
    }, { container: dom.manager.clientsTableBody, chunkSize: 40, delay: 12 });

    // debug pós-render (filtrada)
    try {
        const editCount = dom.manager.clientsTableBody.querySelectorAll('.client-edit-btn').length;
        const deleteCount = dom.manager.clientsTableBody.querySelectorAll('.client-delete-btn').length;
        const waCount = dom.manager.clientsTableBody.querySelectorAll('.client-whatsapp-btn').length;
        const rowCount = dom.manager.clientsTableBody.querySelectorAll('tr').length;
        console.log('manager-clients: renderFilteredComplete', { rowCount, editCount, deleteCount, waCount });
    } catch (e) {
        console.log('manager-clients: erro ao coletar info pos-render filtrada', e);
    }
}

export function calculateClientRank(client) {
    if (!client) return { text: 'N/A', color: 'bg-gray-400', icon: 'fa-user' };
    if (client.totalDebt > 100) return { text: 'Devedor', color: 'bg-red-600', icon: 'fa-exclamation' };
    if (client.orderCount >= 20) return { text: 'VIP', color: 'bg-yellow-500', icon: 'fa-star' };
    if (client.orderCount >= 10) return { text: 'Fiel', color: 'bg-green-500', icon: 'fa-heart' };
    return { text: 'Comum', color: 'bg-blue-500', icon: 'fa-user' };
}

export function setupMarketingModalsEvents() {  
    console.log('manager-clients: setupMarketingModalsEvents chamado');
}
export function openWhatsappSendModal() {  
    // Usa modal estruturado existente (#whatsapp-send-modal)
    const modal = document.getElementById('whatsapp-send-modal');
    if (!modal) { showToast('Modal de envio WhatsApp não encontrado.', 'error'); return; }
    // Reset básico: limpa mensagem e desmarca radios
    const msgText = document.getElementById('whatsapp-message-text');
    if (msgText) msgText.value = '';
    document.querySelectorAll('input[name="client-selection"]').forEach(r=> r.checked = false);
    // Atualiza contador inicial
    try { updateWhatsappClientCount(); } catch(e) {}
    modal.classList.add('active');
}
export function openMessageTemplatesModal() {  
    const modal = document.getElementById('message-templates-modal');
    if (!modal) { showToast('Modal de templates não encontrado.', 'error'); return; }
    modal.classList.add('active');
}
export function openMarketingReportsModal() {  
    const modal = document.getElementById('marketing-reports-modal');
    if (!modal) { showToast('Modal de relatórios não encontrado.', 'error'); return; }
    try { populateMarketingReports(); } catch(e) { console.warn('populateMarketingReports falhou', e); }
    modal.classList.add('active');
}

let clientModalInitialized = false;
function _initClientEditModalOnce() {
    if (clientModalInitialized) return;
    const modal = document.getElementById('client-edit-modal');
    const form = document.getElementById('client-edit-form');
    const closeBtn = document.getElementById('client-edit-close-btn');
    const deleteBtn = document.getElementById('client-delete-btn');
    if (!modal || !form || !closeBtn || !deleteBtn) {
        console.warn('manager-clients: elementos do modal de cliente não encontrados para inicialização.');
        return;
    }
    // Fecha modal
    const close = () => {
        modal.classList.remove('active');
        modal.classList.add('hidden');
    };
    closeBtn.addEventListener('click', close);
    // Deletar cliente
    deleteBtn.addEventListener('click', async () => {
        const initialPhoneHidden = document.getElementById('client-edit-initial-phone');
        const phone = initialPhoneHidden?.value;
        if (!phone) return;
        if (!confirm('Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.')) return;
        try {
            const ok = await deleteClientByPhoneSvc(phone);
            if (ok) {
                showToast('Cliente excluído com sucesso.', 'success');
                close();
                await loadClients();
            } else {
                showToast('Não foi possível excluir (cliente não encontrado).', 'error');
            }
        } catch (e) {
            console.error('manager-clients: erro ao excluir cliente:', e);
            showToast('Erro ao excluir cliente.', 'error');
        }
    });
    // Submit do formulário (criar / editar)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstNameInput = document.getElementById('client-first-name');
        const lastNameInput = document.getElementById('client-last-name');
        const phone1Input = document.getElementById('client-phone-1');
        const phone2Input = document.getElementById('client-phone-2');
        const initialPhoneHidden = document.getElementById('client-edit-initial-phone');
        const firstName = firstNameInput?.value.trim();
        const lastName = lastNameInput?.value.trim();
        const phone1 = phone1Input?.value.trim();
        const phone2 = phone2Input?.value.trim();
        if (!firstName || !phone1) {
            showToast('Nome e Telefone 1 são obrigatórios.', 'error');
            return;
        }
        const savingToast = 'Salvando cliente...';
        showToast(savingToast, 'info', 1500);
        try {
            if (initialPhoneHidden?.value) {
                // Editar existente
                await updateClientByPhoneSvc(initialPhoneHidden.value, { firstName, lastName, phone1, phone2 });
                showToast('Cliente atualizado!', 'success');
            } else {
                // Novo
                await addClientSvc({ firstName, lastName, phone1, phone2 });
                showToast('Cliente adicionado!', 'success');
            }
            close();
            await loadClients();
        } catch (err) {
            console.error('manager-clients: erro ao salvar cliente:', err);
            showToast(`Falha ao salvar: ${err.message || 'erro desconhecido'}`, 'error', 4000);
        }
    });
    clientModalInitialized = true;
    console.log('manager-clients: modal de cliente inicializado.');
}

export function openClientEditModal(client = null) {
    console.log('manager-clients: openClientEditModal chamado com cliente:', client);
    _initClientEditModalOnce();
    const modal = document.getElementById('client-edit-modal');
    const title = document.getElementById('client-edit-modal-title');
    const form = document.getElementById('client-edit-form');
    const firstNameInput = document.getElementById('client-first-name');
    const lastNameInput = document.getElementById('client-last-name');
    const phone1Input = document.getElementById('client-phone-1');
    const phone2Input = document.getElementById('client-phone-2');
    const deleteBtn = document.getElementById('client-delete-btn');
    const initialPhoneHidden = document.getElementById('client-edit-initial-phone');
    if (!modal || !form) {
        showToast('Modal de cliente não encontrado no DOM.', 'error');
        return;
    }
    form.reset();
    if (deleteBtn) deleteBtn.classList.add('hidden');
    if (initialPhoneHidden) initialPhoneHidden.value = '';
    if (client && client.phone) {
        if (title) title.textContent = 'Editar Cliente';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
        if (initialPhoneHidden) initialPhoneHidden.value = client.phone;
        // Quebra nome em primeiro e restante
        const parts = (client.name || '').trim().split(/\s+/);
        if (firstNameInput) firstNameInput.value = parts.shift() || '';
        if (lastNameInput) lastNameInput.value = parts.join(' ');
        if (phone1Input) phone1Input.value = client.phone || '';
        if (phone2Input) {
            const secondary = Array.isArray(client.phones) ? client.phones.find(p => p !== client.phone) : '';
            phone2Input.value = secondary || '';
        }
    } else {
        if (title) title.textContent = 'Novo Cliente';
    }
    modal.classList.remove('hidden');
    modal.classList.add('active');
    if (firstNameInput) firstNameInput.focus();
}

export function sendBulkMessages(clients, message, tag) {  
    console.log('manager-clients: sendBulkMessages chamado', { clients: clients?.length, message, tag });
    if (!Array.isArray(clients) || clients.length === 0) { showToast('Nenhum cliente para envio.', 'error'); return; }
    _sendBulkWhatsapp(clients.map(c=>c.phone), message, tag);
}

// ---------------------- Funções Auxiliares Envio WhatsApp ----------------------
function _collectSelectedClientPhones() {
    const arr = [];
    document.querySelectorAll('.client-checkbox:checked').forEach(cb => {
        const phone = cb.getAttribute('data-phone');
        if (phone) arr.push(phone);
    });
    return arr;
}

function _openBulkWhatsappPrompt(phones) {
    // Agora direciona usuário para abrir modal completo ao invés de prompt
    openWhatsappSendModal();
    // Seleciona automaticamente opção 'selected'
    const selectedRadio = document.querySelector('input[name="client-selection"][value="selected"]');
    if (selectedRadio) {
        selectedRadio.checked = true;
        updateWhatsappClientCount();
    }
    showToast(`${phones.length} cliente(s) prontos. Escreva a mensagem e clique em Enviar.`, 'info');
}

function _sendBulkWhatsapp(phonesOrMessage, maybeMessage, tag='Lote', delayMs = 700) {
    let phones = phonesOrMessage;
    let message = maybeMessage;
    if (!Array.isArray(phones)) { console.warn('_sendBulkWhatsapp: uso incorreto'); return; }
    const clientsMap = new Map(allClients.map(c=>[c.phone,c]));
    let sent = 0;
    phones.forEach((rawPhone, idx) => {
        setTimeout(()=> {
            const clean = String(rawPhone).replace(/\D/g,'');
            const client = clientsMap.get(rawPhone) || allClients.find(c => (c.phones||[]).includes(rawPhone));
            const personalized = message.replace(/\{nome\}/g, client?.name || 'Cliente');
            const url = `https://wa.me/55${clean}?text=${encodeURIComponent(personalized)}`;
            window.open(url,'_blank');
            sent++;
            if (sent === phones.length) {
                showToast(`Envio concluído para ${sent} clientes.`, 'success', 4000);
                saveCampaignToHistory(tag, phones.length, message);
            }
    }, idx*delayMs); // delay configurável
    });
}

// Small additional exports expected by manager.js delegators
export function formatPhone(phone) { return utilsFormatPhone(phone); }

export function getClientStatusType(client) {
    if (client.totalDebt > 0.01) return 'devedor';
    const lastOrderDate = client.lastOrderDate ? new Date(client.lastOrderDate) : null;
    const now = new Date();
    const daysSinceLastOrder = lastOrderDate ? Math.floor((now - lastOrderDate) / (1000 * 60 * 60 * 24)) : null;
    if (!lastOrderDate || daysSinceLastOrder > 90) return 'inativo';
    return 'ativo';
}

// --- WhatsApp Bulk Modal Logic ---
const TEMPLATE_MESSAGES = {
    'promo-1': '🎉 Olá {nome}! Temos uma oferta especial esperando por você hoje! Responda para saber mais.',
    'promo-2': '💎 {nome}, cliente VIP merece desconto exclusivo! Fale comigo e aproveite.',
    'reminder-1': '📦 Oi {nome}, passando para lembrar que estamos prontos para seu próximo pedido. Posso ajudar?',
    'reminder-2': '🎂 {nome}! Aniversário chegando? Temos opções perfeitas para celebrar. Quer ver?',
    'relationship-1': '⭐ {nome}, sua opinião é muito importante. Pode nos dar um feedback rápido sobre seu último pedido?',
    'relationship-2': '😊 {nome}, sentimos sua falta! Volte a pedir com a gente, estamos por aqui.',
    'segment-1': '💬 Oi {nome}, percebemos um saldo em aberto. Podemos conversar para resolver de forma fácil?',
    'segment-2': '🆕 {nome}, chegaram novidades fresquinhas! Quer receber o catálogo atualizado?'
};

let _whatsappModalInitialized = false;
export function setupWhatsappSendModalEvents() {
    if (_whatsappModalInitialized) return;
    _whatsappModalInitialized = true;
    const modal = document.getElementById('whatsapp-send-modal');
    if (!modal) return;

    const closeBtn = document.getElementById('close-whatsapp-modal-btn');
    const sendBtn = document.getElementById('send-whatsapp-confirm-btn');
    const messageTypeSel = document.getElementById('message-type');
    const templateSelect = document.getElementById('message-template-select');
    const templateSection = document.getElementById('template-section');
    const customSection = document.getElementById('custom-message-section');
    const templatePreview = document.getElementById('template-preview');
    const templatePreviewText = document.getElementById('template-preview-text');

    function closeModal() { modal.classList.remove('active'); modal.classList.remove('flex'); }
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (sendBtn) sendBtn.addEventListener('click', sendWhatsappMessages);

    if (messageTypeSel) {
        messageTypeSel.addEventListener('change', () => {
            const val = messageTypeSel.value;
            if (val === 'template') {
                templateSection?.classList.remove('hidden');
                customSection?.classList.add('hidden');
            } else {
                templateSection?.classList.add('hidden');
                customSection?.classList.remove('hidden');
            }
        });
    }

    if (templateSelect) {
        templateSelect.addEventListener('change', () => {
            const key = templateSelect.value;
            if (TEMPLATE_MESSAGES[key]) {
                templatePreview?.classList.remove('hidden');
                templatePreviewText.textContent = TEMPLATE_MESSAGES[key];
            } else {
                templatePreview?.classList.add('hidden');
                templatePreviewText.textContent = '';
            }
        });
    }

    document.querySelectorAll('input[name="client-selection"]').forEach(radio => {
        radio.addEventListener('change', updateWhatsappClientCount);
    });
}

export function updateWhatsappClientCount() {
    const span = document.getElementById('selected-clients-count');
    if (!span) return;
    const selection = (document.querySelector('input[name="client-selection"]:checked')||{}).value;
    let clients = [];
    switch (selection) {
        case 'selected': clients = _getSelectedClients(); break;
        case 'all': clients = [...allClients]; break;
        case 'filtered': clients = [...allClients]; break; // TODO aplicar filtros reais
        case 'good': clients = allClients.filter(c => (c.orderCount||0) >= 5 && (c.totalDebt||0) <= 0.01); break;
        case 'active': clients = allClients.filter(c => getClientStatusType(c) === 'ativo'); break;
        case 'debtor': clients = allClients.filter(c => (c.totalDebt||0) > 0.01); break;
        default: clients = []; break;
    }
    span.textContent = clients.length.toString();
}

function _getSelectedClients() {
    const phones = _collectSelectedClientPhones();
    if (!phones.length) return [];
    return allClients.filter(c => phones.includes(c.phone) || (c.phones||[]).some(p => phones.includes(p)));
}

export function sendWhatsappMessages() {
    const selection = (document.querySelector('input[name="client-selection"]:checked')||{}).value;
    if (!selection) { showToast('Escolha um grupo de clientes.', 'error'); return; }
    let targetClients = [];
    switch (selection) {
        case 'selected': targetClients = _getSelectedClients(); break;
        case 'all': targetClients = [...allClients]; break;
        case 'filtered': targetClients = [...allClients]; break;
        case 'good': targetClients = allClients.filter(c => (c.orderCount||0) >= 5 && (c.totalDebt||0) <= 0.01); break;
        case 'active': targetClients = allClients.filter(c => getClientStatusType(c) === 'ativo'); break;
        case 'debtor': targetClients = allClients.filter(c => (c.totalDebt||0) > 0.01); break;
    }
    if (!targetClients.length) { showToast('Nenhum cliente para esse segmento.', 'error'); return; }
    const msgTypeSel = document.getElementById('message-type');
    const msgType = msgTypeSel ? msgTypeSel.value : 'custom';
    let baseMessage = '';
    if (msgType === 'template') {
        const tplSel = document.getElementById('message-template-select');
        const key = tplSel ? tplSel.value : '';
        if (!key || !TEMPLATE_MESSAGES[key]) { showToast('Escolha um template.', 'error'); return; }
        baseMessage = TEMPLATE_MESSAGES[key];
    } else {
        const ta = document.getElementById('whatsapp-message-text');
        baseMessage = ta ? (ta.value||'').trim() : '';
        if (!baseMessage) { showToast('Digite a mensagem.', 'error'); return; }
    }
    const confirmBefore = document.getElementById('confirm-before-send');
    if (confirmBefore?.checked) {
        const ok = window.confirm(`Enviar para ${targetClients.length} cliente(s)?`);
        if (!ok) return;
    }
    const delayChk = document.getElementById('delay-between-messages');
    const delayMs = delayChk?.checked ? 700 : 0;
    const phones = targetClients.map(c => (c.phone || (c.phones && c.phones[0]))).filter(Boolean);
    const segmentLabelMap = { selected: 'Selecionados', all: 'Todos', filtered: 'Filtrados', good: 'Clientes Bons', active: 'Ativos', debtor: 'Devedores' };
    _sendBulkWhatsapp(phones, baseMessage, segmentLabelMap[selection] || selection, delayMs);
    const modal = document.getElementById('whatsapp-send-modal');
    if (modal) { modal.classList.remove('active'); modal.classList.remove('flex'); }
    showToast('Iniciando envio...', 'info');
}

export function saveCampaignToHistory(segmentName, clientCount, message) {
    const campaign = {
        date: new Date().toLocaleDateString('pt-BR'),
        type: 'WhatsApp',
        segment: segmentName,
        sent: clientCount,
        status: 'Enviado',
        message: typeof message === 'string' ? message.substring(0, 50) + '...' : ''
    };
    const campaigns = JSON.parse(localStorage.getItem('marketingCampaigns') || '[]');
    campaigns.push(campaign);
    localStorage.setItem('marketingCampaigns', JSON.stringify(campaigns));
}

export function populateMarketingReports() {
    const general = document.getElementById('general-stats');
    const segmentation = document.getElementById('segmentation-stats');
    const campaignStats = document.getElementById('campaign-stats');
    const historyBody = document.getElementById('campaign-history-table');
    if (!general || !segmentation || !campaignStats) return;
    const total = allClients.length;
    const bons = allClients.filter(c=> (c.orderCount||0) >=5 && (c.totalDebt||0) <= 0.01);
    const devedores = allClients.filter(c=> (c.totalDebt||0) > 0.01);
    const ativos = allClients.filter(c=> getClientStatusType(c)==='ativo');
    const inativos = allClients.filter(c=> getClientStatusType(c)==='inativo');
    general.innerHTML = `
        <p>Total de Clientes: <strong>${total}</strong></p>
        <p>Ativos: <strong>${ativos.length}</strong></p>
        <p>Inativos: <strong>${inativos.length}</strong></p>
        <p>Clientes Bons: <strong>${bons.length}</strong></p>
        <p>Devedores: <strong>${devedores.length}</strong></p>`;
    segmentation.innerHTML = `
        <p>Clientes Bons (%): <strong>${total?((bons.length/total*100).toFixed(1)):'0'}%</strong></p>
        <p>Ativos (%): <strong>${total?((ativos.length/total*100).toFixed(1)):'0'}%</strong></p>
        <p>Devedores (%): <strong>${total?((devedores.length/total*100).toFixed(1)):'0'}%</strong></p>`;
    const campaigns = JSON.parse(localStorage.getItem('marketingCampaigns') || '[]');
    const last = campaigns[campaigns.length-1];
    campaignStats.innerHTML = `
        <p>Total Campanhas: <strong>${campaigns.length}</strong></p>
        <p>Última: <strong>${last?last.date+' ('+last.segment+')':'—'}</strong></p>
        <p>Última Qtde Enviada: <strong>${last?last.sent:'—'}</strong></p>`;
    if (historyBody) {
        historyBody.innerHTML = campaigns.slice(-50).reverse().map(c => `
            <tr class="border-b">
                <td class="p-2">${c.date}</td>
                <td class="p-2">${c.type}</td>
                <td class="p-2">${c.segment}</td>
                <td class="p-2">${c.sent}</td>
                <td class="p-2">${c.status}</td>
            </tr>`).join('');
    }
}
export function exportMarketingReport() {
    const total = allClients.length;
    const bons = allClients.filter(c=> (c.orderCount||0) >=5 && (c.totalDebt||0) <= 0.01);
    const devedores = allClients.filter(c=> (c.totalDebt||0) > 0.01);
    const ativos = allClients.filter(c=> getClientStatusType(c)==='ativo');
    const inativos = allClients.filter(c=> getClientStatusType(c)==='inativo');
    const campaigns = JSON.parse(localStorage.getItem('marketingCampaigns') || '[]');
    const lines = [
        ['Métrica','Valor'],
        ['Total Clientes', total],
        ['Ativos', ativos.length],
        ['Inativos', inativos.length],
        ['Clientes Bons', bons.length],
        ['Devedores', devedores.length],
        ['Total Campanhas', campaigns.length]
    ];
    const csv = lines.map(l=>l.join(';')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio_marketing.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Relatório exportado.', 'success');
}

// Reports modal init
let _reportsModalInit = false;
function _initReportsModalEvents() {
    if (_reportsModalInit) return; _reportsModalInit = true;
    const closeBtn = document.getElementById('close-reports-modal-btn');
    const exportBtn = document.getElementById('export-reports-btn');
    const modal = document.getElementById('marketing-reports-modal');
    function close() { modal?.classList.remove('active'); modal?.classList.remove('flex'); }
    closeBtn?.addEventListener('click', close);
    exportBtn?.addEventListener('click', exportMarketingReport);
}

// Templates modal init
let _templatesModalInit = false;
function _initTemplatesModalEvents() {
    if (_templatesModalInit) return; _templatesModalInit = true;
    const modal = document.getElementById('message-templates-modal');
    const closeBtn = document.getElementById('close-templates-modal-btn');
    const useBtn = document.getElementById('use-template-btn');
    const textarea = document.getElementById('custom-message-template');
    const targetMessage = document.getElementById('whatsapp-message-text');
    function close() { modal?.classList.remove('active'); modal?.classList.remove('flex'); }
    closeBtn?.addEventListener('click', close);
    useBtn?.addEventListener('click', () => {
        const val = (textarea?.value||'').trim();
        if (!val) { showToast('Digite ou selecione um template.', 'error'); return; }
        if (targetMessage) targetMessage.value = val;
        const msgTypeSel = document.getElementById('message-type');
        if (msgTypeSel) { msgTypeSel.value = 'custom'; msgTypeSel.dispatchEvent(new Event('change')); }
        close();
        showToast('Template aplicado.', 'success');
    });
}

// Deferred init to ensure DOM present
setTimeout(() => {
    try { setupWhatsappSendModalEvents(); } catch(e) { console.warn(e); }
    try { _initReportsModalEvents(); } catch(e) { console.warn(e); }
    try { _initTemplatesModalEvents(); } catch(e) { console.warn(e); }
}, 0);

