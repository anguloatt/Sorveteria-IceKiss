// Meu arquivo para gerenciar o estado compartilhado dos alertas de pedidos expirados.

/**
 * @type {Array<Object>}
 * Aqui eu armazeno a lista de pedidos que estão com um alerta pendente.
 * Eu preencho esta lista no login (em app.js) e a consulto em outros módulos,
 * como no pdv.js (para mostrar o modal) e no employeeReport.js (para mostrar o ícone de alerta).
 */
export const pendingAlerts = [];
