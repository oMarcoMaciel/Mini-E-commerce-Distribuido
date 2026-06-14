# Relatório - Atividade 1: Mini E-commerce Distribuído

**Nome:** Marco Antônio Guimarães Maciel    
**Disciplina:** Fundamentos de Computação

## 1. Comunicação entre Microsserviços
A comunicação entre os microsserviços foi implementada no padrão HTTP/REST sincrôno, trocando mensagens no formato JSON. O **API Gateway** serve como o único ponto de entrada para clientes externos, atuando como um Proxy Reverso que recebe as requisições, resolve a rota adequada e as repassa utilizando a biblioteca `axios` do Node.js. 

Para a comunicação inter-serviços (por exemplo, quando o serviço de Pedidos precisa validar se um Produto existe), o microsserviço de Pedidos faz uma chamada REST GET ao Gateway (ou diretamente ao serviço de produtos), repassando os devidos headers de autenticação JWT, a fim de obter os dados atualizados do produto antes de processar a compra.

## 2. Estratégia de Consistência na Replicação
Para o serviço de Produtos, foi adotada a estratégia de **Consistência Forte** sob a ótica do cliente, orquestrada pelo API Gateway. 

**Por que e como?**
Ao realizar uma operação de escrita (`POST /products`), o Gateway se encarrega de disparar a requisição em **broadcast** simultaneamente para as duas réplicas (nas portas 5002 e 5012) usando o `Promise.all`. O Gateway aguarda que ambas as réplicas processem o registro em seus bancos locais antes de devolver o código HTTP `201 Created` ao cliente. Isso garante que as réplicas estejam sempre sincronizadas no momento em que a confirmação é entregue ao cliente. Já as operações de leitura são feitas no modelo *Round-Robin*, onde o Gateway intercala as chamadas entre as réplicas ativas.

## 3. Comportamento do Sistema na Falha do Serviço de Pedidos
Devido à arquitetura descentralizada e ao mecanismo de *Heartbeat* do API Gateway, o sistema possui alta resiliência (Tolerância a Falhas). 

O Gateway verifica a integridade de todos os nós a cada 5 segundos através de um endpoint `/health`. Se o Serviço de Pedidos cair e falhar 2 verificações consecutivas, o Gateway o marca como *OFFLINE*. 
- **O que acontece?** Qualquer requisição para a rota `/orders` será interceptada pelo Gateway que retornará instantaneamente um erro `503 Service Unavailable`, protegendo o sistema de travamentos (timeouts demorados).
- **O restante continua funcionando?** Sim. Os microsserviços de **Usuários** e **Produtos** não dependem do serviço de pedidos e continuarão operando 100% normalmente. O cliente ainda poderá se registrar, fazer login e consultar o catálogo de produtos.

## 4. Garantia de Segurança com JWT
O JWT (JSON Web Token) garante a autorização baseada em Roles (funções). Quando um usuário faz o login, o microsserviço de Usuários valida a senha e gera um token JWT criptograficamente assinado com uma chave secreta do servidor (`JWT_SECRET`). 

O payload desse token contém a propriedade `role`, que define o privilégio (`user` ou `admin`). Como o token é assinado, um usuário comum não consegue adulterar sua própria `role` para "admin" sem invalidar a assinatura criptográfica. Quando a requisição para a criação de um produto (`POST /products`) chega ao Serviço de Produtos, um middleware de autenticação verifica e decodifica a assinatura do token. Se a assinatura for válida, mas a propriedade `role` for diferente de `admin`, o middleware bloqueia a requisição retornando o erro HTTP `403 Forbidden`.

## 5. Limitações em Relação a um Sistema Real de Produção
Esta implementação acadêmica, apesar de demonstrar os conceitos vitais, possui diversas limitações perante cenários do mundo real:
1. **Banco de Dados Simplório:** O armazenamento usando arquivos `.json` locais não tem concorrência real, escalabilidade de I/O, nem recursos de ACID (Atomicidade, Consistência, Isolamento e Durabilidade) oferecidos por um banco de dados real como PostgreSQL, MongoDB, etc.
2. **Replicação Ingênua:** A replicação feita por broadcast no Gateway não lida bem com falhas bizantinas ou quedas durante a própria escrita, o que poderia deixar os arquivos dessincronizados na prática. Em produção, usaríamos bancos replicados via Raft/Paxos, replicação em Master/Slave de banco relacional, ou ferramentas de filas (Kafka/RabbitMQ) para consistência eventual.
3. **Escalonamento Fixo:** As URLs das réplicas e serviços estão hardcoded e limitadas. Sistemas reais utilizam Service Discovery (como Consul, Eureka, ou o próprio DNS do Kubernetes) para escalar réplicas dinamicamente (dezenas delas).
4. **Sem HTTPS:** Não há comunicação com TLS habilitado por padrão, essencial em produção para não trafegar JWT em texto puro.
5. **Gateway Sobrecarregado:** A longo prazo, um único ponto de API Gateway fazendo broadcast síncrono para réplicas de escrita é um gargalo, além de acoplar lógica de replicação onde deveria haver apenas roteamento. O ideal era o banco de produtos lidar com sua replicação de forma autônoma.
