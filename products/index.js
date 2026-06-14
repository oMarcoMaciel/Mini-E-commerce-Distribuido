const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}
// Using port in filename so replicas don't overwrite each other locally
const dbPath = path.join(dataDir, `products-${PORT}.json`);

function getDB() {
    if (!fs.existsSync(dbPath)) return [];
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Admin Auth Middleware
function authAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado. Requer privilégios de admin.' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok', port: PORT });
});

app.get('/products', (req, res) => {
    const products = getDB();
    res.json(products);
});

app.get('/products/:id', (req, res) => {
    const products = getDB();
    const product = products.find(p => p.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(product);
});

// Endpoint de sincronização de dados (Recuperação de falhas)
app.post('/products/sync', (req, res) => {
    // Recebe o banco de dados completo da réplica ativa
    const incomingData = req.body;
    if (Array.isArray(incomingData)) {
        saveDB(incomingData);
        return res.json({ status: 'sincronizado', count: incomingData.length });
    }
    return res.status(400).json({ error: 'Formato inválido para sincronização' });
});

app.post('/products', authAdmin, (req, res) => {
    const { name, price, description } = req.body;
    if (!name || price == null) {
        return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }

    const products = getDB();
    const newProduct = {
        id: req.body.id || Date.now().toString(), // gateway might pass an ID to keep sync
        name,
        price,
        description
    };
    
    // Check if ID already exists (idempotency)
    const existingIndex = products.findIndex(p => p.id === newProduct.id);
    if(existingIndex >= 0) {
        products[existingIndex] = newProduct; // Update if exists
    } else {
        products.push(newProduct);
    }
    
    saveDB(products);
    res.status(201).json(newProduct);
});

app.listen(PORT, () => {
    console.log(`Product Service running on port ${PORT}`);
});
