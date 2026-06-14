const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5003;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:5000';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}
const dbPath = path.join(dataDir, 'orders.json');

function getDB() {
    if (!fs.existsSync(dbPath)) return [];
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Auth Middleware
function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/orders', auth, async (req, res) => {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) {
        return res.status(400).json({ error: 'productId e quantity são obrigatórios' });
    }

    try {
        // Valida se o produto existe consultando o Gateway
        // Importante passar o token, caso as rotas fiquem restritas futuramente
        const productResponse = await axios.get(`${GATEWAY_URL}/products/${productId}`, {
            headers: { Authorization: req.headers.authorization }
        });

        const product = productResponse.data;
        
        const orders = getDB();
        const newOrder = {
            id: Date.now().toString(),
            userId: req.user.userId,
            productId: product.id,
            productName: product.name,
            quantity: quantity,
            totalPrice: product.price * quantity,
            date: new Date().toISOString()
        };

        orders.push(newOrder);
        saveDB(orders);

        res.status(201).json(newOrder);
    } catch (err) {
        console.error("Erro ao validar produto:", err.message);
        if (err.response && err.response.status === 404) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        return res.status(500).json({ error: 'Erro ao processar o pedido. Produto pode estar indisponível.' });
    }
});

app.get('/orders/:userId', auth, (req, res) => {
    const { userId } = req.params;
    
    // Opcional: garantir que o usuário só pode ver seus próprios pedidos, a menos que seja admin
    if (req.user.role !== 'admin' && req.user.userId !== userId) {
        return res.status(403).json({ error: 'Você só pode ver seus próprios pedidos' });
    }

    const orders = getDB();
    const userOrders = orders.filter(o => o.userId === userId);
    
    res.json(userOrders);
});

app.listen(PORT, () => {
    console.log(`Orders Service running on port ${PORT}`);
});
