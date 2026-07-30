# Luvit

Plataforma web estática para organização e otimização de entregas. O frontend usa HTML, CSS e JavaScript modular; autenticação e persistência remota usam Supabase; mapas e rotas usam Leaflet, OpenStreetMap, Photon, Nominatim e OSRM.

## Executar localmente

Sirva a raiz com qualquer servidor HTTP estático. Exemplo:

```bash
npx serve .
```

Abrir arquivos diretamente com `file://` não é suficiente para módulos ES, service worker ou caminhos absolutos. Sem credenciais, a tela de login exibe **Acessar modo local**; entregas, favoritos e rota ativa ficam no navegador.

## Configurar Supabase

1. Execute integralmente [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do Supabase.
2. Em projetos já existentes, execute depois [`supabase/migrations/002_luvit_professional_ui.sql`](supabase/migrations/002_luvit_professional_ui.sql).
3. Configure as URLs de autenticação conforme [`supabase/README.md`](supabase/README.md).
4. Edite [`js/config.js`](js/config.js) com a Project URL e a chave pública `anon`/`publishable`:

```js
window.LUVIT_CONFIG = {
  supabaseUrl: "https://SEU-PROJETO.supabase.co",
  supabaseAnonKey: "SUA_CHAVE_PUBLICA",
  canonicalUrl: "https://SEU-DOMINIO"
};
```

Nunca use `service_role` no navegador.

## Publicar no Cloudflare Pages

- Framework preset: `None`
- Build command: deixar vazio
- Build output directory: `/` (ou `.` quando o painel aceitar caminho relativo)
- Root directory: raiz deste repositório
- Variáveis de ambiente: nenhuma é obrigatória; a configuração pública fica em `js/config.js`

Depois do primeiro deploy, substitua `https://seu-dominio.com` em `js/config.js`, `robots.txt` e `sitemap.xml`, configure esse domínio no Supabase e faça novo deploy. Os arquivos `_headers` e `_redirects` são lidos automaticamente pelo Cloudflare Pages.

## Arquitetura

- `index.html`: landing page
- `app/index.html`: aplicação operacional
- `js/storage.js`: persistência local, cache e fila de sincronização
- `js/maps.js`: geocodificação, geolocalização e Leaflet
- `js/routes.js`: OSRM e fallback local
- `js/state/app-state.js`: fonte única de verdade da aplicação
- `js/components/icons.js`: conjunto de ícones SVG do painel
- `js/utils/format.js`: formatação operacional compartilhada
- `supabase/schema.sql`: tabelas, índices, triggers e RLS
- `backup-original/`: cópia não referenciada da versão anterior
