# Execução do Mini E-commerce Distribuído

Este guia descreve como executar e testar o sistema. O projeto suporta a execução via Docker (Recomendado) ou execução manual (Node.js local).

## Pré-requisitos
- Docker e Docker Compose (Recomendado)
- Node.js (v18+) caso vá executar manualmente

## Como Executar (Via Docker Compose) - Recomendado

1. Abra um terminal na raiz do projeto (onde está o arquivo `docker-compose.yml`).
2. Execute o comando:
   ```bash
   docker-compose up --build
   ```
3. O Docker iniciará 5 contêineres:
   - `gateway` (Porta 5000)
   - `users` (Porta 5001)
   - `products1` (Porta 5002) - Réplica 1
   - `products2` (Porta 5012) - Réplica 2
   - `orders` (Porta 5003)

Para parar a execução, pressione `Ctrl+C` no terminal ou rode `docker-compose down`.

## Como Executar (Manualmente sem Docker)

1. Abra **5 abas de terminal** diferentes na raiz do projeto.
2. Na aba 1 (Gateway):
   ```bash
   cd gateway
   npm install
   npm start
   ```
3. Na aba 2 (Usuários):
   ```bash
   cd users
   npm install
   npm start
   ```
4. Na aba 3 (Produtos - Réplica 1):
   ```bash
   cd products
   npm install
   # No Windows (PowerShell):
   $env:PORT="5002"; npm start
   # No Linux/Mac:
   PORT=5002 npm start
   ```
5. Na aba 4 (Produtos - Réplica 2):
   ```bash
   cd products
   # No Windows (PowerShell):
   $env:PORT="5012"; npm start
   # No Linux/Mac:
   PORT=5012 npm start
   ```
6. Na aba 5 (Pedidos):
   ```bash
   cd orders
   npm install
   npm start
   ```

## Acessando o Monitoramento (Dashboard)

Com os serviços rodando, abra seu navegador no endereço:
👉 **[http://localhost:5000/](http://localhost:5000/)**
Você verá um dashboard indicando o status ONLINE/OFFLINE de cada microsserviço. O Gateway faz um heartbeat a cada 5 segundos para atualizar essas informações.

---

## Testando a Aplicação (Exemplo com Postman/cURL)

Sempre faça as requisições para o **Gateway** na porta **5000**. O Gateway fará o roteamento para o microsserviço correto.

### 1. Criar um Administrador
```bash
curl -X POST http://localhost:5000/users/register \
-H "Content-Type: application/json" \
-d '{"name": "Admin", "email": "admin@teste.com", "password": "123", "role": "admin"}'
```

### 2. Login (Pegar JWT)
```bash
curl -X POST http://localhost:5000/users/login \
-H "Content-Type: application/json" \
-d '{"email": "admin@teste.com", "password": "123"}'
```
*Copie o `token` devolvido na resposta para os próximos passos.*

### 3. Criar Produto (Requer JWT de admin)
Para provar a **replicação**, faça esta requisição. O gateway enviará o produto simultaneamente para a réplica 1 e 2.
```bash
curl -X POST http://localhost:5000/products \
-H "Content-Type: application/json" \
-H "Authorization: Bearer SEU_TOKEN_AQUI" \
-d '{"name": "Notebook Dell", "price": 4500.00, "description": "Notebook Gamer"}'
```

### 4. Listar Produtos
Para testar a leitura balanceada (Round-Robin), execute este comando várias vezes. O Gateway intercalará as leituras entre as réplicas 5002 e 5012 silenciosamente.
```bash
curl http://localhost:5000/products
```

### 5. Fazer um Pedido
```bash
curl -X POST http://localhost:5000/orders \
-H "Content-Type: application/json" \
-H "Authorization: Bearer SEU_TOKEN_AQUI" \
-d '{"productId": "ID_DO_PRODUTO_CRIADO_NO_PASSO_3", "quantity": 2}'
```

### 6. Testar Tolerância a Falhas (Heartbeat)
1. Acesse o Dashboard em `http://localhost:5000/`
2. No terminal onde o Docker Compose está rodando (ou a aba manual do serviço), pare o contêiner `orders` (`docker stop mini-e-commerce-distribuido-orders-1` ou feche a aba correspondente).
3. Aguarde cerca de 10 a 15 segundos.
4. O Dashboard mostrará o serviço Orders como **OFFLINE**.
5. Tente listar os pedidos ou criar um pedido:
   `curl http://localhost:5000/orders`
   **Resultado esperado**: HTTP 503 Service Unavailable.
6. Suba o serviço `orders` novamente e veja o dashboard reportá-lo como ONLINE e as requisições voltarem a funcionar.
