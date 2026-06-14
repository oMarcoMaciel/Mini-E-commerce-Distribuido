const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

// Configuração dos microsserviços
const services = {
    users: { name: 'Users', url: process.env.USERS_URL || 'http://localhost:5001', online: false, failures: 0 },
    products_1: { name: 'Products 1', url: process.env.PRODUCTS_1_URL || 'http://localhost:5002', online: false, failures: 0 },
    products_2: { name: 'Products 2', url: process.env.PRODUCTS_2_URL || 'http://localhost:5012', online: false, failures: 0 },
    orders: { name: 'Orders', url: process.env.ORDERS_URL || 'http://localhost:5003', online: false, failures: 0 }
};

// ------------------------------------------------------------------
// HEARTBEAT E RECUPERAÇÃO DE FALHAS
// ------------------------------------------------------------------
const HEARTBEAT_INTERVAL = 5000; // 5 segundos
const MAX_FAILURES = 2;

// Função para sincronizar dados perdidos quando uma réplica de produtos volta a ficar online
async function syncRecoveredProductService(recoveredKey, recoveredService) {
    const otherKey = recoveredKey === 'products_1' ? 'products_2' : 'products_1';
    const otherService = services[otherKey];
    
    // Só podemos sincronizar se a outra réplica estiver online
    if (otherService && otherService.online) {
        console.log(`[SYNC] Iniciando sincronização de dados de ${otherService.name} para ${recoveredService.name}...`);
        try {
            // Puxa todos os produtos da ativa
            const resData = await axios.get(`${otherService.url}/products`);
            const allProducts = resData.data;
            
            // Sobrescreve/Atualiza a recuperada
            await axios.post(`${recoveredService.url}/products/sync`, allProducts);
            console.log(`[SYNC] Sincronização concluída com sucesso. Recuperação total atingida.`);
        } catch (err) {
            console.error(`[SYNC] Falha ao sincronizar dados perdidos:`, err.message);
        }
    }
}

async function checkHealth() {
    for (const key in services) {
        const service = services[key];
        try {
            await axios.get(`${service.url}/health`, { timeout: 2000 });
            if (!service.online) {
                console.log(`[HEARTBEAT] Serviço ${service.name} (${service.url}) RECUPERADO e está ONLINE.`);
                service.online = true;
                service.failures = 0;

                // Se for um serviço de produtos voltando, faz a sincronização de dados perdidos
                if (key.startsWith('products_')) {
                    syncRecoveredProductService(key, service);
                }
            }
        } catch (error) {
            service.failures += 1;
            if (service.online && service.failures >= MAX_FAILURES) {
                console.log(`[HEARTBEAT] FALHA DETECTADA: Serviço ${service.name} (${service.url}) está OFFLINE!`);
                service.online = false;
            }
        }
    }
}

// Inicia o heartbeat logo no boot e define o intervalo
checkHealth();
setInterval(checkHealth, HEARTBEAT_INTERVAL);

// ------------------------------------------------------------------
// MIDDLEWARE PARA REPASSE (PROXY SIMPLES)
// ------------------------------------------------------------------
async function proxyRequest(req, res, targetUrl) {
    try {
        const response = await axios({
            method: req.method,
            url: `${targetUrl}${req.path}`,
            data: req.body,
            headers: {
                ...req.headers,
                host: undefined // remove host original para evitar conflitos
            },
            validateStatus: () => true // Permite retornar qualquer status HTTP do microsserviço
        });
        
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error(`Erro ao comunicar com ${targetUrl}:`, error.message);
        res.status(503).json({ error: 'Service Unavailable' });
    }
}

// ------------------------------------------------------------------
// ROTAS DO GATEWAY
// ------------------------------------------------------------------

// Dashboard de Monitoramento HTML
app.get('/', (req, res) => {
    let html = `
    <html>
        <head>
            <title>Gateway Dashboard</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background-color: #f4f4f9;}
                h1 { color: #333; }
                .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
                .status-online { color: green; font-weight: bold; }
                .status-offline { color: red; font-weight: bold; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #f8f9fa; }
            </style>
            <!-- Auto-refresh a cada 5 segundos -->
            <meta http-equiv="refresh" content="5">
        </head>
        <body>
            <h1>API Gateway - Monitoramento</h1>
            <div class="card">
                <table>
                    <tr><th>Serviço</th><th>URL</th><th>Status</th></tr>`;
    
    for (const key in services) {
        const s = services[key];
        const statusClass = s.online ? 'status-online' : 'status-offline';
        const statusText = s.online ? 'ONLINE' : 'OFFLINE';
        html += `<tr>
            <td>${s.name}</td>
            <td>${s.url}</td>
            <td class="${statusClass}">${statusText}</td>
        </tr>`;
    }

    html += `
                </table>
            </div>
            <p>Atualizado automaticamente a cada 5 segundos.</p>
        </body>
    </html>`;
    
    res.send(html);
});

// USERS
app.use('/users', (req, res) => {
    if (!services.users.online) {
        return res.status(503).json({ error: '503 Service Unavailable - Serviço de Usuários Indisponível' });
    }
    proxyRequest(req, res, services.users.url);
});

// ORDERS
app.use('/orders', (req, res) => {
    if (!services.orders.online) {
        return res.status(503).json({ error: '503 Service Unavailable - Serviço de Pedidos Indisponível' });
    }
    proxyRequest(req, res, services.orders.url);
});

// PRODUCTS (Replicação e Round-Robin)
let currentProductReplica = 1;

app.use('/products', async (req, res) => {
    const p1 = services.products_1;
    const p2 = services.products_2;

    const availableReplicas = [];
    if (p1.online) availableReplicas.push(p1);
    if (p2.online) availableReplicas.push(p2);

    if (availableReplicas.length === 0) {
        return res.status(503).json({ error: '503 Service Unavailable - Serviço de Produtos Indisponível' });
    }

    // Para ESCRITA (POST), replicamos para ambas se estiverem online
    if (req.method === 'POST') {
        try {
            // Verifica o token na entrada para validar o admin antes de fazer dois POSTs
            // Mas para simplificar, apenas enviaremos e esperaremos as respostas
            
            // Garantir que ambas as réplicas que estão online recebam
            const promises = availableReplicas.map(target => {
                return axios({
                    method: 'POST',
                    url: `${target.url}${req.path}`,
                    data: req.body,
                    headers: { ...req.headers, host: undefined },
                    validateStatus: () => true
                });
            });

            const responses = await Promise.all(promises);
            
            // Retorna o status da primeira réplica (espera-se que sejam consistentes)
            const mainResponse = responses[0];
            return res.status(mainResponse.status).json(mainResponse.data);

        } catch (error) {
            console.error('Erro na replicação de escrita:', error.message);
            return res.status(500).json({ error: 'Erro ao persistir nas réplicas de produtos' });
        }
    }

    // Para LEITURA (GET), fazemos Round-Robin simples
    if (req.method === 'GET') {
        let targetReplica;
        if (availableReplicas.length === 1) {
            targetReplica = availableReplicas[0];
        } else {
            // Round-robin entre as duas
            targetReplica = currentProductReplica === 1 ? p1 : p2;
            currentProductReplica = currentProductReplica === 1 ? 2 : 1;
        }

        return proxyRequest(req, res, targetReplica.url);
    }

    // Outros métodos (PUT, DELETE não exigidos, mas se caírem aqui vão na primeira)
    return proxyRequest(req, res, availableReplicas[0].url);
});

app.listen(PORT, () => {
    console.log(`API Gateway running on port ${PORT}`);
});
