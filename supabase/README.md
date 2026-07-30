# Configuração do Supabase

1. Crie um projeto no Supabase e abra **SQL Editor > New query**.
2. Cole e execute todo o conteúdo de `schema.sql` uma única vez.
3. Em **Authentication > URL Configuration**, defina a URL publicada como `Site URL` e adicione `https://SEU-DOMINIO/app/` e `https://SEU-DOMINIO/login.html` às URLs de redirecionamento.
4. Em **Project Settings > API**, copie apenas a Project URL e a chave pública `anon`/`publishable` para `/js/config.js`.

Nunca coloque a chave `service_role` no navegador. Todas as tabelas usam RLS; cada política compara os registros ao usuário autenticado.
