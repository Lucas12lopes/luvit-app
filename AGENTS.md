# Projeto

- Nome: Luvit
- Aplicação web para planejamento e otimização de rotas.
- Frontend estático em HTML, CSS e JavaScript ES Modules.
- Supabase para autenticação e banco.
- Leaflet/OpenStreetMap para mapas.
- OSRM para rotas.
- Cloudflare Pages para deploy.
- O projeto não possui build step atualmente.

# Princípios de trabalho

- Antes de implementar qualquer mudança, analisar o código relacionado.
- Fazer alterações pequenas e de escopo limitado.
- Não refatorar código fora do escopo solicitado.
- Não introduzir frameworks ou dependências sem necessidade comprovada.
- Preservar a arquitetura existente quando possível.
- Não transformar o projeto em React, Next.js, Node ou outro framework sem solicitação explícita.

# Git

- Nunca trabalhar diretamente na main para alterações de código.
- Nunca executar git push sem autorização explícita.
- Nunca fazer merge sem autorização explícita.
- Nunca fazer rebase ou force push automaticamente.
- Nunca apagar branches automaticamente.
- Antes de alterar código, verificar git status e branch atual.
- Após alterações, apresentar git diff e arquivos modificados.

# Produção e infraestrutura

- Nunca executar deploy automaticamente.
- Nunca modificar configuração do Cloudflare sem autorização explícita.
- Nunca executar migrations automaticamente.
- Nunca modificar schema ou dados do Supabase remoto sem autorização explícita.
- Nunca executar comandos destrutivos em banco.
- Nunca alterar serviços externos sem autorização explícita.

# Segurança

- Nunca expor secrets, tokens, senhas ou service_role keys.
- Supabase publishable/anon key pode existir no frontend por design, mas nunca substituir por service_role.
- Não imprimir credenciais em logs.
- Antes de modificar autenticação, RLS ou políticas do Supabase, analisar o impacto de segurança.
- Qualquer alteração em RLS deve ser tratada como mudança crítica.

# Processo de implementação

Para cada tarefa:

1. Entender a solicitação.
2. Inspecionar os arquivos relacionados.
3. Explicar brevemente o plano.
4. Alterar somente o necessário.
5. Validar a alteração.
6. Informar os arquivos modificados.
7. Apresentar possíveis riscos ou pendências.
8. Não fazer commit automaticamente, salvo quando solicitado.

# Qualidade

- Priorizar correções funcionais antes de grandes refatorações.
- Evitar duplicação de lógica.
- Preservar compatibilidade mobile.
- Preservar funcionamento como PWA.
- Considerar comportamento offline.
- Considerar usuários autenticados e modo local quando aplicável.
- Não adicionar ferramentas de lint, testes ou build apenas por conveniência sem primeiro justificar a necessidade.

# Auditorias

- Não considerar automaticamente toda descoberta de auditoria como um bug confirmado.
- Validar cada hipótese no código antes de corrigir.
- Distinguir entre bug confirmado, risco potencial, dívida técnica e sugestão de arquitetura.
- Não implementar recomendações apenas porque apareceram em uma auditoria.
