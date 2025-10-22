// Versão reconstruída avançada do módulo de clientes.
// Funcionalidades: renderização chunked, CRUD, envio WhatsApp segmentado, relatórios de marketing.

import { dom } from './domRefs.js';
import {
  formatCurrency,
  formatDateToBR,
  formatPhone as utilsFormatPhone,
  showToast,
  openWhatsappModal,
  chunkedRender
} from './utils.js';
import {
  fetchClients,
  addClient,
  updateClientByPhone,
  deleteClientByPhone
} from './firebaseService.js';

// ---------------- Estado -----------------
export let allClients = [];
let clientsEventsAttached = false;

// Wrappers de serviço (normalizam parâmetros vindos do modal)
async function addClientSvc({ firstName, lastName, phone1, phone2 }) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const phones = [phone1, phone2].filter(p => p && p !== phone1);
  await addClient({ name, phone: phone1, phones });
}
async function updateClientByPhoneSvc(initialPhone, { firstName, lastName, phone1, phone2 }) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const phones = [phone1, phone2].filter(p => p && p !== phone1);
  await updateClientByPhone(initialPhone, { name, phone: phone1, phones });
}
async function deleteClientByPhoneSvc(phone) {
  return deleteClientByPhone(phone);
}
async function tryDeleteClient(phone) {
  try { return await deleteClientByPhoneSvc(phone); } catch { return false; }
}

// Carrega clientes e dispara renderizações iniciais
export async function loadClients() {
  try {
    const data = await fetchClients();
    allClients = Array.isArray(data) ? data.map(c => ({
      name: c.name || 'Sem Nome',
      phone: c.phone || '',
      phones: c.phones || [],
      orderCount: c.orderCount || 0,
      totalDebt: c.totalDebt || 0,
      firstOrderDate: c.firstOrderDate || null,
      lastOrderDate: c.lastOrderDate || null
    })) : [];
    renderAlphaTabs();
    await renderClientsTable();
    if (!clientsEventsAttached) setupClientsEvents();
    // Debug opcional
    try {
      const editCount = dom.manager?.clientsTableBody?.querySelectorAll('.client-edit-btn').length || 0;
      const deleteCount = dom.manager?.clientsTableBody?.querySelectorAll('.client-delete-btn').length || 0;
      const waCount = dom.manager?.clientsTableBody?.querySelectorAll('.client-whatsapp-btn').length || 0;
      console.log('manager-clients: loadClients pós-render', { editCount, deleteCount, waCount });
    } catch {}
  } catch (err) {
    console.error('manager-clients: falha ao carregar clientes', err);
    showToast('Erro ao carregar clientes.', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(loadClients, 50));
} else {
  setTimeout(loadClients, 50);
}

// ---------------- Abas Alfabéticas -----------------
export function renderAlphaTabs() {
  if (!dom.manager?.clientsAlphaTabs) return;
  const wrapper = dom.manager.clientsAlphaTabs;
  wrapper.querySelectorAll('.alpha-tab-btn:not([data-letter="all"])').forEach(el => el.remove());
  const letterCounts = {};
  allClients.forEach(c => {
    const l = (c.name || '').charAt(0).toUpperCase();
    if (l) letterCounts[l] = (letterCounts[l] || 0) + 1;
  });
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const count = letterCounts[letter] || 0;
    const btn = document.createElement('button');
    btn.className = 'alpha-tab-btn';
    btn.dataset.letter = letter;
    btn.textContent = letter;
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'alpha-tab-badge';
      badge.textContent = count;
      btn.appendChild(badge);
    }
    wrapper.appendChild(btn);
  }
}

// ---------------- Tabela (renderização chunked) -----------------
export async function renderClientsTable(filterLetter = null) {
  if (!dom.manager?.clientsTableBody) return;
  const tbody = dom.manager.clientsTableBody;
  tbody.innerHTML = '';
  let filtered = allClients;
  if (filterLetter && filterLetter !== 'all') {
    filtered = allClients.filter(c => (c.name || '').charAt(0).toUpperCase() === filterLetter);
  }
  filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  await chunkedRender(filtered, (client) => buildClientRow(client), {
    container: tbody,
    chunkSize: 40,
    delay: 10
  });

  // Pós depuração
  try {
    const rowCount = tbody.querySelectorAll('tr').length;
    console.log('manager-clients: renderClientsTable concluída', { rowCount });
  } catch {}
}

export async function renderClientsTableWithFilters(filteredClients) {
  if (!dom.manager?.clientsTableBody) return;
  const tbody = dom.manager.clientsTableBody;
  tbody.innerHTML = '';
  const list = [...filteredClients].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  await chunkedRender(list, (client) => buildClientRow(client), {
    container: tbody,
    chunkSize: 40,
    delay: 10
  });
}

function buildClientRow(client) {
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
      </td>`;
  return tr;
}

// ---------------- Status / Frequência / Telefones -----------------
export function getClientStatus(client) {
  if (client.totalDebt > 0.01) return '<span class="client-status-badge client-status-devedor">Devedor</span>';
  const lastOrderDate = client.lastOrderDate ? new Date(client.lastOrderDate) : null;
  const now = new Date();
  const days = lastOrderDate ? Math.floor((now - lastOrderDate) / 86400000) : null;
  if (!lastOrderDate || days > 90) return '<span class="client-status-badge client-status-inativo">Inativo</span>';
  return '<span class="client-status-badge client-status-ativo">Ativo</span>';
}

export function getClientFrequency(client) {
  const stars = Math.min(5, Math.max(1, Math.floor((client.orderCount || 0) / 2)));
  const starHtml = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  return `<div class="client-frequency"><span class="frequency-stars">${starHtml}</span><span class="text-sm text-gray-600">${client.orderCount} pedidos</span></div>`;
}

export function getClientPhones(client) {
  const phones = [];
  if (client.phone) phones.push({ number: client.phone, isPrimary: true });
  if (Array.isArray(client.phones)) {
    client.phones.forEach(p => { if (p && p !== client.phone) phones.push({ number: p, isPrimary: false }); });
  }
  if (phones.length === 0) return '<span class="text-gray-400">Sem telefone</span>';
  if (phones.length === 1) return `<span class="font-mono">${utilsFormatPhone(phones[0].number)}</span>`;
  return `<div class="client-phone-list">${phones.map(ph => `<div class="client-phone-item ${ph.isPrimary ? 'client-phone-primary' : ''}"><span class="font-mono">${utilsFormatPhone(ph.number)}</span>${ph.isPrimary ? '<span class="text-xs bg-blue-100 text-blue-800 px-1 rounded">Principal</span>' : ''}</div>`).join('')}</div>`;
}

// ---------------- Filtros -----------------
export async function applyAdvancedFilters() {
  const nameSearch = dom.manager?.nameSearch?.value?.toLowerCase().trim() || '';
  if (!nameSearch) { await renderClientsTable(); return; }
  const filtered = allClients.filter(c => c.name && c.name.toLowerCase().includes(nameSearch));
  await renderClientsTableWithFilters(filtered);
}

export function clearAdvancedFilters() {
  if (dom.manager?.nameSearch) dom.manager.nameSearch.value = '';
  if (dom.manager?.clientsAlphaTabs) {
    dom.manager.clientsAlphaTabs.querySelectorAll('.alpha-tab-btn').forEach(btn => btn.classList.remove('active'));
    const allTab = dom.manager.clientsAlphaTabs.querySelector('[data-letter="all"]');
    allTab?.classList.add('active');
  }
  renderClientsTable();
}

// ---------------- Eventos -----------------
export function setupClientsEvents() {
  if (clientsEventsAttached) return; // evita múltiplos binds
  clientsEventsAttached = true;
  const tabs = dom.manager?.clientsAlphaTabs;
  if (tabs) {
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.alpha-tab-btn');
      if (!btn) return;
      const letter = btn.dataset.letter;
      tabs.querySelectorAll('.alpha-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderClientsTable(letter);
    });
  }
  dom.manager?.sendWhatsappMessagesBtn?.addEventListener('click', () => openWhatsappSendModal());
  dom.manager?.sendGoodClientsBtn?.addEventListener('click', () => sendToGoodClients());
  dom.manager?.sendCustomSegmentBtn?.addEventListener('click', () => openMessageTemplatesModal());
  dom.manager?.viewMarketingReportsBtn?.addEventListener('click', () => openMarketingReportsModal());
  dom.manager?.nameSearch?.addEventListener('input', () => applyAdvancedFilters());
  setupMarketingModalsEvents();
  document.getElementById('add-client-btn')?.addEventListener('click', () => openClientEditModal());

  dom.manager?.clientsTableBody?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.client-edit-btn');
    const deleteBtn = e.target.closest('.client-delete-btn');
    const whatsappBtn = e.target.closest('.client-whatsapp-btn');
    if (editBtn) {
      const client = allClients.find(c => c.phone === editBtn.dataset.phone);
      openClientEditModal(client);
      return;
    }
    if (deleteBtn) {
      const { phone, name } = deleteBtn.dataset;
      if (!confirm(`Tem certeza que deseja excluir o cliente "${name}"?`)) return;
      const ok = await tryDeleteClient(phone);
      if (ok) { await loadClients(); showToast('Cliente excluído com sucesso.', 'success'); }
      else showToast('Não foi possível excluir cliente (telefone não encontrado).', 'error');
      return;
    }
    if (whatsappBtn) {
      const { name, phone } = whatsappBtn.dataset;
      openWhatsappModal(phone, name);
    }
  });
}

// ---------------- Segmentação / Envio simples -----------------
let goodClientsModalInitialized = false;
export function sendToGoodClients() {
  const good = allClients.filter(c => (c.orderCount || 0) >= 5 && (c.totalDebt || 0) <= 0.01);
  if (good.length === 0) { showToast('Nenhum cliente bom encontrado (5+ pedidos e sem débito).', 'info'); return; }
  const modal = document.getElementById('good-clients-modal');
  const countEl = document.getElementById('good-clients-count');
  const msgEl = document.getElementById('good-clients-message');
  if (!modal || !countEl || !msgEl) { console.warn('Modal Clientes Bons não encontrado.'); return; }
  countEl.textContent = `${good.length} cliente(s) qualificado(s).`;
  msgEl.value = 'Olá {nome}! Temos uma novidade especial para você hoje.';
  modal.classList.add('active');
  modal.classList.remove('hidden');
  if (!goodClientsModalInitialized) {
    goodClientsModalInitialized = true;
    const close = () => { modal.classList.add('hidden'); modal.classList.remove('active'); };
    document.getElementById('good-clients-close-btn')?.addEventListener('click', close);
    document.getElementById('good-clients-cancel-btn')?.addEventListener('click', close);
    document.getElementById('good-clients-send-btn')?.addEventListener('click', () => {
      const text = msgEl.value.trim();
      if (!text) { showToast('Digite a mensagem.', 'error'); return; }
      close();
      sendBulkMessages(good, text, 'Clientes Bons');
      showToast('Iniciando envio para clientes bons...', 'success');
    });
  }
}

// ---------------- Ranking -----------------
export function calculateClientRank(client) {
  if (!client) return { text: 'N/A', color: 'bg-gray-400', icon: 'fa-user' };
  if (client.totalDebt > 100) return { text: 'Devedor', color: 'bg-red-600', icon: 'fa-exclamation' };
  if (client.orderCount >= 20) return { text: 'VIP', color: 'bg-yellow-500', icon: 'fa-star' };
  if (client.orderCount >= 10) return { text: 'Fiel', color: 'bg-green-500', icon: 'fa-heart' };
  return { text: 'Comum', color: 'bg-blue-500', icon: 'fa-user' };
}

// ---------------- CRUD Modal Cliente -----------------
let clientModalInitialized = false;
function initClientEditModalOnce() {
  if (clientModalInitialized) return;
  const modal = document.getElementById('client-edit-modal');
  const form = document.getElementById('client-edit-form');
  const closeBtn = document.getElementById('client-edit-close-btn');
  const deleteBtn = document.getElementById('client-delete-btn');
  if (!modal || !form || !closeBtn) {
    console.warn('manager-clients: modal de cliente não encontrado para init.');
    return;
  }
  const close = () => { modal.classList.remove('active'); modal.classList.add('hidden'); };
  closeBtn.addEventListener('click', close);
  deleteBtn?.addEventListener('click', async () => {
    const initialPhone = document.getElementById('client-edit-initial-phone')?.value;
    if (!initialPhone) return;
    if (!confirm('Excluir este cliente?')) return;
    try {
      const ok = await deleteClientByPhoneSvc(initialPhone);
      if (ok) { showToast('Cliente excluído.', 'success'); close(); await loadClients(); }
      else showToast('Cliente não encontrado para exclusão.', 'error');
    } catch (e) {
      console.error(e);
      showToast('Erro ao excluir cliente.', 'error');
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('client-first-name')?.value.trim();
    const lastName = document.getElementById('client-last-name')?.value.trim();
    const phone1 = document.getElementById('client-phone-1')?.value.trim();
    const phone2 = document.getElementById('client-phone-2')?.value.trim();
    const initialPhone = document.getElementById('client-edit-initial-phone')?.value;
    if (!firstName || !phone1) { showToast('Nome e Telefone 1 são obrigatórios.', 'error'); return; }
    try {
      if (initialPhone) {
        await updateClientByPhoneSvc(initialPhone, { firstName, lastName, phone1, phone2 });
        showToast('Cliente atualizado!', 'success');
      } else {
        await addClientSvc({ firstName, lastName, phone1, phone2 });
        showToast('Cliente adicionado!', 'success');
      }
      close();
      await loadClients();
    } catch (err) {
      console.error('manager-clients: erro ao salvar cliente', err);
      showToast('Falha ao salvar cliente.', 'error');
    }
  });
  clientModalInitialized = true;
}

export function openClientEditModal(client = null) {
  initClientEditModalOnce();
  const modal = document.getElementById('client-edit-modal');
  const title = document.getElementById('client-edit-modal-title');
  const firstNameInput = document.getElementById('client-first-name');
  const lastNameInput = document.getElementById('client-last-name');
  const phone1Input = document.getElementById('client-phone-1');
  const phone2Input = document.getElementById('client-phone-2');
  const deleteBtn = document.getElementById('client-delete-btn');
  const initialPhoneHidden = document.getElementById('client-edit-initial-phone');
  if (!modal) { showToast('Modal de cliente não encontrado.', 'error'); return; }
  if (client && client.phone) {
    const parts = (client.name || '').trim().split(/\s+/);
    const first = parts.shift() || '';
    firstNameInput.value = first;
    lastNameInput.value = parts.join(' ');
    phone1Input.value = client.phone || '';
    phone2Input.value = (client.phones || []).find(p => p !== client.phone) || '';
    deleteBtn?.classList.remove('hidden');
    title.textContent = 'Editar Cliente';
    initialPhoneHidden.value = client.phone;
  } else {
    firstNameInput.value = '';
    lastNameInput.value = '';
    phone1Input.value = '';
    phone2Input.value = '';
    deleteBtn?.classList.add('hidden');
    title.textContent = 'Novo Cliente';
    initialPhoneHidden.value = '';
  }
  modal.classList.remove('hidden');
  modal.classList.add('active');
  firstNameInput.focus();
}

// ---------------- WhatsApp & Marketing (modais + stubs evoluídos) -----------------
export function setupMarketingModalsEvents() {
  // Poderemos adicionar lógica adicional aqui futuramente.
}

export function openWhatsappSendModal() {
  const modal = document.getElementById('whatsapp-send-modal');
  if (!modal) { showToast('Modal de envio WhatsApp não encontrado.', 'error'); return; }
  modal.classList.add('active');
  modal.classList.add('flex');
  updateWhatsappClientCount();
}

export function openMessageTemplatesModal() {
  const modal = document.getElementById('message-templates-modal');
  if (!modal) { showToast('Modal de templates não encontrado.', 'error'); return; }
  modal.classList.add('active');
  modal.classList.add('flex');
}

export function openMarketingReportsModal() {
  const modal = document.getElementById('marketing-reports-modal');
  if (!modal) { showToast('Modal de relatórios não encontrado.', 'error'); return; }
  try { populateMarketingReports(); } catch (e) { console.warn('populateMarketingReports falhou', e); }
  modal.classList.add('active');
  modal.classList.add('flex');
}

// Ranking de status tipado
export function getClientStatusType(client) {
  if (client.totalDebt > 0.01) return 'devedor';
  const lastOrderDate = client.lastOrderDate ? new Date(client.lastOrderDate) : null;
  const now = new Date();
  const days = lastOrderDate ? Math.floor((now - lastOrderDate) / 86400000) : null;
  if (!lastOrderDate || days > 90) return 'inativo';
  return 'ativo';
}

// WhatsApp modal (seleção / contagem / envio)
let whatsappModalInitialized = false;
export function setupWhatsappSendModalEvents() {
  if (whatsappModalInitialized) return;
  whatsappModalInitialized = true;
  const modal = document.getElementById('whatsapp-send-modal');
  if (!modal) return;
  document.getElementById('close-whatsapp-modal-btn')?.addEventListener('click', () => {
    modal.classList.remove('active'); modal.classList.remove('flex');
  });
  document.getElementById('send-whatsapp-confirm-btn')?.addEventListener('click', sendWhatsappMessages);
  document.querySelectorAll('input[name="client-selection"]').forEach(r => r.addEventListener('change', updateWhatsappClientCount));
  document.getElementById('message-type')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const templateSection = document.getElementById('template-section');
    const customSection = document.getElementById('custom-message-section');
    if (val === 'template') { templateSection?.classList.remove('hidden'); customSection?.classList.add('hidden'); }
    else { templateSection?.classList.add('hidden'); customSection?.classList.remove('hidden'); }
  });
  document.getElementById('message-template-select')?.addEventListener('change', (e) => {
    const key = e.target.value;
    if (TEMPLATE_MESSAGES[key]) {
      document.getElementById('template-preview')?.classList.remove('hidden');
      const previewText = document.getElementById('template-preview-text');
      if (previewText) previewText.textContent = TEMPLATE_MESSAGES[key];
    } else {
      document.getElementById('template-preview')?.classList.add('hidden');
    }
  });
}

const TEMPLATE_MESSAGES = {
  'promo-1': '🎉 Olá {nome}! Temos uma oferta especial para hoje! Responda para saber mais.',
  'promo-2': '💎 {nome}, cliente VIP merece desconto exclusivo! Fale comigo e aproveite.',
  'reminder-1': '📦 Oi {nome}, lembrando que estamos prontos para seu próximo pedido. Posso ajudar?',
  'reminder-2': '🎂 {nome}! Aniversário chegando? Temos opções perfeitas para celebrar.',
  'relationship-1': '⭐ {nome}, sua opinião é importante. Pode dar feedback sobre seu último pedido?',
  'relationship-2': '😊 {nome}, sentimos sua falta! Volte a pedir com a gente.',
  'segment-1': '💬 Oi {nome}, notamos um saldo em aberto. Podemos resolver de forma fácil?',
  'segment-2': '🆕 {nome}, chegaram novidades! Quer receber o catálogo?' 
};

export function updateWhatsappClientCount() {
  const span = document.getElementById('selected-clients-count');
  if (!span) return;
  const selection = (document.querySelector('input[name="client-selection"]:checked') || {}).value;
  let target = [];
  switch (selection) {
    case 'selected': target = _getSelectedClients(); break;
    case 'all': target = [...allClients]; break;
    case 'filtered': target = [...allClients]; break; // futuro: aplicar filtros reais
    case 'good': target = allClients.filter(c => (c.orderCount || 0) >= 5 && (c.totalDebt || 0) <= 0.01); break;
    case 'active': target = allClients.filter(c => getClientStatusType(c) === 'ativo'); break;
    case 'debtor': target = allClients.filter(c => (c.totalDebt || 0) > 0.01); break;
    default: target = []; break;
  }
  span.textContent = target.length.toString();
}

function _getSelectedClients() {
  const phones = [];
  document.querySelectorAll('.client-checkbox:checked').forEach(cb => {
    const p = cb.getAttribute('data-phone');
    if (p) phones.push(p);
  });
  if (!phones.length) return [];
  return allClients.filter(c => phones.includes(c.phone) || (c.phones || []).some(ph => phones.includes(ph)));
}

export function sendWhatsappMessages() {
  const selection = (document.querySelector('input[name="client-selection"]:checked') || {}).value;
  if (!selection) { showToast('Escolha um grupo de clientes.', 'error'); return; }
  let targetClients = [];
  switch (selection) {
    case 'selected': targetClients = _getSelectedClients(); break;
    case 'all': targetClients = [...allClients]; break;
    case 'filtered': targetClients = [...allClients]; break;
    case 'good': targetClients = allClients.filter(c => (c.orderCount || 0) >= 5 && (c.totalDebt || 0) <= 0.01); break;
    case 'active': targetClients = allClients.filter(c => getClientStatusType(c) === 'ativo'); break;
    case 'debtor': targetClients = allClients.filter(c => (c.totalDebt || 0) > 0.01); break;
  }
  if (!targetClients.length) { showToast('Nenhum cliente nesse segmento.', 'error'); return; }
  const msgTypeSel = document.getElementById('message-type');
  const mode = msgTypeSel ? msgTypeSel.value : 'custom';
  let baseMessage = '';
  if (mode === 'template') {
    const key = document.getElementById('message-template-select')?.value;
    if (!key || !TEMPLATE_MESSAGES[key]) { showToast('Escolha um template.', 'error'); return; }
    baseMessage = TEMPLATE_MESSAGES[key];
  } else {
    const ta = document.getElementById('whatsapp-message-text');
    baseMessage = ta?.value.trim();
    if (!baseMessage) { showToast('Digite a mensagem.', 'error'); return; }
  }
  const confirmBefore = document.getElementById('confirm-before-send');
  if (confirmBefore?.checked) {
    const ok = window.confirm(`Enviar para ${targetClients.length} cliente(s)?`);
    if (!ok) return;
  }
  const delayChk = document.getElementById('delay-between-messages');
  const delayMs = delayChk?.checked ? 700 : 0;
  const phones = targetClients.map(c => c.phone || (c.phones && c.phones[0])).filter(Boolean);
  const segmentLabel = {
    selected: 'Selecionados', all: 'Todos', filtered: 'Filtrados', good: 'Clientes Bons', active: 'Ativos', debtor: 'Devedores'
  }[selection] || selection;
  _sendBulkWhatsapp(phones, baseMessage, segmentLabel, delayMs);
  const modal = document.getElementById('whatsapp-send-modal');
  modal?.classList.remove('active');
  modal?.classList.remove('flex');
  showToast('Iniciando envio...', 'info');
}

// Envio em lote simples (abre abas do WhatsApp)
export function sendBulkMessages(clients, message, tag) {
  const phones = clients.map(c => c.phone).filter(Boolean);
  _sendBulkWhatsapp(phones, message, tag, 600);
}

function _sendBulkWhatsapp(phones, message, tag = 'Lote', delayMs = 600) {
  if (!Array.isArray(phones) || phones.length === 0) { showToast('Nenhum telefone para envio.', 'error'); return; }
  let sent = 0;
  phones.forEach((raw, idx) => {
    setTimeout(() => {
      const clean = String(raw).replace(/\D/g, '');
      const client = allClients.find(c => c.phone === raw || (c.phones || []).includes(raw));
      const personalized = message.replace(/\{nome\}/g, client?.name || 'Cliente');
      const url = `https://wa.me/55${clean}?text=${encodeURIComponent(personalized)}`;
      window.open(url, '_blank');
      sent++;
      if (sent === phones.length) {
        showToast(`Envio concluído para ${sent} clientes.`, 'success', 4000);
        saveCampaignToHistory(tag, phones.length, message);
      }
    }, idx * delayMs);
  });
}

// ---------------- Relatórios / Campanhas -----------------
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
  const bons = allClients.filter(c => (c.orderCount || 0) >= 5 && (c.totalDebt || 0) <= 0.01);
  const devedores = allClients.filter(c => (c.totalDebt || 0) > 0.01);
  const ativos = allClients.filter(c => getClientStatusType(c) === 'ativo');
  const inativos = allClients.filter(c => getClientStatusType(c) === 'inativo');
  general.innerHTML = `
      <p>Total de Clientes: <strong>${total}</strong></p>
      <p>Ativos: <strong>${ativos.length}</strong></p>
      <p>Inativos: <strong>${inativos.length}</strong></p>
      <p>Clientes Bons: <strong>${bons.length}</strong></p>
      <p>Devedores: <strong>${devedores.length}</strong></p>`;
  segmentation.innerHTML = `
      <p>Clientes Bons (%): <strong>${total ? ((bons.length / total * 100).toFixed(1)) : '0'}%</strong></p>
      <p>Ativos (%): <strong>${total ? ((ativos.length / total * 100).toFixed(1)) : '0'}%</strong></p>
      <p>Devedores (%): <strong>${total ? ((devedores.length / total * 100).toFixed(1)) : '0'}%</strong></p>`;
  const campaigns = JSON.parse(localStorage.getItem('marketingCampaigns') || '[]');
  const last = campaigns[campaigns.length - 1];
  campaignStats.innerHTML = `
      <p>Total Campanhas: <strong>${campaigns.length}</strong></p>
      <p>Última: <strong>${last ? last.date + ' (' + last.segment + ')' : '—'}</strong></p>
      <p>Última Qtde Enviada: <strong>${last ? last.sent : '—'}</strong></p>`;
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
  const bons = allClients.filter(c => (c.orderCount || 0) >= 5 && (c.totalDebt || 0) <= 0.01);
  const devedores = allClients.filter(c => (c.totalDebt || 0) > 0.01);
  const ativos = allClients.filter(c => getClientStatusType(c) === 'ativo');
  const inativos = allClients.filter(c => getClientStatusType(c) === 'inativo');
  const campaigns = JSON.parse(localStorage.getItem('marketingCampaigns') || '[]');
  const lines = [
    ['Métrica', 'Valor'],
    ['Total Clientes', total],
    ['Ativos', ativos.length],
    ['Inativos', inativos.length],
    ['Clientes Bons', bons.length],
    ['Devedores', devedores.length],
    ['Total Campanhas', campaigns.length]
  ];
  const csv = lines.map(l => l.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'relatorio_marketing.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Relatório exportado.', 'success');
}

// Exigido pelos delegadores do manager.js
export function formatPhone(phone) { return utilsFormatPhone(phone); }

// Inicializações diferidas de modais auxiliares (templates / reports)
let _reportsModalInit = false;
function initReportsModalEvents() {
  if (_reportsModalInit) return; _reportsModalInit = true;
  document.getElementById('close-reports-modal-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('marketing-reports-modal');
    modal?.classList.remove('active'); modal?.classList.remove('flex');
  });
  document.getElementById('export-reports-btn')?.addEventListener('click', exportMarketingReport);
}

let _templatesModalInit = false;
function initTemplatesModalEvents() {
  if (_templatesModalInit) return; _templatesModalInit = true;
  const closeBtn = document.getElementById('close-templates-modal-btn');
  const useBtn = document.getElementById('use-template-btn');
  const modal = document.getElementById('message-templates-modal');
  const textarea = document.getElementById('custom-message-template');
  const targetMessage = document.getElementById('whatsapp-message-text');
  const close = () => { modal?.classList.remove('active'); modal?.classList.remove('flex'); };
  closeBtn?.addEventListener('click', close);
  useBtn?.addEventListener('click', () => {
    const val = (textarea?.value || '').trim();
    if (!val) { showToast('Digite ou selecione um template.', 'error'); return; }
    if (targetMessage) targetMessage.value = val;
    const typeSel = document.getElementById('message-type');
    if (typeSel) { typeSel.value = 'custom'; typeSel.dispatchEvent(new Event('change')); }
    close();
    showToast('Template aplicado.', 'success');
  });
}

// Disparar inicializações após ciclo de event loop para garantir que o DOM esteja montado.
setTimeout(() => {
  try { setupWhatsappSendModalEvents(); } catch (e) { console.warn(e); }
  try { initReportsModalEvents(); } catch (e) { console.warn(e); }
  try { initTemplatesModalEvents(); } catch (e) { console.warn(e); }
}, 0);
// (Bloco duplicado removido)
    dom.manager.clientsTableBody.innerHTML = '';
;

