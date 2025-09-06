// Shared functions between manager.js and manager-realtime.js
// This module breaks the circular dependency

import { db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit as firestoreLimit,
    startAfter,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { dom } from './domRefs.js';
import { formatCurrency, formatDate, formatTime } from './utils.js';

// Modal for showing order details
export async function showOrderDetailModal(orderId) {
    console.log("showOrderDetailModal: Exibindo detalhes do pedido:", orderId);
    
    if (!orderId) {
        console.error("showOrderDetailModal: orderId é obrigatório.");
        return;
    }

    try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        
        if (!orderDoc.exists()) {
            alert('Pedido não encontrado!');
            return;
        }

        const orderData = { id: orderDoc.id, ...orderDoc.data() };
        
        // Create modal HTML
        const modalHTML = `
            <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" id="order-detail-modal">
                <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold">Detalhes do Pedido #${orderData.orderNumber || orderId.slice(-6)}</h2>
                        <button class="text-gray-500 hover:text-gray-700" onclick="document.getElementById('order-detail-modal').remove()">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <strong>Cliente:</strong> ${orderData.customerName || 'N/A'}
                            </div>
                            <div>
                                <strong>Telefone:</strong> ${orderData.customerPhone || 'N/A'}
                            </div>
                            <div>
                                <strong>Status:</strong> 
                                <span class="px-2 py-1 rounded text-sm ${getStatusColor(orderData.status)}">${orderData.status || 'N/A'}</span>
                            </div>
                            <div>
                                <strong>Total:</strong> ${formatCurrency(orderData.total || 0)}
                            </div>
                            <div>
                                <strong>Data:</strong> ${formatDate(orderData.createdAt)}
                            </div>
                            <div>
                                <strong>Entrega:</strong> ${orderData.delivery?.date ? formatDate(orderData.delivery.date) : 'N/A'} ${orderData.delivery?.time || ''}
                            </div>
                        </div>
                        
                        <div>
                            <strong>Endereço de Entrega:</strong>
                            <p class="text-gray-600">${orderData.delivery?.address || 'N/A'}</p>
                        </div>
                        
                        <div>
                            <strong>Itens do Pedido:</strong>
                            <div class="mt-2 border rounded">
                                <table class="w-full">
                                    <thead class="bg-gray-50">
                                        <tr>
                                            <th class="px-3 py-2 text-left">Item</th>
                                            <th class="px-3 py-2 text-center">Qtd</th>
                                            <th class="px-3 py-2 text-right">Preço Unit.</th>
                                            <th class="px-3 py-2 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${(orderData.items || []).map(item => `
                                            <tr class="border-t">
                                                <td class="px-3 py-2">${item.name}</td>
                                                <td class="px-3 py-2 text-center">${item.quantity}</td>
                                                <td class="px-3 py-2 text-right">${formatCurrency(item.price)}</td>
                                                <td class="px-3 py-2 text-right">${formatCurrency(item.quantity * item.price)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        ${orderData.notes ? `
                            <div>
                                <strong>Observações:</strong>
                                <p class="text-gray-600">${orderData.notes}</p>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="mt-6 flex justify-end">
                        <button class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" onclick="document.getElementById('order-detail-modal').remove()">
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('order-detail-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error("Erro ao carregar detalhes do pedido:", error);
        alert('Erro ao carregar detalhes do pedido!');
    }
}

// Helper function for status colors
function getStatusColor(status) {
    switch (status) {
        case 'pendente':
            return 'bg-yellow-100 text-yellow-800';
        case 'confirmado':
            return 'bg-blue-100 text-blue-800';
        case 'em_producao':
            return 'bg-orange-100 text-orange-800';
        case 'pronto':
            return 'bg-green-100 text-green-800';
        case 'entregue':
            return 'bg-gray-100 text-gray-800';
        case 'cancelado':
            return 'bg-red-100 text-red-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

// Customer analysis data population
export async function populateCustomerAnalysisData() {
    console.log("populateCustomerAnalysisData: Carregando dados de análise de clientes.");
    
    try {
        // Fetch orders from the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const ordersQuery = query(
            collection(db, 'orders'),
            where('createdAt', '>=', Timestamp.fromDate(thirtyDaysAgo)),
            orderBy('createdAt', 'desc')
        );
        
        const ordersSnapshot = await getDocs(ordersQuery);
        const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Calculate customer metrics
        const customerMetrics = calculateCustomerMetrics(orders);
        
        // Update DOM elements
        updateCustomerAnalysisDOM(customerMetrics);
        
    } catch (error) {
        console.error("Erro ao carregar dados de análise de clientes:", error);
    }
}

function calculateCustomerMetrics(orders) {
    const customerData = {};
    let totalRevenue = 0;
    let totalOrders = orders.length;
    
    // Process each order
    orders.forEach(order => {
        const phone = order.customerPhone;
        if (!phone) return;
        
        if (!customerData[phone]) {
            customerData[phone] = {
                name: order.customerName || 'Cliente Anônimo',
                phone: phone,
                orders: 0,
                totalSpent: 0,
                lastOrder: null
            };
        }
        
        customerData[phone].orders++;
        customerData[phone].totalSpent += order.total || 0;
        
        if (!customerData[phone].lastOrder || order.createdAt > customerData[phone].lastOrder) {
            customerData[phone].lastOrder = order.createdAt;
        }
        
        totalRevenue += order.total || 0;
    });
    
    // Convert to array and sort by total spent
    const customers = Object.values(customerData).sort((a, b) => b.totalSpent - a.totalSpent);
    
    // Calculate segments
    const newCustomers = customers.filter(c => c.orders === 1).length;
    const returningCustomers = customers.filter(c => c.orders > 1).length;
    const vipCustomers = customers.filter(c => c.totalSpent > 100).length; // Customers who spent more than R$ 100
    
    return {
        totalCustomers: customers.length,
        totalRevenue,
        totalOrders,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        newCustomers,
        returningCustomers,
        vipCustomers,
        topCustomers: customers.slice(0, 10) // Top 10 customers
    };
}

function updateCustomerAnalysisDOM(metrics) {
    // Update summary cards
    const totalCustomersEl = document.getElementById('total-customers');
    const totalRevenueEl = document.getElementById('total-revenue');
    const avgOrderValueEl = document.getElementById('avg-order-value');
    const returningCustomersEl = document.getElementById('returning-customers');
    
    if (totalCustomersEl) totalCustomersEl.textContent = metrics.totalCustomers;
    if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(metrics.totalRevenue);
    if (avgOrderValueEl) avgOrderValueEl.textContent = formatCurrency(metrics.averageOrderValue);
    if (returningCustomersEl) returningCustomersEl.textContent = metrics.returningCustomers;
    
    // Update top customers table
    const topCustomersTable = document.getElementById('top-customers-table');
    if (topCustomersTable) {
        const tbody = topCustomersTable.querySelector('tbody');
        if (tbody) {
            tbody.innerHTML = metrics.topCustomers.map((customer, index) => `
                <tr>
                    <td class="px-3 py-2">${index + 1}</td>
                    <td class="px-3 py-2">${customer.name}</td>
                    <td class="px-3 py-2">${customer.phone}</td>
                    <td class="px-3 py-2 text-center">${customer.orders}</td>
                    <td class="px-3 py-2 text-right">${formatCurrency(customer.totalSpent)}</td>
                    <td class="px-3 py-2">${customer.lastOrder ? formatDate(customer.lastOrder) : 'N/A'}</td>
                </tr>
            `).join('');
        }
    }
}