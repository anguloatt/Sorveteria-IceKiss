// Meu arquivo de funções utilitárias e de interface (toasts, modais, formatação).

import { dom } from './domRefs.js';
import { managerCredentials, masterCredentials, productsConfig, storeSettings, currentReminderOrders } from './app.js';

// Eu carrego a biblioteca date-fns via CDN no index.html.
// Isso a torna disponível globalmente no objeto `dateFns`, então não preciso importá-la aqui.

// Minha variável para controlar o timeout do toast e evitar sobreposições.
let toastTimeout;

/**
 * Minha função para exibir uma notificação (toast) na tela.
 * @param {string} message A mensagem que vou exibir.
 * @param {string} type O tipo de toast ('success', 'error', 'info').
 * @param {number} duration A duração em milissegundos (o padrão é 3000).
 */
export function showToast(message, type = 'info', duration = 3000) {
    if (!dom.toast) {
        console.error("Elemento toast não encontrado no DOM.");
        return;
    }
    // Eu limpo qualquer timeout anterior para que o novo toast apareça imediatamente.
    clearTimeout(toastTimeout);

    dom.toast.textContent = message;
    dom.toast.className = `toast ${type}`;

    // Forço um reflow para garantir que a transição CSS seja aplicada corretamente.
    void dom.toast.offsetWidth;

    dom.toast.classList.add('show');

    // Defino um timeout para esconder o toast depois que o tempo passar.
    toastTimeout = setTimeout(() => {
        dom.toast.classList.remove('show');
    }, duration);
}

/**
 * Minha função para exibir um modal de confirmação personalizado.
 * @param {string} title O título que vou mostrar no modal.
 * @param {string} message A mensagem do modal.
 * @param {object} options Opções adicionais que posso usar:
 * - {boolean} showInput: Se eu devo mostrar os campos de usuário/senha.
 * - {boolean} passwordRequired: Se a senha é obrigatória e deve ser validada.
 * @returns {Promise<boolean|object>} Eu retorno `false` se for cancelado. Se confirmado, retorno `true` ou um objeto com os dados do input.
 */
export function showCustomConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        // Defino valores padrão para as opções para garantir que sempre existam.
        const finalOptions = { showInput: false, passwordRequired: false, ...options };

        const {
            customConfirmModal, confirmModalTitle, confirmModalMessage,
            confirmModalOkBtn, confirmModalCancelBtn, confirmModalInputContainer,
            confirmModalInputUser, confirmModalInputPass
        } = dom;

        if (!customConfirmModal || !confirmModalTitle || !confirmModalMessage || !confirmModalOkBtn || !confirmModalCancelBtn || !confirmModalInputContainer || !confirmModalInputUser || !confirmModalInputPass) {
            console.error("Elementos do modal de confirmação personalizados não encontrados no DOM.");
            resolve(false);
            return;
        }

        confirmModalTitle.textContent = title;
        confirmModalMessage.innerHTML = message; // Use innerHTML para permitir tags como <br>

        confirmModalInputUser.value = '';
        confirmModalInputPass.value = '';

        // Mostro e configuro os inputs se a opção for ativada.
        if (finalOptions.showInput) {
            confirmModalInputContainer.classList.remove('hidden');
            // Lido com os diferentes tipos de input que configurei.
            if (finalOptions.showInput === 'pass-only') {
                confirmModalInputUser.classList.add('hidden');
                confirmModalInputPass.classList.remove('hidden');
                confirmModalInputPass.placeholder = "Digite a senha";
                confirmModalInputPass.focus();
            } else { // O padrão é 'user-pass'.
                confirmModalInputUser.classList.remove('hidden');
                confirmModalInputPass.classList.remove('hidden');
                confirmModalInputUser.placeholder = "Usuário";
                confirmModalInputPass.placeholder = "Senha";
                confirmModalInputUser.focus();
            }
        } else {
            confirmModalInputContainer.classList.add('hidden');
        }
        
        // Personaliza os botões se as opções forem fornecidas
        confirmModalOkBtn.textContent = finalOptions.okButtonText || 'Confirmar';
        confirmModalCancelBtn.textContent = finalOptions.cancelButtonText || 'Cancelar';
        confirmModalOkBtn.className = `px-6 py-2 rounded-lg ${finalOptions.okButtonClass || 'bg-red-600 text-white hover:bg-red-700'}`;


        const handleConfirm = async () => {
            if (finalOptions.passwordRequired) {
                const user = confirmModalInputUser.value.trim();
                const pass = confirmModalInputPass.value;

                if ((user.toLowerCase() === managerCredentials.user && pass === managerCredentials.pass) ||
                    (user.toLowerCase() === masterCredentials.user && pass === masterCredentials.pass)) {
                    cleanupAndResolve(true);

                } else {
                    showToast("Usuário ou senha de gerência incorretos.", "error");
                    // Mantenho o modal aberto para uma nova tentativa.
                }
            } else if (finalOptions.showInput) {
                cleanupAndResolve({
                    confirmed: true,
                    user: confirmModalInputUser.value,
                    pass: confirmModalInputPass.value
                });
            } else {
                cleanupAndResolve(true);
            }
        };

        const handleCancel = () => {
            cleanupAndResolve(false);
        };

        const handleEnterOnUser = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmModalInputPass.focus();
            }
        };

        const handleEnterOnPass = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };

        // Minha função para limpar todos os listeners e resolver a promise.
        const cleanupAndResolve = (value) => {
            confirmModalOkBtn.removeEventListener('click', handleConfirm);
            confirmModalCancelBtn.removeEventListener('click', handleCancel);
            confirmModalInputUser.removeEventListener('keydown', handleEnterOnUser);
            confirmModalInputPass.removeEventListener('keydown', handleEnterOnPass);
            customConfirmModal.classList.remove('active');
            resolve(value);
        };

        confirmModalOkBtn.addEventListener('click', handleConfirm, { once: true });
        confirmModalCancelBtn.addEventListener('click', handleCancel, { once: true });
        confirmModalInputUser.addEventListener('keydown', handleEnterOnUser);
        confirmModalInputPass.addEventListener('keydown', handleEnterOnPass);

        customConfirmModal.classList.add('active');
    });
}

/**
 * Formata um valor numérico para o formato de moeda brasileira (R$ X.XXX,XX).
 * @param {number} value O valor numérico.
 * @returns {string} O valor formatado como moeda.
 */
export function formatCurrency(value) {
    const numberValue = Number(value);
    if (isNaN(numberValue)) {
        return 'R$ 0,00'; // Retorna um valor padrão para inválidos
    }
    return numberValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Arredonda um valor para 2 casas decimais, tratando problemas de ponto flutuante.
 * @param {number} value O valor a ser arredondado.
 * @returns {number} O valor arredondado.
 */
export function roundSinal(value) {
    if (typeof value !== 'number' || isNaN(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Converte uma string de moeda brasileira (ex: "1.234,56" ou "R$ 12,50") para um número float (ex: 1234.56 ou 12.5).
 * Esta função é essencial para ler os valores dos campos de formulário e evitar erros de formatação.
 * @param {string} currencyString A string da moeda a ser convertida.
 * @returns {number} O valor numérico. Retorna 0 se a conversão falhar.
 */
export function parseCurrency(currencyString) {
    if (typeof currencyString !== 'string' || !currencyString) {
        return 0;
    }

    // 1. Remove tudo que não for dígito ou vírgula.
    // Ex: "R$ 1.234,56" -> "1234,56"
    const cleanedString = currencyString.replace(/[^\d,]/g, '');

    // 2. Troca a vírgula decimal por um ponto para que o parseFloat funcione.
    // Ex: "1234,56" -> "1234.56"
    const numberString = cleanedString.replace(',', '.');

    // 3. Converte para número.
    const value = parseFloat(numberString);

    // 4. Retorna 0 se o resultado não for um número válido.
    return isNaN(value) ? 0 : value;
}


/**
 * Formata uma data para o formato DD/MM/YYYY.
 * @param {Date|Object} date A data a ser formatada (pode ser um objeto Timestamp do Firebase).
 * @returns {string} A data formatada.
 */
export function formatDateToBR(date) {
    if (!date) return '';
    let d = date instanceof Date ? date : date.toDate();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Formata uma data e hora para o formato DD/MM/YYYY HH:MM.
 * @param {Date|Object} date A data a ser formatada (pode ser um objeto Timestamp do Firebase).
 * @returns {string} A data e hora formatadas.
 */
export function formatDateTimeToBR(date) {
    if (!date) return '';
    let d = date instanceof Date ? date : date.toDate();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Retorna a data de hoje no formato YYYY-MM-DD para inputs type="date".
 * @returns {string} A data de hoje formatada.
 */
export function getTodayDateString(format = 'yyyy-mm-dd') {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    if (format === 'yyyy-mm-dd') {
        return `${year}-${month}-${day}`;
    } else if (format === 'dd/mm/yyyy') {
        return `${day}/${month}/${year}`;
    }
    return ''; // Padrão
}

/**
 * Atualiza o elemento que exibe o dia da semana com base na data do input.
 * @param {string} dateString A data no formato 'YYYY-MM-DD'.
 */
export function updateWeekdayDisplay(dateString) {
    if (!dom.deliveryDateWeekday) return;
    if (!dateString) {
        dom.deliveryDateWeekday.textContent = '';
        return;
    }
    const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    // CORREÇÃO CRÍTICA: Evita problemas de fuso horário.
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    dom.deliveryDateWeekday.textContent = weekdays[date.getDay()];
}

/**
 * Capitaliza a primeira letra de cada palavra em uma string.
 * @param {string} str A string a ser formatada.
 * @returns {string} A string com as primeiras letras capitalizadas.
 */
export function formatNameToTitleCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/**
 * Formata o valor de um input para o formato de telefone brasileiro (XX) XXXXX-XXXX.
 * @param {Event} e O evento de input.
 */
export function formatPhone(e) {
    let value = e.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito
    value = value.substring(0, 11); // Limita a 11 dígitos (DDD + 9 dígitos)

    if (value.length > 10) {
        // (XX) XXXXX-XXXX
        value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    } else if (value.length > 6) {
        // (XX) XXXX-XXXX
        value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
    } else if (value.length > 2) {
        // (XX) XXXX
        value = value.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
    } else if (value.length > 0) {
        value = `(${value}`;
    }
    e.target.value = value;
}

/**
 * Formata o valor de um input para o formato de hora (HH:MM).
 * @param {Event} e O evento de input.
 */
export function formatTime(e) {
    const input = e.target;

    let value = input.value.replace(/\D/g, '');

    if (value.length >= 2) {
        let hour = parseInt(value.substring(0, 2), 10);
        if (hour > 23) {
            value = '23' + value.substring(2);
        }
    }

    if (value.length >= 4) {
        let minute = parseInt(value.substring(2, 4), 10);
        if (minute > 59) {
            value = value.substring(0, 2) + '59';
        }
    }

    if (value.length > 2) {
        value = `${value.substring(0, 2)}:${value.substring(2, 4)}`;
    }

    input.value = value;
}

/**
 * Obtém informações de um produto pelo seu ID, buscando em todas as categorias.
 * @param {string} productId O ID do produto.
 * @returns {object|null} O objeto do produto ou null se não encontrado.
 */
export function getProductInfoById(productId) {
    if (!productsConfig) {
        console.warn("productsConfig não está disponível via importação de módulo.");
        return null;
    }
    for (const category in productsConfig) {
        const product = productsConfig[category].find(p => p.id === productId);
        if (product) {
            return product;
        }
    }
    return null;
}

/**
 * Função auxiliar para centralizar texto em uma largura específica.
 * @param {string} text O texto a ser centralizado.
 * @param {number} width A largura total desejada.
 * @returns {string} O texto centralizado com espaços.
 */
export const centerText = (text, width = 40) => {
    const padding = Math.max(0, width - text.length);
    const padLeft = Math.floor(padding / 2);
    const padRight = padding - padLeft;
    return ' '.repeat(padLeft) + text + ' '.repeat(padRight);
};

/**
 * Função auxiliar para alinhar texto à direita em uma largura específica.
 * @param {string} text O texto a ser alinhado à direita.
 * @param {number} width A largura total desejada.
 * @returns {string} O texto alinhado à direita com espaços.
 */
export const rightAlignText = (text, width = 40) => {
    return ' '.repeat(Math.max(0, width - text.length)) + text;
};

/**
 * Função auxiliar para alinhar texto à esquerda em uma largura específica.
 * @param {string} text O texto a ser alinhado à esquerda.
 * @param {number} width A largura total desejada.
 * @returns {string} O texto alinhado à esquerda com espaços.
 */
export const leftAlignText = (text, width = 40) => {
    return text + ' '.repeat(Math.max(0, width - text.length));
};

/**
 * Função auxiliar para alinhar duas colunas (esquerda e direita) em uma largura total.
 * @param {string} left O texto da coluna esquerda.
 * @param {string} right O texto da coluna direita.
 * @param {number} width A largura total desejada.
 * @returns {string} As duas colunas alinhadas.
 */
export const twoColumns = (left, right, width = 40) => {
    const spaceBetween = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(spaceBetween) + right;
};

/**
 * GERA O TEXTO FORMATADO PARA IMPRESSÃO/WHATSAPP (FORMATO CUPOM).
 * @param {object} order O objeto do pedido.
 * @returns {string} O texto formatado do ticket.
 */
export function generateTicketText(order) {
    if (!order || !storeSettings) {
        console.error("Dados do pedido ou configurações da loja não disponíveis para gerar ticket.");
        return "Erro ao gerar comprovante.";
    }

    const settings = storeSettings;
    const storeName = settings.name || "Sua Loja";
    const storePhone = settings.phone || "(XX) XXXX-XXXX";
    const ticketTitle = settings.ticketTitle || "COMPROVANTE DE PEDIDO";
    const ticketSubtitle = settings.ticketSubtitle || "(NAO E DOCUMENTO FISCAL)";
    const footerMessage = settings.footerMessage || "Obrigado(a) pela preferência!";
    const printUnitPrice = settings.printUnitPrice || false;
    const width = 35; // Largura do cupom em caracteres

    const separator = "=".repeat(width);
    const thinSeparator = "-".repeat(width);

    let text = `${centerText(storeName, width)}\n`;
    text += `${centerText(storePhone, width)}\n`;
    text += `${separator}\n`;
    text += `${centerText(ticketTitle.toUpperCase(), width)}\n`;
    text += `${centerText(ticketSubtitle, width)}\n`;
    text += `${thinSeparator}\n`;

    text += `PEDIDO: ${order.orderNumber}\n`;
    text += `EMISSAO: ${formatDateTimeToBR(order.createdAt)}\n`;
    text += `OPERADOR: ${order.createdBy?.name || 'N/A'}\n`;
    text += `${thinSeparator}\n`;

    text += `CLIENTE: ${order.customer?.name || 'N/A'}\n`;
    text += `TELEFONE: ${order.customer?.phone || 'N/A'}\n`;

    let deliveryWeekday = '';
    if (order.delivery?.date) {
        const [day, month, year] = order.delivery.date.split('/');
        const dateObj = new Date(`${year}-${month}-${day}T00:00:00`);
        if (!isNaN(dateObj.getTime())) {
            const weekdays = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];
            deliveryWeekday = weekdays[dateObj.getDay()];
        }
    }

    text += `RETIRADA:${order.delivery?.date || 'N/A'} ${deliveryWeekday} as ${order.delivery?.time || 'N/A'}\n`;
    text += `${separator}\n`;

    if (printUnitPrice) {
        text += `${leftAlignText("QTD.ITEM (VL.UNIT)", width)}\n`;
    } else {
        text += `${twoColumns("QTD.ITEM", "TOTAL R$", width)}\n`;
    }
    text += `${thinSeparator}\n`;

    let totalSalgados = 0;

    (order.items || []).forEach(item => {
        const itemName = item.isManual ? item.name : getProductInfoById(item.id)?.name || item.name;
        let itemLine = `${item.quantity}x ${itemName}`;

        if (printUnitPrice && !item.isManual) {
            itemLine += ` (${formatCurrency(item.unitPrice)})`;
        }

        const maxItemNameLength = printUnitPrice ? 20 : 28;
        if (itemLine.length > maxItemNameLength) {
            itemLine = itemLine.substring(0, maxItemNameLength - 3) + '...';
        }

        text += `${twoColumns(itemLine, formatCurrency(item.subtotal), width)}\n`;

        if (item.category === 'fritos' || item.category === 'assados' || item.category === 'revenda') {
            totalSalgados += item.quantity;
        }
    });

    if (totalSalgados > 0) {
        text += `${thinSeparator}\n`;
        text += `${leftAlignText("TOTAL DE SALGADOS: " + totalSalgados, width)}\n`;
    }

    text += `${separator}\n`;
    text += `${rightAlignText("VALOR A PAGAR: " + formatCurrency(order.total), width)}\n`;
    text += `${rightAlignText("SINAL: " + formatCurrency(order.sinal), width)}\n`;
    text += `${rightAlignText("VALOR EM ABERTO: " + formatCurrency(order.restante), width)}\n`;
    text += `${thinSeparator}\n`;
    const paymentStatusText = order.paymentStatus === 'pago' ? 'SALDO TOTAL PAGO' : 'EM ABERTO';
    text += `${centerText(`STATUS DO PG: * ${paymentStatusText} *`, width)}\n`;
    text += `${separator}\n`;
    text += `${centerText(footerMessage, width)}\n`;
    text += `\n\n`;

    return text;
}


/**
 * GERA O TEXTO FORMATADO PARA IMPRESSÃO DO LEMBRETE DE PRODUÇÃO (FORMATO CUPOM).
 * @param {Array<object>} orders A lista de pedidos para o lembrete.
 * @returns {string} O texto formatado do lembrete.
 */
export function generatePrintableReminderText(orders) {
    let text = `========================================\n`;
    text += `${centerText("Lembrete de Producao Diaria", 40)}\n`;
    text += `Data: ${getTodayDateString('dd/mm/yyyy')}\n`;
    text += `Atualizado em: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}\n`;
    text += `========================================\n`;

    const consolidatedItems = {};
    let totalSalgados = 0;

    orders.forEach(order => {
        (order.items || []).forEach(item => {
            const key = item.name || getProductInfoById(item.id).name;
            consolidatedItems[key] = (consolidatedItems[key] || 0) + item.quantity;
            if (['fritos', 'assados', 'revenda'].includes(item.category)) {
                totalSalgados += item.quantity;
            }
        });
    });

    if (Object.keys(consolidatedItems).length > 0) {
        text += `ITENS PARA PRODUZIR:\n`;
        Object.entries(consolidatedItems).sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
            text += `${String(count).padEnd(5)} ${name}\n`;
        });
    } else {
        text += `${centerText("Nenhum item para produzir hoje.", 40)}\n`;
    }

    text += `----------------------------------------\n`;
    text += `${leftAlignText("TOTAL SALGADOS: " + totalSalgados, 40)}\n`;
    text += `========================================\n`;
    text += `PEDIDOS PARA RETIRADA HOJE:\n`;

    if (orders.length > 0) {
        orders.sort((a, b) => (a.delivery?.time || '99:99').localeCompare(b.delivery?.time || '99:99')).forEach(order => {
            text += `\nPedido: ${order.orderNumber}\n`;
            text += `Cliente: ${order.customer?.name || 'N/A'}\n`;
            text += `Retirada: ${order.delivery?.time || 'N/A'}\n`;
            text += `  Itens:\n`;
            (order.items || []).forEach(item => {
                const itemName = item.name || getProductInfoById(item.id).name;
                text += `    - ${item.quantity} ${itemName}\n`;
            });
        });
    } else {
        text += `${centerText("Nenhum pedido para retirada hoje.", 40)}\n`;
    }

    text += `========================================\n`;
    text += `${centerText("LEMBRETE IMPORTANTE: Os dados acima", 40)}\n`;
    text += `${centerText("sao atualizados ao iniciar o sistema.", 40)}\n`;
    text += `========================================\n`;

    return text;
}


/**
 * Imprime o ticket/comprovante de um pedido.
 * @param {object} order O objeto do pedido.
 */
export function printTicket(order) {
    if (!order || !order.orderNumber) {
        showToast("Pedido inválido para impressão.", "error");
        return;
    }
    const ticketContent = generateTicketText(order);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast("Permita pop-ups para imprimir.", "error");
        console.error("printTicket: Janela de impressão bloqueada.");
        return;
    }
    //font-size: 13px; /* Tamanho da fonte aumentado para melhor leitura */
    printWindow.document.open();
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Comprovante Pedido #${order.orderNumber}</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; font-size: 14px; margin: 0; padding: 5px; width: 80mm; box-sizing: border-box; }
                pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
            </style>
        </head>
        <body>
            <pre>${ticketContent}</pre>
        </body>
        </html>
    `);
    printWindow.document.close();

    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}

/**
 * Envia o comprovante de um pedido via WhatsApp.
 * @param {object} order O objeto do pedido.
 */
export function sendWhatsAppMessage(order) {
    if (!order.customer?.phone) {
        return showToast("Telefone do cliente não informado.", "error");
    }
    const phone = order.customer.phone.replace(/\D/g, '');
    if (phone.length < 10) return showToast("Número de telefone inválido.", "error");

    const ticketText = generateTicketText(order);

    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(ticketText)}`;
    window.open(whatsappUrl, '_blank');
}

/**
 * Imprime o conteúdo de uma área específica do DOM.
 * @param {string} elementId O ID do elemento a ser impresso.
 * @param {string} title O título para a janela de impressão.
 */
export function printElement(elementId, title = document.title) {
    const printContent = document.getElementById(elementId);
    if (!printContent) {
        showToast("Erro: Conteúdo para impressão não encontrado.", "error");
        console.error(`Elemento com ID '${elementId}' não encontrado para impressão.`);
        return;
    }

    const clonedContent = printContent.cloneNode(true);
    clonedContent.querySelectorAll('.no-print').forEach(el => el.remove());

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast("Permita pop-ups para imprimir.", "error");
        return;
    }

    printWindow.document.open();
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>\${title}</title>
            <link rel="stylesheet" href="https://cdn.tailwindcss.com/2.2.19/tailwind.min.css">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body { font-family: 'Poppins', sans-serif; margin: 0; padding: 20px; }
                .no-print { display: none !important; }
                #reminder-content-to-print { padding: 10px; font-family: 'Courier New', Courier, monospace !important; font-size: 14px !important; line-height: 1.2 !important; white-space: pre-wrap !important; word-wrap: break-word !important; }
                #reminder-summary-items div, #reminder-orders-list div { border: none; padding: 0; margin-bottom: 0; }
                h2, h3 { color: #333; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; }
            </style>
        </head>
        <body>
            ${clonedContent.innerHTML}
        </body>
        </html>
    `);
    printWindow.document.close();

    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}

/**
 * Função para imprimir o relatório do funcionário.
 */
export function printEmployeeReport() {
    printElement('employee-report-modal', 'Relatório do Funcionário');
}

/**
 * Função para imprimir a lista de lembretes de produção.
 */
export function printReminderList() {
    const reminderContent = generatePrintableReminderText(currentReminderOrders);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showToast("Permita pop-ups para imprimir.", "error");
        return;
    }
    //font-size: 13px; /* Tamanho da fonte aumentado para melhor leitura */
    printWindow.document.open();
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Lembrete de Produção</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; font-size: 14px; margin: 0; padding: 5px; width: 80mm; box-sizing: border-box; }
                pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
            </style>
        </head>
        <body>
            <pre>${reminderContent}</pre>
        </body>
        </html>
    `);
    printWindow.document.close();

    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}

/**
 * Formata o input como moeda brasileira ao perder o foco.
 * @param {HTMLInputElement|string} inputOrValue O elemento input ou o próprio valor em string.
 */
export function formatInputAsCurrency(inputOrValue) {
    try {
        let valueStr;
        let isInputElement = typeof inputOrValue === 'object' && inputOrValue !== null && typeof inputOrValue.value !== 'undefined';

        if (isInputElement) {
            valueStr = inputOrValue.value;
        } else {
            valueStr = String(inputOrValue);
        }

        let numericValue = parseCurrency(valueStr);
        let formattedValue = formatCurrency(numericValue);

        if (isInputElement) {
            inputOrValue.value = formattedValue;
        }

        return formattedValue;
    } catch (error) {
        console.error("Erro ao formatar valor como moeda:", error);
        let isInputElement = typeof inputOrValue === 'object' && inputOrValue !== null && typeof inputOrValue.value !== 'undefined';
        if (isInputElement) {
            inputOrValue.value = 'R$ 0,00';
        }
        return 'R$ 0,00';
    }
}


/**
 * Formata a data da primeira compra para uma string amigável ("Cliente há X meses").
 * @param {Date} firstOrderDate A data do primeiro pedido do cliente.
 * @returns {string} Uma string formatada como "há 3 meses", "há 1 ano", etc.
 */
export function formatClientSince(firstOrderDate) {
    if (!firstOrderDate || !(firstOrderDate instanceof Date) || isNaN(firstOrderDate.getTime())) {
        return '--';
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfFirstOrderDate = new Date(firstOrderDate.getFullYear(), firstOrderDate.getMonth(), firstOrderDate.getDate());

    if (startOfFirstOrderDate.getTime() === startOfToday.getTime()) {
        return 'Hoje';
    }

    if (typeof window.dateFns === 'undefined' || typeof window.dateFns.locale === 'undefined' || typeof window.dateFns.locale.ptBR === 'undefined') {
        console.error("A biblioteca date-fns ou o locale pt-BR não estão completamente carregados no objeto global 'window.dateFns'.");
        return formatDateToBR(firstOrderDate);
    }

    return window.dateFns.formatDistanceToNow(firstOrderDate, { addSuffix: true, locale: window.dateFns.locale.ptBR });
}

/**
 * Conta a quantidade total de salgados (fritos e assados) em uma lista de itens de pedido.
 * @param {Array<object>} items A lista de itens do pedido.
 * @returns {number} A quantidade total de salgados.
 */
export function getSalgadosCountFromItems(items) {
    if (!items || !Array.isArray(items)) return 0;
    return items.reduce((total, item) => {
        if (item.category === 'assados' || item.category === 'fritos') {
            return total + item.quantity;
        }
        return total;
    }, 0);
}

/**
 * Toca um arquivo de som.
 * @param {string} soundUrl O caminho para o arquivo de som (ex: 'sounds/notification.mp3').
 */
export function playSound(soundUrl) {
    const audio = new Audio(soundUrl);
    audio.play().catch(error => {
        console.warn(`Não foi possível tocar o som "${soundUrl}". Isso geralmente requer uma interação do usuário com a página primeiro. Erro:`, error.message);
    });
}

/**
 * Retorna a data e hora atuais no fuso horário de São Paulo.
 * @returns {{year: string, month: string, day: string, hour: string, minute: string}}
 */
export function getSaoPauloCurrentTime() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const spTime = {};
    for (const part of parts) {
        if (part.type !== 'literal') {
            spTime[part.type] = part.value;
        }
    }
    return spTime;
}
