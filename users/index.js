const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}
const dbPath = path.join(dataDir, 'users.json');

// Helper to read/write DB
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

app.post('/users/register', (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    const users = getDB();
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const newUser = {
        id: Date.now().toString(),
        name,
        email,
        password: hash,
        role: role || 'user'
    };

    users.push(newUser);
    saveDB(users);

    res.status(201).json({ id: newUser.id, name, email, role: newUser.role });
});

app.post('/users/login', (req, res) => {
    const { email, password } = req.body;
    const users = getDB();
    
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/users/:id', auth, (req, res) => {
    const users = getDB();
    const user = users.find(u => u.id === req.params.id);
    
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

app.listen(PORT, () => {
    console.log(`User Service running on port ${PORT}`);
});
