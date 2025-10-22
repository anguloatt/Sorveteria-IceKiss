import { initOfflineManager, cacheEssentialData } from './offlineManager.js';

import { db, auth } from './firebase-config.js';
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, orderBy, limit, runTransaction, Timestamp, writeBatch, deleteDoc, deleteField, onSnapshot } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import { dom } from './domRefs.js';

import { showToast, showCustomConfirm, formatCurrency, parseCurrency, getTodayDateString, formatDateToBR, formatDateTimeToBR, formatNameToTitleCase, formatPhone, formatTime, roundSinal, getProductInfoById, generateTicketText, generatePrintableReminderText, printTicket, sendWhatsAppMessage, updateWeekdayDisplay, printReminderList, centerText, rightAlignText, leftAlignText, twoColumns, playSound, showTomorrowReminderModal } from './utils.js';

import { fetchEmployees, logActivity, createNotification, fetchAllProductsWithStock, checkForDailyDeliveries, fetchExpiredPendingOrders, findOrderByDocId, updateOrderAlertStatus, checkForTomorrowDeliveries } from './firebaseService.js';

import { setupPdvEventListeners, startNewOrder, renderProducts, showReminderModal, loadOrderIntoForm } from './pdv.js';

import { setupManagerDashboardListeners, navigateToManagerView, applyRolePermissions, openInteractiveTimeSelector, triggerNotificationAnimation, createExpiredOrderAlertHTML } from './manager.js';

import { populatePdvEmployeeSwitcher, populateLoginEmployeeSelect, addEmployee, editEmployee, deleteEmployee, loadEmployees, saveProductionSettings } from './employeeManagement.js';

import { setupEmployeeReportListeners, openEmployeeReport } from './employeeReport.js';

import { initActivityLogView, setupActivityLogListeners } from './activityLog.js';

import { pendingAlerts } from './alertState.js';

export let categoryConfig = []; // NOVO: Armazena a configuração de categorias (ordem, visibilidade, nomes)
export let currentUser, currentOrder, productsConfig, storeSettings, productionSettings;
export let managerCredentials = { user: 'gerencia', pass: '1234' };
export const masterCredentials = { user: 'mestra', pass: 'mestra123' };
export let charts = {}; // Objeto para armazenar todas as instâncias de gráficos
export let employees = []; // Array para armazenar os funcionários
export let currentReminderOrders = []; // Variável global para armazenar os pedidos do lembrete
export let employeeReportData = { all: [] }; // Dados para o relatório do funcionário
export let notificationListenerCallback = null; // Callback para a UI de notificações
let unsubscribeNotifications = null; // Função para parar o listener de notificações
let isFirstNotificationLoad = true; // NOVO: Flag para controlar o som/animação na carga inicial
let showPasswordChangeModal; // Função para exibir o modal de alteração de senha (definida em setupPasswordChangeListeners)
export { db };
export let productImageFallbacks = {}; // Mapa: productId -> array de caminhos candidatos
export let productImagesReady = false; // Flag indicando se já resolvemos a melhor imagem

// Mapa de imagens padrão por id (ou fallback aproximado)
const PRODUCT_IMAGE_MAP = {
    bolinha_queijo_frita: 'images/cardapio/Bol. Queijo (Fritas).jpeg',
    bolinha_queijo_crua: 'images/cardapio/Bol. Queijo (S.Fritar).jpeg',
    risoles_frito: 'images/cardapio/Risoles (Fritos).jpeg',
    risoles_cru: 'images/cardapio/Risoles (S.Fritar).jpeg',
    coxinha_frita: 'images/cardapio/Coxinha (frita).jpeg',
    coxinha_crua: 'images/cardapio/Coxinhas (S.Fritar).jpeg',
    kibe_frito: 'images/cardapio/Kibes (Fritos).jpeg',
    kibe_cru: 'images/cardapio/Kibes (S.Fritar).jpeg',
    esfiha_carne: 'images/cardapio/Esfiha carne (festa).jpg',
    esfiha_frango: 'images/cardapio/Esfiha frango (festa).jpg',
    hamburguinho: 'images/cardapio/Hamb. (festa).jpeg',
    doguinho: 'images/cardapio/Doguinho (festa) (assados).jpeg',
    bolo_fatia: 'images/cardapio/Fatia húngara (revenda).jpeg'
};

// Lista real de arquivos em images/cardapio (para matching dinâmico)
const AVAILABLE_CARDAPIO_IMAGES = [
    'Bauruzinho (festa).jpeg',
    'Bol. Carne (GD.) (revenda).jpeg',
    'Bol. Ovo (GD.) (revenda).jpeg',
    'Bol. Queijo (Fritas).jpeg',
    'Bol. Queijo (S.Fritar).jpeg',
    'Coxinha (frita).jpeg',
    'Coxinha (GD.) (revenda).jpeg',
    'Coxinha cat. (Revenda).jpeg',
    'Coxinhas (S.Fritar).jpeg',
    'Croissant 4Q (revenda).jpeg',
    'Croissant choco (revenda).jpeg',
    'Croissant PQ (revenda).jpeg',
    'Doguinho (festa) (assados).jpeg',
    'Emp. frango (festa).jpeg',
    'Emp. palmito (festa).jpeg',
    'Esfiha Calab (festa).jpeg',
    'Esfiha carne (festa).jpg',
    'Esfiha frango (festa).jpg',
    'Fatia húngara (revenda).jpeg',
    'Hamb. (festa).jpeg',
    'Kibe (GD.) (revenda).jpeg',
    'Kibes (Fritos).jpeg',
    'Kibes (S.Fritar).jpeg',
    'Minipizza (assados).jpg',
    'Risoles (Fritos).jpeg',
    'Risoles (GD.) (revenda).jpeg',
    'Risoles (S.Fritar).jpeg',
    'Salsicha (GD.) (revenda).jpeg',
    'Torta int palmito (assados).jpeg'
];

function normalizeName(str = '') {
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[^a-z0-9\s.()-]/g, '') // remove acentos chars especiais
        .replace(/calabresa/g, 'calab')
        .replace(/calabre/g, 'calab')
        .replace(/bolinha/g, 'bol')
        .replace(/bolinho/g, 'bol')
        .replace(/hamburguinho/g, 'hamb')
        .replace(/hamburguer/g, 'hamb')
        .replace(/coxinha cat\.?/g, 'coxinha')
        .replace(/s\.fritar/g, 'cru')
        .replace(/fritas?/g, 'frito')
        .replace(/revenda/g, '')
        .replace(/assados?/g, '')
        .replace(/\s+/g, ' ') // espaços únicos
        .trim();
}

// Pré-processa nomes de imagens para acelerar matching
const PREPARED_IMAGE_INDEX = AVAILABLE_CARDAPIO_IMAGES.map(file => {
    const base = file.replace(/\.(jpe?g|png)$/i, '');
    const norm = normalizeName(base);
    const tokens = norm.split(/\s+/).filter(Boolean);
    return { file, norm, tokens };
});

function scoreTokens(prodTokens, imgTokens) {
    if (!prodTokens.length || !imgTokens.length) return 0;
    let match = 0;
    prodTokens.forEach(pt => { if (imgTokens.includes(pt)) match++; });
    return match / prodTokens.length; // proporção de tokens do produto cobertos
}

function guessImageForProductName(name) {
    if (!name) return null;
    const norm = normalizeName(name);
    const tokens = norm.split(/\s+/).filter(Boolean).slice(0, 5); // primeiros tokens relevantes
    if (!tokens.length) return null;
    let best = null;
    let bestScore = 0;
    for (const img of PREPARED_IMAGE_INDEX) {
        const score = scoreTokens(tokens, img.tokens);
        // Bônus se alguns tokens específicos ocorrerem
        const bonus = (/frito|cru|calab|frango|carne|queijo|kibe|coxinha|risoles|esfiha|doguinho|hamb/.test(norm) && score > 0) ? 0.05 : 0;
        const finalScore = score + bonus;
        if (finalScore > bestScore) {
            bestScore = finalScore;
            best = img;
        }
    }
    // Define threshold mínimo para aceitar (ex: ao menos 0.4 de cobertura)
    if (best && bestScore >= 0.4) {
        return 'images/cardapio/' + best.file;
    }
    return null;
}

export function ensureProductImages() {
    if (!productsConfig) return;
    Object.keys(productsConfig).forEach(cat => {
        productsConfig[cat].forEach(prod => {
            const candidates = [];
                        const hadImageInitially = !!prod.image;
            if (!prod.image) {
                // tenta por id exato
                if (PRODUCT_IMAGE_MAP[prod.id]) {
                    prod.image = PRODUCT_IMAGE_MAP[prod.id];
                    candidates.push(PRODUCT_IMAGE_MAP[prod.id]);
                } else {
                    // heurística simples: procura palavra-chave
                    const nameLower = (prod.name || '').toLowerCase();
                    if (!prod.image) {
                        if (nameLower.includes('coxinha')) { prod.image = PRODUCT_IMAGE_MAP.coxinha_frita; candidates.push(PRODUCT_IMAGE_MAP.coxinha_frita); }
                        else if (nameLower.includes('kibe')) { prod.image = PRODUCT_IMAGE_MAP.kibe_frito; candidates.push(PRODUCT_IMAGE_MAP.kibe_frito); }
                        else if (nameLower.includes('esfiha') && nameLower.includes('carne')) { prod.image = PRODUCT_IMAGE_MAP.esfiha_carne; candidates.push(PRODUCT_IMAGE_MAP.esfiha_carne); }
                        else if (nameLower.includes('esfiha') && nameLower.includes('frango')) { prod.image = PRODUCT_IMAGE_MAP.esfiha_frango; candidates.push(PRODUCT_IMAGE_MAP.esfiha_frango); }
                        else if (nameLower.includes('risoles')) { prod.image = PRODUCT_IMAGE_MAP.risoles_frito; candidates.push(PRODUCT_IMAGE_MAP.risoles_frito); }
                        else if (nameLower.includes('queijo')) { prod.image = PRODUCT_IMAGE_MAP.bolinha_queijo_frita; candidates.push(PRODUCT_IMAGE_MAP.bolinha_queijo_frita); }
                    }
                }
            }

                        // Novo: tentativa inteligente por matching de nome se ainda não tem imagem real ou está usando placeholder padrão
                        if (!hadImageInitially || (prod.image && /logo-icekiss\.(jpg|png)$/i.test(prod.image))) {
                            const guessed = guessImageForProductName(prod.name || prod.id);
                            if (guessed) {
                                prod.image = guessed;
                                if (!candidates.includes(guessed)) candidates.unshift(guessed);
                            }
                        }
            // Se ainda não foi atribuída, define placeholder global
            if (!prod.image) {
                prod.image = 'images/logo-icekiss.jpg';
                candidates.push('images/logo-icekiss.jpg');
            }

            // Adiciona caminhos alternativos potenciais (variações simplificadas) para tentar antes do placeholder, se ainda não incluído
            const rawName = prod.name || prod.id || '';
            const simpleSlug = rawName
                .normalize('NFD').replace(/[^\w\s.-]/g, '') // remove acentos e símbolos estranhos
                .replace(/[()]/g, '')
                .replace(/\s+/g, '-').toLowerCase();
            const idSlug = (prod.id || '').toLowerCase();
            const altCandidates = [
                `images/cardapio/${simpleSlug}.jpg`,
                `images/cardapio/${simpleSlug}.jpeg`,
                `images/cardapio/${idSlug}.jpg`,
                `images/cardapio/${idSlug}.jpeg`,
                `images/${simpleSlug}.jpg`,
                `images/${simpleSlug}.jpeg`,
                `images/images/${simpleSlug}.jpg`,
                `images/images/${simpleSlug}.jpeg`
            ];
            altCandidates.forEach(p => { if (!candidates.includes(p)) candidates.push(p); });

            // Garante placeholder no final
            if (!candidates.includes('images/logo-icekiss.jpg')) candidates.push('images/logo-icekiss.jpg');
            productImageFallbacks[prod.id] = candidates;
            prod._imageCandidates = candidates; // (debug)
        });
    });
    console.log('ensureProductImages: imagens atribuídas quando faltavam.');
}

// Testa se um caminho de imagem realmente carrega
function testImage(src, timeoutMs = 4000) {
    return new Promise(resolve => {
        try {
            const img = new Image();
            let done = false;
            const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
            img.onload = () => finish(true);
            img.onerror = () => finish(false);
            img.src = encodeURI(src);
            setTimeout(() => finish(false), timeoutMs);
        } catch { resolve(false); }
    });
}

export async function preResolveProductImages() {
    if (!productsConfig) return;
    console.log('preResolveProductImages: iniciando verificação dos arquivos reais.');
    const productEntries = [];
    Object.keys(productsConfig).forEach(cat => {
        productsConfig[cat].forEach(p => productEntries.push(p));
    });
    for (const prod of productEntries) {
        const candidates = (productImageFallbacks[prod.id] || []).slice();
        // Garante que o valor atual venha primeiro
        if (prod.image && !candidates.includes(prod.image)) candidates.unshift(prod.image);
        let selected = null;
        for (const candidate of candidates) {
            // Evita tentar múltiplas vezes placeholder se falhar uma vez
            const ok = await testImage(candidate);
            if (ok) { selected = candidate; break; }
        }
        if (!selected) selected = 'images/logo-icekiss.jpg';
        prod.image = selected; // fixa imagem final
    }
    productImagesReady = true;
    console.log('preResolveProductImages: finalizado.');
    try { window.dispatchEvent(new CustomEvent('productImagesResolved')); } catch(_) {}
}

export function setCurrentUser(newUser) {
    currentUser = newUser;
    console.log("setCurrentUser: Usuário atual alterado para:", currentUser);
    try { refreshManagerNameDisplay(); } catch (e) {  }
}

export function refreshManagerNameDisplay() {
    try {
        const el = document.getElementById('manager-name-display');
        if (el && typeof currentUser !== 'undefined' && currentUser && currentUser.name) {
            el.textContent = currentUser.name;
        }
    } catch (e) {
        console.warn('refreshManagerNameDisplay: erro ao atualizar manager-name-display', e);
    }
}

export function setCategoryConfig(newConfig) {
    categoryConfig = newConfig;
    localStorage.setItem('categoryConfig', JSON.stringify(newConfig));
    console.log("setCategoryConfig: Configuração de categorias atualizada e salva.", categoryConfig);
}

export async function loadConfig() {
    console.log("loadConfig: Iniciando carregamento das configurações...");
    try {
        const configDocRef = doc(db, "config", "main");
        const docSnap = await getDoc(configDocRef);

let loadedProducts = {}; // Objeto temporário para construir productsConfig

if (docSnap.exists()) {
            const configData = docSnap.data();
            storeSettings = configData.settings || { monthlyGoal: 10000 };
            if(configData.manager) { managerCredentials = configData.manager; }
            console.log("loadConfig: Configurações de sistema e credenciais carregadas.");

if (Array.isArray(configData.products) && configData.products.length > 0) {
                console.log("loadConfig: Carregando produtos da estrutura antiga (config/main.products).");
                configData.products.forEach(categoryObj => {
                    if (categoryObj.id && Array.isArray(categoryObj.items)) {
                        loadedProducts[categoryObj.id] = categoryObj.items;
                    }
                });
            } else {
                console.log("loadConfig: Estrutura antiga de produtos não encontrada ou vazia. Carregando da coleção 'products'.");
                const allProducts = await fetchAllProductsWithStock();
                allProducts.forEach(product => {
                    const category = product.category || 'outros';
                    if (!loadedProducts[category]) {
                        loadedProducts[category] = [];
                    }
                    loadedProducts[category].push(product);
                });
            }

} else {
            console.log("loadConfig: Configuração não encontrada. Tentando criar padrão...");
            const confirmCreate = await showCustomConfirm("Configuração Não Encontrada", "Nenhuma configuração encontrada. Deseja criar o cardápio padrão?");
            if (confirmCreate) {
                await createDefaultConfig();
                return await loadConfig();
            } else {
                showToast("Nenhuma configuração carregada. Algumas funcionalidades podem não funcionar.", "error", 5000);
            }
        }

const prodConfigRef = doc(db, "config", "producao");
        const prodDocSnap = await getDoc(prodConfigRef);
        if (prodDocSnap.exists()) {
            productionSettings = prodDocSnap.data();
            console.log("loadConfig: Configurações de produção carregadas:", productionSettings);
        } else {
            console.log("loadConfig: Configurações de produção não encontradas, usando e salvando padrão.");
            productionSettings = { limit: 1200, windowMinutes: 30 }; // Valores padrão
            await setDoc(prodConfigRef, productionSettings);
        }

const defaultCategories = ['assados', 'fritos', 'revenda', 'outros'];
        defaultCategories.forEach(cat => {
            if (!loadedProducts[cat]) {
                loadedProducts[cat] = [];
            }
        });

Object.keys(loadedProducts).forEach(category => {
            loadedProducts[category].sort((a, b) => {
                const posA = a.position !== undefined && a.position !== null ? a.position : 999;
                const posB = b.position !== undefined && b.position !== null ? b.position : 999;
                if (posA === posB) {
                    return a.name.localeCompare(b.name); // Fallback para nome se posições forem iguais
                }
                return posA - posB;
            });
        });

        productsConfig = loadedProducts; // Atribui a configuração construída à variável global

        // DEBUG: verificar o que foi carregado
        console.log("loadConfig: loadedProducts final:", loadedProducts);
        console.log("loadConfig: productsConfig após atribuição:", productsConfig);
        console.log("loadConfig: Object.keys(productsConfig):", Object.keys(productsConfig));

        // GARANTE IMAGENS: Aplica imagens conhecidas por id se não vieram do banco
        try {
            ensureProductImages();
        } catch(e) { console.warn('ensureProductImages falhou após loadConfig', e); }
    try { preResolveProductImages(); } catch(e) { console.warn('preResolveProductImages disparo inicial falhou', e); }
const savedCategoryConfig = localStorage.getItem('categoryConfig');
        if (savedCategoryConfig) {
            categoryConfig = JSON.parse(savedCategoryConfig);
            console.log("loadConfig: Configuração de categorias carregada do localStorage.");
        } else {
            const newDefaultConfig = Object.keys(productsConfig).map((key, index) => ({
                id: key,
                name: key.charAt(0).toUpperCase() + key.slice(1), // Ex: 'assados' -> 'Assados'
                order: index,
                visible: true
            }));
            setCategoryConfig(newDefaultConfig); // Usa a função para definir e salvar
            console.log("loadConfig: Nenhuma configuração de categoria encontrada. Criada configuração padrão.");
        }
        categoryConfig.sort((a, b) => a.order - b.order);
        console.log("loadConfig: Configurações de produtos carregadas:", productsConfig);
    }
    catch (error) {
        console.error("loadConfig: Erro ao carregar configurações:", error);
        showToast("Erro ao carregar configurações.", "error");
    }
}

async function createDefaultConfig() {
    console.log("createDefaultConfig: Criando configuração padrão...");
    const defaultConfig = {
        products: { // Esta é a estrutura antiga que será salva em config/main
            fritos: [
                { id: 'bolinha_queijo_frita', name: 'Bolinha de Queijo (Frita)', price: 0.70, category: 'fritos', image: 'images/cardapio/Bol. Queijo (Fritas).jpeg' },
                { id: 'bolinha_queijo_crua', name: 'Bolinha de Queijo (Crua)', price: 0.60, category: 'fritos', image: 'images/cardapio/Bol. Queijo (S.Fritar).jpeg' },
                { id: 'risoles_frito', name: 'Risoles (Frito)', price: 0.70, category: 'fritos', image: 'images/cardapio/Risoles (Fritos).jpeg' },
                { id: 'risoles_cru', name: 'Risoles (Cru)', price: 0.60, category: 'fritos', image: 'images/cardapio/Risoles (S.Fritar).jpeg' },
                { id: 'coxinha_frita', name: 'Coxinha (Frita)', price: 0.70, category: 'fritos', image: 'images/cardapio/Coxinha (frita).jpeg' },
                { id: 'coxinha_crua', name: 'Coxinha (Crua)', price: 0.60, category: 'fritos', image: 'images/cardapio/Coxinhas (S.Fritar).jpeg' },
                { id: 'kibe_frito', name: 'Kibe (Frito)', price: 0.70, category: 'fritos', image: 'images/cardapio/Kibes (Fritos).jpeg' },
                { id: 'kibe_cru', name: 'Kibe (Cru)', price: 0.60, category: 'fritos', image: 'images/cardapio/Kibes (S.Fritar).jpeg' }
            ],
            assados: [
                { id: 'esfiha_carne', name: 'Esfiha Carne', price: 1.50, category: 'assados', image: 'images/cardapio/Esfiha carne (festa).jpg' },
                { id: 'esfiha_frango', name: 'Esfiha Frango', price: 1.50, category: 'assados', image: 'images/cardapio/Esfiha frango (festa).jpg' },
                { id: 'hamburguinho', name: 'Hamburguinho', price: 1.50, category: 'assados', image: 'images/cardapio/Hamb. (festa).jpeg' },
                { id: 'doguinho', name: 'Doguinho', price: 1.50, category: 'assados', image: 'images/cardapio/Doguinho (festa) (assados).jpeg' }
            ],
            revenda: [
                { id: 'picole_chocolate', name: 'Picolé Chocolate', price: 3.00, category: 'revenda', image: 'images/cardapio/logo-icekiss.jpg' },
                { id: 'sorvete_massa_morango', name: 'Sorvete Massa Morango (1L)', price: 15.00, category: 'revenda', image: 'images/cardapio/logo-icekiss.jpg' }
            ],
            outros: [
                { id: 'coca_lata', name: 'Coca-Cola Lata', price: 5.00, category: 'outros', image: 'images/cardapio/logo-icekiss.jpg' },
                { id: 'guarana_lata', name: 'Guaraná Lata', price: 5.00, category: 'outros', image: 'images/cardapio/logo-icekiss.jpg' },
                { id: 'bolo_fatia', name: 'Bolo (Fatia)', price: 8.00, category: 'outros', image: 'images/cardapio/Fatia húngara (revenda).jpeg' }
            ]
        },
        settings: { name: "Sorveteria Ice Kiss", phone: "(11) 4242-2702", footerMessage: "Obrigado(a) pela preferência! VOLTE SEMPRE!", printUnitPrice: false, monthlyGoal: 10000 },
        manager: { user: 'gerencia', pass: '1234' },
        production: { limit: 1200, windowMinutes: 30 } // NOVO: Configuração de produção padrão
    };
    try {
        const productsArrayForOldConfig = Object.keys(defaultConfig.products).map(key => ({
            id: key,
            items: defaultConfig.products[key]
        }));

await setDoc(doc(db, "config", "main"), {
            settings: defaultConfig.settings,
            manager: defaultConfig.manager,
            products: productsArrayForOldConfig // Salva a estrutura antiga aqui
        });

await setDoc(doc(db, "config", "producao"), defaultConfig.production);

const batch = writeBatch(db);
        const productsCol = collection(db, "products");

Object.values(defaultConfig.products).flat().forEach(product => {
            const productRef = doc(productsCol, product.id);
            const productData = {
                ...product,
                costPercent: 60,
                cost: +(product.price * 0.6), // Custo padrão: 60% do preço de venda
                stock: 100 // Estoque inicial de exemplo
            };
            batch.set(productRef, productData);
        });

await batch.commit(); // Executa todas as operações de escrita de uma vez

console.log("createDefaultConfig: Configuração padrão criada com sucesso!");
        showToast("Configuração padrão criada!", "success");
    } catch (error) {
        console.error("createDefaultConfig: Erro ao criar config padrão:", error);
        showToast("Falha ao criar config.", "error");
    }
}

export async function getNextOrderNumber() {
    console.log("getNextOrderNumber: Obtendo próximo número de pedido.");
    const counterRef = doc(db, "counters", "orders"); // Referência ao contador de pedidos
    const ordersColRef = collection(db, "orders"); // Referência à coleção de pedidos
try {
        // Lê o último pedido fora da transação
        const lastOrderQuery = query(ordersColRef, orderBy("orderNumber", "desc"), limit(1));
        const lastOrderSnap = await getDocs(lastOrderQuery);
        let lastSavedOrderNumber = 0;
        if (!lastOrderSnap.empty) {
            lastSavedOrderNumber = Number(lastOrderSnap.docs[0].data().orderNumber) || 0;
        }

        const nextBasedOnLastSaved = lastSavedOrderNumber + 1;

        const newOrderNumber = await runTransaction(db, async (transaction) => {
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

export async function peekNextOrderNumber() {
    console.log("peekNextOrderNumber: Verificando próximo número de pedido para exibição.");
    const ordersColRef = collection(db, "orders");

try {
        const lastOrderQuery = query(ordersColRef, orderBy("orderNumber", "desc"), limit(1));
        const lastOrderSnap = await getDocs(lastOrderQuery);

let lastSavedOrderNumber = 0;
        if (!lastOrderSnap.empty) {
            lastSavedOrderNumber = Number(lastOrderSnap.docs[0].data().orderNumber) || 0;
        }

const nextNumber = lastSavedOrderNumber > 0 ? lastSavedOrderNumber + 1 : 1001; // Se não houver pedidos, começa em 1001

const formattedNumber = String(nextNumber).padStart(4, '0');
        console.log(`peekNextOrderNumber: Último pedido salvo foi ${lastSavedOrderNumber}. Próximo para exibição: ${formattedNumber}`);
        return formattedNumber;
    } catch (error) {
        console.error("peekNextOrderNumber: Erro ao verificar próximo número:", error);
        showToast("Erro ao carregar número do pedido.", "error");
        return "ERRO"; // Retorna um erro claro na UI
    }
}

export async function showPriceHistoryModal(productId, productName) {
    const modal = document.getElementById('price-history-modal');
    const modalTitle = document.getElementById('history-product-name');
    const tableBody = document.getElementById('price-history-table-body');

if (!modal || !modalTitle || !tableBody) {
        console.error("Elementos do modal de histórico de preços não encontrados no DOM.");
        return;
    }

modalTitle.textContent = productName;
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Carregando histórico...</td></tr>';
    modal.classList.add('active');

try {
        const historyColRef = collection(db, `products/${productId}/priceHistory`);
        const q = query(historyColRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Nenhuma alteração de preço registrada para este produto.</td></tr>';
            return;
        }

tableBody.innerHTML = ''; // Limpa o "Carregando..."
        querySnapshot.forEach(doc => {
            const history = doc.data();
            const date = history.timestamp ? history.timestamp.toDate().toLocaleString('pt-BR') : 'Data não registrada';
            const price = typeof history.newPrice === 'number' ? `R$ ${history.newPrice.toFixed(2).replace('.', ',')}` : 'N/A';
            const cost = typeof history.newCost === 'number' ? `R$ ${history.newCost.toFixed(2).replace('.', ',')}` : 'N/A';
            const user = history.changedBy || 'Sistema';

const row = `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-4">${date}</td>
                    <td class="py-2 px-4 text-right font-mono">${price}</td>
                    <td class="py-2 px-4 text-right font-mono">${cost}</td>
                    <td class="py-2 px-4">${user}</td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

} catch (error) {
        console.error("Erro ao buscar histórico de preços:", error);
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500">Ocorreu um erro ao carregar o histórico.</td></tr>';
        showToast("Erro ao carregar histórico de preços.", "error");
    }
}

export async function showClientHistoryModal(clienteId, clientName) {
    const modal = document.getElementById('client-history-modal');
    const modalTitle = document.getElementById('client-history-client-name');
    const tableBody = document.getElementById('client-history-orders-list');

if (!modal || !modalTitle || !tableBody) {
        console.error("Elementos do modal de histórico de cliente não encontrados.");
        return;
    }

modalTitle.textContent = clientName;
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Carregando histórico...</td></tr>';
    modal.classList.add('active');

try {
        const ordersRef = collection(db, "orders");
        const q = query(ordersRef, where("cliente.id", "==", clienteId), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4">Nenhum pedido encontrado para este cliente.</td></tr>';
            return;
        }

let rowsHtml = '';
        querySnapshot.forEach(doc => {
            const order = doc.data();
            const paymentStatusClass = order.paymentStatus === 'pago' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
            const orderStatusClass = `status-${order.status}`;

rowsHtml += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="py-2 px-4 font-mono">${order.orderNumber}</td>
                    <td class="py-2 px-4">${formatDateToBR(order.deliveryDate)}</td>
                    <td class="py-2 px-4 text-right font-mono">${formatCurrency(order.totalValue)}</td>
                    <td class="py-2 px-4 text-center"><span class="px-2 py-1 text-xs font-semibold rounded-full ${paymentStatusClass}">${order.paymentStatus}</span></td>
                    <td class="py-2 px-4 text-center"><span class="status-label ${orderStatusClass}">${order.status}</span></td>
                </tr>
            `;
        });
        tableBody.innerHTML = rowsHtml;

} catch (error) {
        console.error("Erro ao buscar histórico de pedidos do cliente:", error);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-red-500">Erro ao carregar histórico.</td></tr>';
        showToast("Erro ao carregar histórico do cliente.", "error");
    }
}

export async function updateClientSeal(clienteId) {
    const sealContainer = document.getElementById('client-seal-container');
    if (!sealContainer) return;

try {
        const clientDocRef = doc(db, "clients", clienteId);
        const clientSnap = await getDoc(clientDocRef);

if (!clientSnap.exists()) {
            sealContainer.classList.add('hidden');
            return;
        }

const clientData = clientSnap.data();

document.getElementById('seal-order-count').textContent = clientData.totalOrders || 0;
        document.getElementById('seal-payment-status').textContent = (clientData.totalDebt > 0) ? 'Devedor' : 'Em dia';
        document.getElementById('seal-payment-icon').className = (clientData.totalDebt > 0) ? 'fas fa-thumbs-down text-xl mb-1 text-red-500' : 'fas fa-thumbs-up text-xl mb-1 text-green-500';
        document.getElementById('seal-client-since').textContent = clientData.firstOrderDate ? formatDateToBR(clientData.firstOrderDate) : '--';

sealContainer.onclick = () => showClientHistoryModal(clienteId, clientData.name);

sealContainer.classList.remove('hidden');

} catch (error) {
        console.error("Erro ao atualizar o selo do cliente:", error);
        sealContainer.classList.add('hidden');
    }
}

export async function renderClientsTable() {
    const tableBody = document.getElementById('manager-clients-table-body');
    if (!tableBody) {
        console.error("Elemento 'manager-clients-table-body' não encontrado.");
        return;
    }

tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4">Carregando clientes...</td></tr>';

try {
        const clientsRef = collection(db, "clients");
        const q = query(clientsRef, orderBy("totalOrders", "desc")); // Ordena por mais compras
        const querySnapshot = await getDocs(q);

if (querySnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4">Nenhum cliente cadastrado.</td></tr>';
            return;
        }

let rowsHtml = '';
        querySnapshot.forEach(doc => {
            const client = doc.data();
            const clientId = doc.id;
            const clientName = client.name || 'N/A';
            const totalOrders = client.totalOrders || 0;

let badgeClass = 'low'; // Padrão
            if (totalOrders >= 30) badgeClass = 'very-high';
            else if (totalOrders >= 15) badgeClass = 'high';
            else if (totalOrders >= 5) badgeClass = 'medium';

rowsHtml += `
                <tr class="border-b hover:bg-gray-50" data-client-id="${clientId}" data-client-name="${clientName}">
                    <td class="p-2 text-center w-12"><input type="checkbox" class="client-checkbox highlight-checkbox" data-phone="${client.phone || ''}"></td>
                    <td class="py-2 px-3 font-semibold">${clientName}</td>
                    <td class="py-2 px-3">${client.phone || 'N/A'}</td>
                    <td class="py-2 px-3 text-right font-mono ${client.totalDebt > 0 ? 'text-red-500 font-bold' : ''}">${formatCurrency(client.totalDebt || 0)}</td>
                    <td class="py-2 px-3 text-center"><span class="purchase-count-badge ${badgeClass}" title="${totalOrders} compras">${totalOrders}</span></td>
                    <td class="py-2 px-3">${client.firstOrderDate ? formatDateToBR(client.firstOrderDate) : '--'}</td>
                    <td class="py-2 px-3">${client.ranking || '--'}</td>
                    <td class="py-2 px-3 text-center"><button class="text-blue-600 hover:text-blue-800 view-client-history-btn" title="Ver histórico de pedidos"><i class="fas fa-history pointer-events-none"></i></button></td>
                </tr>
            `;
        });

tableBody.innerHTML = rowsHtml;

} catch (error) {
        console.error("Erro ao carregar e renderizar clientes:", error);
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-red-500">Erro ao carregar clientes.</td></tr>';
        showToast("Erro ao carregar a lista de clientes.", "error");
    }
}

export async function checkProductionOverload(orderToCheck, deliveryDateStr, deliveryTimeStr) {
	try {
		if (!productionSettings) {
			console.warn("checkProductionOverload: Configurações de produção não disponíveis. Pulando verificação.");
			return { isOverloaded: false, currentCount: 0, limit: 99999 };
		}
		const { limit, windowMinutes } = productionSettings;

if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDateStr) || !/^\d{2}:\d{2}$/.test(deliveryTimeStr)) {
			console.error("checkProductionOverload: Formato de data ou hora inválido.", { deliveryDateStr, deliveryTimeStr });
			return { isOverloaded: false, currentCount: 0, limit: limit };
		}

const [year, month, day] = deliveryDateStr.split('-').map(Number);
		const [hours, minutes] = deliveryTimeStr.split(':').map(Number);
		const targetDateTime = new Date(year, month - 1, day, hours, minutes);

const startTime = new Date(targetDateTime.getTime() - windowMinutes * 60000);
		const endTime = new Date(targetDateTime.getTime() + windowMinutes * 60000);

const ordersRef = collection(db, "orders");
		const q = query(ordersRef,
			where("deliveryDate", "==", deliveryDateStr),
			where("deliveryTimestamp", ">=", Timestamp.fromDate(startTime)),
			where("deliveryTimestamp", "<=", Timestamp.fromDate(endTime)),
			where("status", "!=", "cancelado") // Ignora pedidos cancelados
		);

const querySnapshot = await getDocs(q);

let totalSalgados = 0;
		querySnapshot.forEach(doc => {
			if (orderToCheck.id && doc.id === orderToCheck.id) {
				return;
			}
			const order = doc.data();
			if (order.items) {
				order.items.forEach(item => {
					if (item.category === 'fritos' || item.category === 'assados') {
						totalSalgados += item.quantity || 0;
					}
				});
			}
		});

(orderToCheck.items || []).forEach(item => {
			if (item.category === 'fritos' || item.category === 'assados') {
				totalSalgados += item.quantity || 0;
			}
		});

console.log(`Verificação de Sobrecarga: ${totalSalgados} salgados encontrados para a janela de ${deliveryTimeStr}. Limite é ${limit}.`);

return {
			isOverloaded: totalSalgados > limit,
			currentCount: totalSalgados,
			limit: limit
		};
	} catch (error) {
		console.error("Erro ao verificar sobrecarga de produção:", error);
		showToast("Erro ao verificar horário. Tente novamente.", "error");
		return { isOverloaded: false, currentCount: 0, limit: productionSettings?.limit || 99999 };
	}
}

export function loadOverloadSettingsToUI() {
    const limitInput = document.getElementById('overload-limit-input');
    const windowInput = document.getElementById('overload-window-input');

if (limitInput && windowInput && productionSettings) {
        limitInput.value = productionSettings.limit || 1200;
        windowInput.value = productionSettings.windowMinutes || 30;
        console.log("Configurações de sobrecarga carregadas na UI.");
    } else {
        console.warn("Não foi possível carregar as configurações de sobrecarga na UI. Elementos ou configurações não encontrados.");
    }
}

function switchLoginTab(activeTab) {
    const isFuncionario = activeTab === 'funcionario';

dom.tabFuncionario.classList.toggle('active-tab-login', isFuncionario);
    dom.tabGerencia.classList.toggle('active-tab-login', !isFuncionario);

dom.loginFuncionarioDiv.classList.toggle('hidden', !isFuncionario);
    dom.loginGerenciaDiv.classList.toggle('hidden', isFuncionario);

if (isFuncionario) {
        dom.employeeUserSelect.focus();
    } else {
        dom.managerUserInput.focus();
    }
}

async function handleFuncionarioLogin() {
    const selectedName = dom.employeeUserSelect.value;
    const password = dom.employeePassInput.value;

if (!selectedName) return showToast("Por favor, selecione seu nome.", "error");
    if (!password) return showToast("Por favor, digite sua senha.", "error");

const employee = employees.find(e => e.name === selectedName);
    if (employee && String(employee.password) === password) {
        if (password === '1234') {
            showToast("Por segurança, você deve alterar sua senha inicial.", "info", 4000);
            currentUser = { id: employee.id, name: employee.name, role: employee.role };
            showPasswordChangeModal(true); // O 'true' indica que a alteração é forçada
        } else {
            showToast(`Bem-vindo(a), ${selectedName}!`, "success");
            await logActivity(selectedName, 'Login');
            startApp('funcionario', employee);
        }
    } else {
        showToast("Senha incorreta. Tente novamente.", "error");
    }
}

async function handleGerenciaLogin() {
    const userInput = dom.managerUserInput.value.trim();
    const pass = dom.managerPassInput.value;

if (!userInput || !pass) {
        return showToast("Usuário e senha são obrigatórios.", "error");
    }

if (userInput.toLowerCase() === masterCredentials.user && pass === masterCredentials.pass) {
        showToast("Acesso Mestra concedido.", "info");
        startApp('mestra', { name: 'Mestra', role: 'mestra' });
        return;
    }

const manager = employees.find(e => e.name.toLowerCase() === userInput.toLowerCase() && e.role === 'gerente');

if (manager && String(manager.password) === String(pass)) {
        showToast(`Bem-vindo(a), ${manager.name}!`, "success");
        await logActivity(manager.name, 'Login'); // Log the specific manager's login
        startApp('gerente', manager); // Pass the full manager object
    } else {
        showToast("Usuário ou senha de gerência incorretos ou sem permissão.", "error");
    }
}

export function setupAuthListeners() {
    dom.tabFuncionario.addEventListener('click', () => switchLoginTab('funcionario'));
    dom.tabGerencia.addEventListener('click', () => switchLoginTab('gerencia'));
    dom.loginBtnFuncionario.addEventListener('click', handleFuncionarioLogin);
    dom.loginBtnGerencia.addEventListener('click', handleGerenciaLogin);
    dom.employeePassInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleFuncionarioLogin(); });
    dom.managerPassInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGerenciaLogin(); });

const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async (e) => {
            e.preventDefault();
            const employeeSelect = dom.employeeUserSelect;
            const selectedEmployeeName = employeeSelect.value;

if (!selectedEmployeeName) {
                showToast('Por favor, selecione seu nome na lista primeiro.', 'error');
                return;
            }

const employee = employees.find(e => e.name === selectedEmployeeName);
            if (!employee) {
                showToast('Funcionário não encontrado na lista carregada.', 'error');
                return;
            }

const userConfirmed = confirm(`Você tem certeza que deseja solicitar a redefinição de senha para "${selectedEmployeeName}"?\nUm gerente será notificado.`);

if (userConfirmed) {
                try {
                    const notificationsRef = collection(db, 'notifications');
                    await addDoc(notificationsRef, {
                        type: 'password_reset_request',
                        message: `O funcionário ${selectedEmployeeName} solicitou a redefinição de senha.`,
                        employeeName: selectedEmployeeName,
                        employeeId: employee.id, // ID para facilitar a redefinição
                        timestamp: serverTimestamp(),
                        read: false
                    });
                    showToast('Sua solicitação foi enviada a um gerente.', 'success');
                } catch (error) {
                    console.error("Erro ao solicitar redefinição de senha:", error);
                    showToast('Ocorreu um erro ao enviar a solicitação. Tente novamente.', 'error');
                }
            }
        });
    }
}

export function registerNotificationListener(callback) {
    notificationListenerCallback = callback;
    console.log("Notification callback registered.");
}

export function startNotificationListener() {
    if (unsubscribeNotifications) {
        console.log("Notification listener já está ativo.");
        return;
    }

isFirstNotificationLoad = true; // Reseta a flag sempre que o listener é iniciado

console.log("Iniciando o listener de notificações...");
    const notificationsRef = collection(db, "notifications");
    const q = query(notificationsRef, orderBy("timestamp", "desc"), limit(50)); // Pega as 50 mais recentes

unsubscribeNotifications = onSnapshot(q, (snapshot) => {
        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

if (!isFirstNotificationLoad) {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const notificationData = change.doc.data();
                    if (!notificationData.read) {
                        console.log("Nova notificação recebida, tocando som e animando.");
                        playSound('sounds/notification.mp3');
                        triggerNotificationAnimation();
                    }
                }
            });
        }

if (notificationListenerCallback) {
            notificationListenerCallback(notifications);
        }

isFirstNotificationLoad = false;
    }, (error) => {
        console.error("Erro no listener de notificações:", error);
        showToast("Erro ao receber notificações em tempo real.", "error");
    });
}

export function stopNotificationListener() {
    if (unsubscribeNotifications) {
        unsubscribeNotifications();
        unsubscribeNotifications = null;
        console.log("Listener de notificações parado.");
    }
}

function showView(viewName) {
    const views = {
        auth: dom.authScreen,
        pdv: dom.mainContent,
        manager: dom.managerDashboard
    };

Object.values(views).forEach(view => {
        if (view) view.style.display = 'none';
    });

const viewToShow = views[viewName];
    if (viewToShow) {
        const displayStyle = (viewName === 'pdv' || viewName === 'manager') ? 'flex' : 'block';
        viewToShow.style.display = displayStyle;
        // If we're showing the manager dashboard, make sure any Tailwind 'hidden' class is removed
        if (viewName === 'manager' && viewToShow.classList) {
            viewToShow.classList.remove('hidden');
        }
    } else {
        console.error(`showView: A tela '${viewName}' não foi encontrada.`);
    }
}

export async function startApp(userType, user) {
    console.log("startApp: Iniciando aplicação para tipo de usuário:", userType, "com dados:", user);

currentUser = { id: user.id, name: user.name, role: user.role || userType, uid: user.uid };
    console.log("startApp: Usuário atual definido como:", currentUser);

if (userType === 'funcionario') {
        showView('pdv');
        // Aguarda pré-resolução das imagens (máx 3s) antes de renderizar
        try {
            if (!productImagesReady) {
                await Promise.race([
                    new Promise(res => window.addEventListener('productImagesResolved', () => res(), { once: true })),
                    new Promise(res => setTimeout(res, 3000))
                ]);
            }
        } catch(_) {}
        renderProducts(); // Renderiza produtos após carregar as configurações (já com imagens finais se possível)

await startNewOrder();

setupPdvEventListeners(); // Configura listeners do PDV
        setupEmployeeReportListeners(); // Configura listeners do Relatório do Funcionário

if (dom.reportBtn) { dom.reportBtn.style.display = 'block'; } // Botão de relatório sempre visível no PDV

if (currentUser.role === 'gerente' || currentUser.role === 'mestra') {
            if (dom.returnToManagerBtn) dom.returnToManagerBtn.classList.remove('hidden');
            if (dom.managerAccessBtn) dom.managerAccessBtn.style.display = 'none'; // Esconde o acesso rápido, pois já está logado
        } else {
            if (dom.returnToManagerBtn) dom.returnToManagerBtn.classList.add('hidden');
            if (dom.managerAccessBtn) dom.managerAccessBtn.style.display = 'block';
        }

populatePdvEmployeeSwitcher(); // Popula o seletor de funcionários no PDV
        if (dom.employeeSwitcherSelect) {
            dom.employeeSwitcherSelect.value = currentUser.name;
            dom.employeeSwitcherSelect.classList.add('employee-switcher-selected');
        }
        if (dom.pdvEmployeeOnlineStatus) dom.pdvEmployeeOnlineStatus.classList.remove('hidden');

const currentHour = new Date().getHours();
        console.log(`[Lembrete] Hora atual detectada: ${currentHour}`);

if (currentHour >= 7 && currentHour < 17) {
            console.log("[Lembrete] Verificando lembrete de HOJE.");
            const dailyDeliveries = await checkForDailyDeliveries();
            if (dailyDeliveries && dailyDeliveries.length > 0) {
                currentReminderOrders = dailyDeliveries; // Atualiza a variável global
                showReminderModal(dailyDeliveries); // Chama o modal de lembrete do PDV
            } else {
                console.log("[Lembrete] Nenhum pedido para hoje encontrado.");
            }
        }
        else if (currentHour >= 17 && currentHour <= 19) {
            console.log("[Lembrete] Verificando lembrete de AMANHÃ.");
            const todayDateString = getTodayDateString('dd/mm/yyyy');
            const lastReminderDate = localStorage.getItem('lastTomorrowReminderDate');
            const isReminderShownToday = lastReminderDate === todayDateString;
            console.log(`[Lembrete] Lembrete de amanhã já foi exibido hoje? ${isReminderShownToday}`);

if (!isReminderShownToday) {
                const tomorrowDeliveries = await checkForTomorrowDeliveries();
                if (tomorrowDeliveries && tomorrowDeliveries.length > 0) {
                    console.log(`[Lembrete] ${tomorrowDeliveries.length} pedido(s) para amanhã encontrado(s). Exibindo modal.`);
                    showTomorrowReminderModal(tomorrowDeliveries);
                    localStorage.setItem('lastTomorrowReminderDate', todayDateString);
                } else {
                    console.log("[Lembrete] Nenhum pedido para amanhã encontrado.");
                }
            }
        }

console.log("startApp: Verificando alertas de pedidos expirados...");
        const allPendingOrders = await fetchExpiredPendingOrders();
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Define para o início do dia para comparação

const expiredOrders = allPendingOrders.filter(order => {
            if (!order.delivery || !order.delivery.date) return false;
            const [day, month, year] = order.delivery.date.split('/');
            const deliveryDate = new Date(year, month - 1, day);
            return deliveryDate < now;
        });

pendingAlerts.splice(0, pendingAlerts.length, ...expiredOrders);

if (pendingAlerts.length > 0) {
            console.log(`startApp: ${pendingAlerts.length} alertas de pedidos expirados encontrados.`);
            showExpiredOrdersAlert(pendingAlerts); // Mostra o modal
            if (dom.alerts.badge) {
                dom.alerts.badge.textContent = pendingAlerts.length;
                dom.alerts.badge.classList.remove('hidden');
            }
            playSound('sounds/notification.mp3'); // Toca o som de notificação
        } else {
            console.log("startApp: Nenhum alerta de pedido expirado.");
            if (dom.alerts.badge) {
                dom.alerts.badge.classList.add('hidden');
            }
        }
    }
    else {
        showView('manager');

setupManagerDashboardListeners(); // Configura listeners do Gerente
        setupEmployeeReportListeners(); // Configura listeners do Relatório do Funcionário (para acesso via gerente)

applyRolePermissions(currentUser); // Aplica as permissões com base no cargo

const equipeLink = document.getElementById('sidebar-link-equipe');
        const sistemaLink = document.getElementById('sidebar-link-sistema');
        const passwordSection = document.getElementById('manager-password-change-section');
        const riskZone = document.getElementById('manager-risk-zone');
        const firebaseSection = document.getElementById('firebase-access-section');

if (equipeLink && sistemaLink && passwordSection && riskZone && firebaseSection) {
            if (currentUser.role === 'gerente') {
                equipeLink.style.display = 'flex'; // Mostra o link 'Equipe'
                sistemaLink.style.display = 'flex'; // Mostra o link 'Sistema'
                passwordSection.style.display = 'none'; // Esconde a alteração de senha
                riskZone.style.display = 'none'; // Esconde a área de risco
                firebaseSection.style.display = 'none'; // Esconde a seção de acesso ao Firebase
            }
            else if (currentUser.role === 'mestra') {
                equipeLink.style.display = 'flex';
                sistemaLink.style.display = 'flex';
                passwordSection.style.display = 'block'; // Garante que a alteração de senha esteja visível
                riskZone.style.display = 'block'; // Garante que a área de risco esteja visível
                firebaseSection.style.display = 'block'; // Garante que a seção de acesso ao Firebase esteja visível
            }
        }

if (currentUser.role === 'mestra') {
            navigateToManagerView('master-reset');
        } else {
            navigateToManagerView('gerencial-dashboard');
        }
        startNotificationListener(); // Inicia o listener para o gerente

if (dom.manager && dom.manager.nameDisplay) { dom.manager.nameDisplay.textContent = user.name; }
    }
    console.log("startApp: Aplicação iniciada.");
}

export function setupPasswordChangeListeners() {
    const changePassBtn = document.getElementById('change-password-btn');
    const changePassModal = document.getElementById('change-password-modal');
    const cancelBtn = document.getElementById('change-password-cancel-btn');
    const saveBtn = document.getElementById('change-password-save-btn');
    const currentPassInput = document.getElementById('current-password-input');
    const newPassInput = document.getElementById('new-password-input');
    const confirmPassInput = document.getElementById('confirm-password-input');
    const modalTitle = changePassModal.querySelector('h2');

if (!changePassModal || !changePassBtn || !cancelBtn || !saveBtn) {
        console.warn("Elementos do modal de alteração de senha não encontrados.");
        return;
    }

const hideModal = () => {
        changePassModal.classList.remove('active');
        modalTitle.textContent = "Alterar Minha Senha";
        cancelBtn.classList.remove('hidden');
        currentPassInput.disabled = false;
        currentPassInput.classList.remove('bg-gray-100');
    };

showPasswordChangeModal = (isForced = false) => {
        currentPassInput.value = '';
        newPassInput.value = '';
        confirmPassInput.value = '';

if (isForced) {
            modalTitle.textContent = "Crie uma Nova Senha";
            cancelBtn.classList.add('hidden'); // Esconde o botão de cancelar
            currentPassInput.value = '1234';
            currentPassInput.disabled = true; // Desabilita o campo de senha atual
            currentPassInput.classList.add('bg-gray-100');
            newPassInput.focus();
        } else {
            modalTitle.textContent = "Alterar Minha Senha";
            cancelBtn.classList.remove('hidden');
            currentPassInput.disabled = false;
            currentPassInput.classList.remove('bg-gray-100');
            currentPassInput.focus();
        }
        changePassModal.classList.add('active');
    };

changePassBtn.addEventListener('click', () => {
        if (!currentUser || !currentUser.id) {
            showToast("Faça login para alterar sua senha.", "error");
            return;
        }
        showPasswordChangeModal(false); // Chamada para alteração voluntária
    });

cancelBtn.addEventListener('click', hideModal);

saveBtn.addEventListener('click', async () => {
        const newPass = newPassInput.value;
        const confirmPass = confirmPassInput.value;

if (!currentUser || !currentUser.id) return showToast("Sessão expirada. Faça login novamente.", "error");

const employee = employees.find(e => e.id === currentUser.id);
        const isForcedChange = currentPassInput.disabled;

if (!isForcedChange && (!employee || String(employee.password) !== currentPassInput.value)) {
            return showToast("Senha atual incorreta.", "error");
        }
        if (newPass.length < 4) return showToast("A nova senha deve ter no mínimo 4 caracteres.", "error");
        if (newPass !== confirmPass) return showToast("As novas senhas não coincidem.", "error");
        if (newPass === '1234') return showToast("Você não pode usar a senha padrão.", "error");

try {
            const employeeDocRef = doc(db, `employees/${currentUser.id}`);
            await updateDoc(employeeDocRef, { password: newPass });

if (employee) employee.password = newPass;

showToast("Senha alterada com sucesso!", "success");
            hideModal();

if (isForcedChange) {
                showToast("Entrando no sistema...", "info");
                await logActivity(currentUser.name, 'Login');
                await startApp('funcionario', currentUser);
            }
        } catch (error) {
            console.error("Erro ao alterar senha:", error);
            showToast("Falha ao alterar a senha. Tente novamente.", "error");
        }
    });
}

function setupTimeSelectorListeners() {
    const manualTimeInput = document.getElementById('manual-time-input');
    const confirmBtn = document.getElementById('confirm-manual-time-btn');
    const timeSlotsContainer = document.getElementById('time-slots-container');
    const deliveryTimeInput = document.getElementById('delivery-time');
    const timeSelectorModal = document.getElementById('interactive-time-selector-modal');

if (!manualTimeInput || !confirmBtn || !timeSlotsContainer || !deliveryTimeInput || !timeSelectorModal) {
        console.warn("Um ou mais elementos do seletor de horário não foram encontrados. A funcionalidade não será ativada.");
        return;
    }

manualTimeInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, ''); // Remove não-dígitos
        if (value.length > 2) {
            value = `${value.substring(0, 2)}:${value.substring(2, 4)}`;
        }
        e.target.value = value;
    });

const handleConfirm = async () => { // Adicionado 'async' aqui
        const timeValue = manualTimeInput.value;
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // Valida o formato HH:MM

if (!timeRegex.test(timeValue)) {
            showToast('Formato de hora inválido. Use HH:MM.', 'error');
            manualTimeInput.focus();
            return;
        }

const [hours, minutes] = timeValue.split(':').map(Number);
        if (hours < 9 || (hours >= 19 && minutes > 0)) {
            showToast('O horário de retirada deve ser entre 09:00 e 19:00.', 'error');
            manualTimeInput.focus();
            return;
        }

await openInteractiveTimeSelector(timeValue); // Chama a função com o horário manual

setTimeout(() => {
            const targetSlot = timeSlotsContainer.querySelector(`[data-time="${timeValue}"]`);
            if (targetSlot) {
                scrollToAndHighlight(targetSlot);
            }
        }, 100); // Pequeno atraso para garantir que o elemento foi renderizado

manualTimeInput.value = ''; // Limpa o input manual
    };

confirmBtn.addEventListener('click', handleConfirm);
    manualTimeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    });

const selectTimeAndCloseModal = (time) => {
        deliveryTimeInput.value = time;
        deliveryTimeInput.dispatchEvent(new Event('input', { bubbles: true }));
        timeSelectorModal.classList.remove('active');
    };

const scrollToAndHighlight = (element) => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('highlight-slot');
        setTimeout(() => {
            element.classList.remove('highlight-slot');
        }, 2500);
    };

const createTimeSlotButtonForManualEntry = (time) => {
        const button = document.createElement('button');
        button.className = 'time-slot-btn flex flex-col items-center justify-center p-3 border rounded-lg bg-gray-50 hover:bg-blue-100 hover:border-blue-400 transition-all duration-200';
        button.dataset.time = time;
        button.innerHTML = `
            <div class="flex justify-between items-center mb-1.5">
                <div class="font-bold text-lg">${time}</div>
                <strong class="text-gray-500 text-xl">0</strong>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                <div class="h-2.5 rounded-full bg-blue-500" style="width: 0%"></div>
            </div>
            <span class="absolute top-1 right-1 text-xs bg-indigo-500 text-white rounded-full px-1.5 py-0.5" title="Horário Personalizado"><i class="fas fa-star"></i></span>
        `;
        button.addEventListener('click', () => {
            selectTimeAndCloseModal(time);
        });
        return button;
    };

timeSlotsContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.time-slot-btn');
        if (button && button.dataset.time) {

const dateInput = dom.deliveryDate;

const combinedStr = `${dateInput.value} ${button.dataset.time}`;
            const slotDateTime = dateFns.parse(combinedStr, 'yyyy-MM-dd HH:mm', new Date());

const nowWithTolerance = dateFns.subMinutes(new Date(), 1);
            if (dateFns.isBefore(slotDateTime, nowWithTolerance)) {
                showToast('Este horário já passou e não pode ser selecionado.', 'info');
                return;
            }
            selectTimeAndCloseModal(button.dataset.time);
        }
    });
}

function showExpiredOrdersAlert(expiredOrders) {
    const modal = dom.alerts.modal;
    const listContainer = dom.alerts.list;
    const closeBtn = dom.alerts.closeBtn;

if (!modal || !listContainer || !closeBtn) {
        console.error("Elementos do modal da Central de Alertas não encontrados.");
        return;
    }

if (expiredOrders.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-500 p-8">Nenhum alerta de pedido expirado encontrado.</p>';
    } else {
        listContainer.innerHTML = expiredOrders.map(order => createExpiredOrderAlertHTML(order)).join('');
    }

modal.classList.add('active');

closeBtn.addEventListener('click', () => modal.classList.remove('active'), { once: true });

listContainer.addEventListener('click', handleAlertAction);
}

async function handleAlertAction(e) {
    const button = e.target.closest('.alert-action-btn');
    if (!button) return;

const alertItem = button.closest('[data-order-id]');
    const orderId = alertItem.dataset.orderId;
    const action = button.dataset.action;

console.log(`Ação de Alerta: ${action}, Pedido ID: ${orderId}`);

const orderFromState = pendingAlerts.find(o => o.id === orderId);

switch (action) {
        case 'liquidate':
            try {
                const orderRef = doc(db, "orders", orderId);
                const orderSnap = await getDoc(orderRef);
                if (orderSnap.exists()) {
                    const orderData = { id: orderSnap.id, ...orderSnap.data() };
                    const confirmedResult = await showCustomConfirm("Liquidar Saldo", `Confirmar a liquidação total do débito de ${formatCurrency(orderData.restante)} para o pedido #${orderData.orderNumber}?`);
                    if (confirmedResult) { // CORREÇÃO: A confirmação simples retorna 'true', não um objeto.
                        await updateDoc(orderRef, {
                            paymentStatus: 'pago',
                            restante: 0,
                            settledBy: { name: currentUser.name, id: currentUser.id }, // CORREÇÃO: Usar 'id' em vez de 'uid'
                            settledAt: serverTimestamp(),
                            alertStatus: 'resolvido',
                            alertHandledBy: { name: currentUser.name, id: currentUser.id },
                            alertHandledAt: serverTimestamp()
                        });
                        showToast("Pedido liquidado com sucesso!", "success");
                        alertItem.remove(); // Remove o item da lista visualmente
                        const index = pendingAlerts.findIndex(p => p.id === orderId);
                        if (index > -1) pendingAlerts.splice(index, 1);
                        if (dom.alerts.badge) dom.alerts.badge.textContent = pendingAlerts.length;
                        if (pendingAlerts.length === 0) dom.alerts.badge.classList.add('hidden');
                    }
                } else {
                    showToast("Pedido não encontrado.", "error");
                }
            } catch (error) {
                console.error("Erro ao liquidar pedido do alerta:", error);
                showToast("Falha ao liquidar pedido.", "error");
            }
            break;

case 'view':
            try {
                const orderData = await findOrderByDocId(orderId);
                if (orderData) {
                    loadOrderIntoForm(orderData);
                    showToast(`Pedido #${orderData.orderNumber} carregado!`, "success");
                    dom.alerts.modal.classList.remove('active'); // Fecha o modal de alertas
                }
            } catch (error) {
                console.error("Erro ao carregar pedido do alerta:", error);
                showToast("Falha ao carregar pedido do alerta.", "error");
            }
            break;

case 'send-manager':
            if (!orderFromState) {
                return showToast("Dados do pedido não encontrados para notificar.", "error");
            }
            const confirmed = await showCustomConfirm("Enviar para Gerente", "Tem certeza que deseja notificar a gerência sobre este pedido? Uma notificação será criada.");
            if (confirmed && confirmed.confirmed) {
                await createNotification('manager_attention', `Funcionário ${currentUser.name} solicita atenção para o pedido #${orderFromState.orderNumber}`, { orderId: orderId });
                await updateOrderAlertStatus(orderId, 'encaminhado_gerencia', currentUser);
                showToast("Gerência notificada com sucesso!", "success");

alertItem.remove();
                const index = pendingAlerts.findIndex(p => p.id === orderId);
                if (index > -1) pendingAlerts.splice(index, 1);
                if (dom.alerts.badge) {
                    dom.alerts.badge.textContent = pendingAlerts.length;
                    if (pendingAlerts.length === 0) dom.alerts.badge.classList.add('hidden');
                }
            }
            break;
    }
}

function setupThemeManager() {
    const themeToggleButtons = document.querySelectorAll('.theme-toggle-btn');

const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
    };

const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme) {
        applyTheme(savedTheme);
    } else if (systemPrefersDark) {
        applyTheme('dark');
    } else {
        applyTheme('light'); // Padrão
    }

themeToggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const isDark = document.documentElement.hasAttribute('data-theme');
            const newTheme = isDark ? 'light' : 'dark';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    });
}

async function main() {
    console.log("main: Iniciando a aplicação...");
    try { // CORREÇÃO: A inicialização do Firebase foi movida para 'firebase-config.js' para evitar dependência circular.
        console.log("main: Firebase inicializado a partir do módulo de configuração.");

initOfflineManager();

await loadConfig();
        await cacheEssentialData();

setupAuthListeners();

setupActivityLogListeners();

setupPasswordChangeListeners();

setupThemeManager();

setupTimeSelectorListeners();

await fetchEmployees().then(fetchedEmployees => {
            employees = fetchedEmployees; // Atualiza a variável global employees
            populateLoginEmployeeSelect(); // Popula o seletor de nomes na tela de login
            document.body.classList.remove('invisible');
            console.log("main: Aplicação pronta e visível.");
        }).catch(error => {
            console.error("Erro ao carregar funcionários na inicialização:", error);
            showToast("Erro ao carregar lista de funcionários.", "error");
            document.body.classList.remove('invisible');
        });

window.addEventListener('beforeunload', () => {
            if (currentUser) {
                 logActivity(currentUser.name, 'Logout');
            }
            stopNotificationListener(); // Para o listener ao fechar a aba
        });

const priceHistoryModal = document.getElementById('price-history-modal');
        const priceHistoryCloseBtn = document.getElementById('price-history-close-btn');

if (priceHistoryCloseBtn && priceHistoryModal) {
            priceHistoryCloseBtn.addEventListener('click', () => {
                priceHistoryModal.classList.remove('active');
            });
        }

const clientHistoryModal = document.getElementById('client-history-modal');
        const clientHistoryCloseBtn = document.getElementById('client-history-close-btn');

if (clientHistoryCloseBtn && clientHistoryModal) {
            clientHistoryCloseBtn.addEventListener('click', () => {
                clientHistoryModal.classList.remove('active');
            });
        }

const clientsTableBody = document.getElementById('manager-clients-table-body');
        if (clientsTableBody) {
            clientsTableBody.addEventListener('click', (e) => {
                const historyButton = e.target.closest('.view-client-history-btn');
                if (historyButton) {
                    const row = historyButton.closest('tr');
                    const clientId = row.dataset.clientId;
                    const clientName = row.dataset.clientName;
                    if (clientId && clientName) {
                        showClientHistoryModal(clientId, clientName);
                    }
                }
            });
        }

const overloadModal = document.getElementById('overload-warning-modal');
        const changeTimeBtn = document.getElementById('overload-change-time-btn');
        const continueAnywayBtn = document.getElementById('overload-continue-anyway-btn');

if (overloadModal && changeTimeBtn && continueAnywayBtn) {
            changeTimeBtn.addEventListener('click', () => {
                overloadModal.classList.remove('active');
                if (dom.deliveryTime) {
                    dom.deliveryTime.focus();
                    dom.deliveryTime.select();
                }
            });
        }

const reminderModal = document.getElementById('reminder-modal');
        const reminderCloseBtn = document.getElementById('reminder-close-btn');

if (reminderModal && reminderCloseBtn) {
            reminderCloseBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Previne qualquer comportamento padrão do botão.
                e.stopPropagation(); // Impede que o evento se propague para outros listeners.

console.log("Botão 'Fechar' do lembrete clicado. Escondendo o modal.");
                reminderModal.classList.remove('active'); // Apenas esconde o modal.
            });
        }

const expiredOrdersAlertCloseBtn = document.getElementById('expired-orders-alert-close-btn');
        if (expiredOrdersAlertCloseBtn) {
            expiredOrdersAlertCloseBtn.addEventListener('click', () => dom.alerts.modal.classList.remove('active'));
        }

const openAlertsBtn = dom.alerts.openBtn;
        if (openAlertsBtn && !openAlertsBtn.dataset.listenerAttached) {
            openAlertsBtn.addEventListener('click', () => {
                showExpiredOrdersAlert(pendingAlerts); // Chama a função correta que está neste arquivo
            });
            openAlertsBtn.dataset.listenerAttached = 'true'; // Previne múltiplos listeners
        }

const saveOverloadBtn = document.getElementById('manager-save-overload-btn');
        if (saveOverloadBtn) {
            saveOverloadBtn.addEventListener('click', async () => {
                const overloadLimitInput = document.getElementById('overload-limit-input');
                const overloadWindowInput = document.getElementById('overload-window-input');

const limit = parseInt(overloadLimitInput.value, 10);
                const windowMinutes = parseInt(overloadWindowInput.value, 10);

if (isNaN(limit) || isNaN(windowMinutes) || limit <= 0 || windowMinutes <= 0) {
                    showToast("Por favor, insira valores numéricos válidos e positivos.", "error");
                    return;
                }

try {
                    const prodConfigRef = doc(db, "config", "producao");
                    await setDoc(prodConfigRef, { limit, windowMinutes }, { merge: true });

productionSettings = { limit, windowMinutes };

showToast("Configurações de sobrecarga salvas com sucesso!", "success");
                    console.log("Configurações de sobrecarga salvas:", productionSettings);
                } catch (error) {
                    console.error("Erro ao salvar configurações de sobrecarga:", error);
                    showToast("Falha ao salvar as configurações.", "error");
                }
            });
        }

const managerMenuBtn = document.getElementById('manager-menu-btn');
        const sidebar = document.getElementById('manager-sidebar');
        const overlay = document.getElementById('manager-overlay');

if (managerMenuBtn && sidebar && overlay) {
            const toggleSidebar = () => {
                sidebar.classList.toggle('sidebar-expanded');
                sidebar.classList.toggle('sidebar-collapsed');
                overlay.classList.toggle('hidden');
            };

managerMenuBtn.addEventListener('click', toggleSidebar);
            overlay.addEventListener('click', toggleSidebar);
        } else {
            console.warn("Elementos do menu lateral do gerente não foram encontrados. A funcionalidade de toggle não funcionará.");
        }

const goToPdvBtn = document.getElementById('go-to-pdv-btn');
        if (goToPdvBtn) {
            goToPdvBtn.addEventListener('click', async () => {
                console.log("Botão 'Ir para PDV' clicado.");
                if (currentUser && (currentUser.role === 'gerente' || currentUser.role === 'mestra')) {
                    showToast("Carregando PDV...", "info");
                    await startApp('funcionario', currentUser);
                } else {
                    console.error("Tentativa de acesso ao PDV por um usuário não autorizado:", currentUser);
                    showToast("Ação não permitida.", "error");
                }
            });
        }

const teamView = document.getElementById('view-equipe');
        if (teamView) {
            teamView.addEventListener('click', async (e) => {
                const targetButton = e.target.closest('.reset-password-btn');
                if (targetButton) {
                    const employeeId = targetButton.dataset.employeeId;
                    const employeeName = targetButton.dataset.employeeName;

const confirmation = await showCustomConfirm(
                        'Redefinir Senha?',
                        `Tem certeza que deseja redefinir a senha de <strong>${employeeName}</strong> para o padrão "1234"?`,
                        {
                            okButtonText: "Confirmar Redefinição",
                            okButtonClass: "bg-blue-600 hover:bg-blue-700",
                        }
                    );

if (confirmation && confirmation.confirmed) {
                        try {
                            const employeeDocRef = doc(db, `employees/${employeeId}`);
                            await updateDoc(employeeDocRef, {
                                password: '1234'
                            });
                            showToast(`Senha de ${employeeName} redefinida com sucesso!`, 'success');

try {
                                const notificationsRef = collection(db, 'notifications');
                                const q = query(notificationsRef,
                                    where("type", "==", "password_reset_request"),
                                    where("employeeId", "==", employeeId),
                                    where("read", "==", false)
                                );
                                const querySnapshot = await getDocs(q);
                                querySnapshot.forEach(async (notificationDoc) => {
                                    await updateDoc(notificationDoc.ref, { read: true });
                                    console.log(`Notificação ${notificationDoc.id} marcada como lida.`);
                                });
                            } catch (error) {
                                console.error("Erro ao marcar notificação como lida:", error);
                            }
                        } catch (error) {
                            console.error("Erro ao redefinir a senha:", error);
                            showToast('Falha ao redefinir a senha.', 'error');
                        }
                    }
                }
            });
        }

const managerAccessBtn = document.getElementById('manager-access-btn');
        if (managerAccessBtn) {
            managerAccessBtn.addEventListener('click', async () => {
                console.log("Botão de acesso gerencial rápido clicado.");
                const confirmation = await showCustomConfirm(
                    "Acesso Gerencial",
                    "Digite as credenciais da gerência para continuar.",
                    {
                        okButtonText: "Entrar",
                        okButtonClass: "bg-orange-500 hover:bg-orange-600",
                        showInput: 'user-pass' // Sinaliza para mostrar os campos de usuário e senha
                    }
                );

if (confirmation && confirmation.confirmed) {
                    if (confirmation.user === managerCredentials.user && String(confirmation.pass) === String(managerCredentials.pass)) {
                        showToast("Acesso autorizado. Carregando painel...", "success");
                        if (currentUser) {
                            await logActivity(currentUser.name, 'Logout');
                        }
                        await startApp('gerente', { name: 'Gerência', role: 'gerente' });
                    } else {
                        showToast("Usuário ou senha incorretos.", "error");
                    }
                }
            });
        }

const showTodayReminderBtn = document.getElementById('show-today-reminder-btn');
        if (showTodayReminderBtn) {
            showTodayReminderBtn.addEventListener('click', async () => {
                try {
                    const dailyDeliveries = await checkForDailyDeliveries();
                    if (dailyDeliveries && dailyDeliveries.length > 0) {
                        showReminderModal(dailyDeliveries);
                    } else {
                        showToast("Nenhum pedido com retirada para hoje.", "info");
                    }
                } catch (error) {
                    console.error("Erro ao buscar lembrete de hoje manualmente:", error);
                    showToast("Erro ao buscar lembrete de hoje.", "error");
                }
            });
        }

const showTomorrowReminderBtn = document.getElementById('show-tomorrow-reminder-btn');
        if (showTomorrowReminderBtn) {
            showTomorrowReminderBtn.addEventListener('click', async () => {
                try {
                    const tomorrowDeliveries = await checkForTomorrowDeliveries();
                    if (tomorrowDeliveries && tomorrowDeliveries.length > 0) {
                        showTomorrowReminderModal(tomorrowDeliveries);
                    } else {
                        showToast("Nenhum pedido com retirada para amanhã.", "info");
                    }
                } catch (error) {
                    console.error("Erro ao buscar lembrete de amanhã manualmente:", error);
                    showToast("Erro ao buscar lembrete de amanhã.", "error");
                }
            });
        }

const returnToManagerBtn = document.getElementById('return-to-manager-btn');
        if (returnToManagerBtn) {
            returnToManagerBtn.addEventListener('click', async () => {
                console.log("Botão 'Voltar ao Painel' clicado.");
                if (currentUser && (currentUser.role === 'gerente' || currentUser.role === 'mestra')) {
                    showToast("Retornando ao painel gerencial...", "info");
                    await startApp(currentUser.role, currentUser);
                } else {
                    console.error("Tentativa de retorno ao painel por um usuário não autorizado:", currentUser);
                    showToast("Ação não permitida.", "error");
                }
            });
        }

} catch (e) {
        document.body.innerHTML = `
            <div class="flex items-center justify-center min-h-screen bg-gray-100 font-sans">
                <div class="text-center p-8 bg-white rounded-lg shadow-2xl max-w-md mx-4">
                    <i class="fas fa-times-circle text-5xl text-red-500 mb-4"></i>
                    <h1 class="text-2xl font-bold text-gray-800 mb-2">Erro Crítico</h1>
                    <p class="text-gray-600 mb-6">Ocorreu um erro inesperado que impediu o carregamento do sistema. Por favor, tente recarregar a página.</p>
                    <button onclick="window.location.reload()" class="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
                        Recarregar Aplicação
                    </button>
                    <details class="mt-4 text-left text-xs text-gray-500"><summary class="cursor-pointer">Detalhes técnicos</summary><pre class="mt-2 p-2 bg-gray-100 rounded whitespace-pre-wrap break-all">${e.stack}</pre></details>
                </div>
            </div>
        `;
        console.error("ERRO CRÍTICO:", e);
    }
}
document.addEventListener('DOMContentLoaded', main);

// Ajuste dinâmico do tamanho do texto do campo SINAL conforme comprimento
document.addEventListener('DOMContentLoaded', () => {
    const sinalInput = document.getElementById('sinal-input');
    if(!sinalInput) return;
    const wrapper = sinalInput.closest('.osg-item.osg-sinal');
    if(!wrapper) return;
    function resize() {
        const v = (sinalInput.value||'').trim();
        wrapper.classList.remove('long-value','longer-value','longest-value');
        const len = v.length;
        if(len > 9 && len <= 11) wrapper.classList.add('long-value');
        else if(len > 11 && len <= 13) wrapper.classList.add('longer-value');
        else if(len > 13) wrapper.classList.add('longest-value');
    }
    sinalInput.addEventListener('input', resize);
    sinalInput.addEventListener('change', resize);
    
    // NOVO: Aplica melhorias do resumo quando o sinal é alterado
    sinalInput.addEventListener('input', () => {
        // Importa e chama a função de melhorias
        import('./pdv.js').then(module => {
            if (module.applyOrderSummaryEnhancements) {
                module.applyOrderSummaryEnhancements();
            }
        });
    });
    sinalInput.addEventListener('change', () => {
        // Importa e chama a função de melhorias
        import('./pdv.js').then(module => {
            if (module.applyOrderSummaryEnhancements) {
                module.applyOrderSummaryEnhancements();
            }
        });
    });
    
    resize();
});

