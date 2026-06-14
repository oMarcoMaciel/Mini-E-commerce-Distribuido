# Mini E-commerce Distribuído

**Nome:** Marco Antônio Guimarães Maciel  
**Disciplina:** Fundamentos de Computação

## Sobre o Projeto
Este é um sistema de e-commerce minimalista construído sobre uma arquitetura distribuída de microsserviços. O projeto aplica na prática conceitos cruciais de sistemas distribuídos como:
- Decomposição em Microsserviços
- Replicação de dados e tolerância a falhas (Heartbeat)
- API Gateway e Balanceamento de Carga (Round-Robin)
- Segurança via tokens JWT

## Instruções de Execução
Todas as instruções detalhadas para subir a infraestrutura (seja via Docker ou manualmente) encontram-se no arquivo dedicado:
👉 **[Ler Instruções de Execução (README_execucao.md)](./README_execucao.md)**

## Estrutura
- `/gateway`: API Gateway (Porta 5000)
- `/users`: Microsserviço de Usuários (Porta 5001)
- `/products`: Microsserviço de Produtos (Réplicas nas portas 5002 e 5012)
- `/orders`: Microsserviço de Pedidos (Porta 5003)
