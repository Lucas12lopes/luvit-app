document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('enderecoInput');
    const lista = document.getElementById('listaEntregas');
    const listaFavs = document.getElementById('listaFavoritos');
    const sugestoesBox = document.getElementById('sugestoes');
    const btnOtimizar = document.getElementById('btnOtimizar');
    const modalOverlay = document.getElementById('modalOverlay');

    let locAtual = { lat: -25.534, lon: -49.184 }; 
    let entregas = [];
    let favoritos = JSON.parse(localStorage.getItem('luvit_favoritos')) || [];
    let mapa = null;
    let delay;

    // --- AUTOCOMPLETE COM NÚMERO ---
    input.addEventListener('input', () => {
        clearTimeout(delay);
        if (input.value.length < 3) return sugestoesBox.style.display = 'none';
        delay = setTimeout(async () => {
            try {
                const bbox = "-49.40,-25.65,-49.00,-25.35"; 
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(input.value)}&limit=10&lat=${locAtual.lat}&lon=${locAtual.lon}&location_bias_scale=15&bbox=${bbox}`;
                const r = await fetch(url);
                const d = await r.json();
                sugestoesBox.innerHTML = d.features.map(f => {
                    const p = f.properties;
                    const rua = p.name || p.street || "Rua";
                    const num = p.housenumber ? `, ${p.housenumber}` : ""; 
                    const bairro = p.district || p.suburb || "SJP";
                    const completa = `${rua}${num} - ${bairro}`;
                    return `<div class="sugestao-item" onclick="window.selecionarSugestao('${completa.replace(/'/g, "\\")}')">
                        <strong style="color:#FF5C00">📍 ${rua}${num}</strong><br><small style="color:#888">${bairro}</small>
                    </div>`;
                }).join('');
                sugestoesBox.style.display = 'block';
            } catch(e) { console.error(e); }
        }, 400);
    });

    window.selecionarSugestao = (t) => { input.value = t; sugestoesBox.style.display = 'none'; addEntrega(); };

    function addEntrega() {
        const v = input.value.trim();
        if (v && !entregas.includes(v)) {
            entregas.push(v);
            input.value = '';
            renderListas();
        }
    }

    // --- FAVORITOS (CORRIGIDO) ---
    window.toggleFav = (e) => {
        const i = favoritos.indexOf(e);
        if (i > -1) favoritos.splice(i, 1); else favoritos.push(e);
        localStorage.setItem('luvit_favoritos', JSON.stringify(favoritos));
        renderListas();
    };

    window.usarFavorito = (e) => {
        if (!entregas.includes(e)) {
            entregas.push(e);
            renderListas();
            // Switch para aba de entregas para dar feedback visual
            document.querySelector('[data-aba="entregas"]').click();
        }
    };

    function renderListas() {
        lista.innerHTML = entregas.map((e, i) => `
            <li class="item-entrega">
                <button onclick="toggleFav('${e.replace(/'/g, "\\")}')" class="btn-estrela">${favoritos.includes(e) ? '⭐' : '☆'}</button>
                <span class="item-texto">${e}</span>
                <button onclick="entregas.splice(${i},1);renderListas();" class="btn-remover">✕</button>
            </li>`).join('') || '<p style="text-align:center;padding:20px;color:#444;">Lista vazia</p>';
        
        listaFavs.innerHTML = favoritos.map(f => `
            <li class="item-entrega">
                <span class="item-texto">${f}</span>
                <button onclick="window.usarFavorito('${f.replace(/'/g, "\\")}')" style="background:#FF5C00; border:none; color:#fff; padding:10px; border-radius:8px; font-weight:bold;">USAR</button>
            </li>`).join('') || '<p style="text-align:center;padding:20px;color:#444;">Sem favoritos</p>';
        document.getElementById('contador').textContent = `${entregas.length} entregas`;
    }

    // --- ROTA REAL (OSRM) E MAPA ---
    async function iniciarNavegacao(rota) {
        let atual = 0;
        modalOverlay.classList.add('ativa');

        const carregarPasso = async () => {
            const p = rota[atual];
            document.getElementById('mapContainer').innerHTML = '<div id="map" style="height:350px;"></div>';
            if (mapa) mapa.remove();
            mapa = L.map('map', {zoomControl:false, attributionControl:false});
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(mapa);

            // BUSCA O TRAJETO REAL POR RUAS (API OSRM)
            const pts = rota.map(r => `${r.lon},${r.lat}`).join(';');
            try {
                const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${locAtual.lon},${locAtual.lat};${pts}?overview=full&geometries=geojson`);
                const data = await res.json();
                if(data.routes && data.routes[0]) {
                    const realCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                    const poly = L.polyline(realCoords, {color: '#FF5C00', weight: 5, opacity: 0.8}).addTo(mapa);
                    mapa.fitBounds(poly.getBounds(), {padding: [40, 40]});
                    const dist = (data.routes[0].distance / 1000).toFixed(1);
                    document.getElementById('infoRota').textContent = `⚡ Trajeto Real: ${dist} km total`;
                }
            } catch(e) { console.error("Erro no trajeto real, usando linha direta."); }

            // Marcadores
            rota.forEach((r, idx) => {
                L.circleMarker([r.lat, r.lon], {radius: idx===atual?10:5, color: idx===atual?'#fff':'#FF5C00', fillColor:'#FF5C00', fillOpacity:1}).addTo(mapa);
            });

            document.getElementById('controleNavegacao').innerHTML = `
                <div style="padding:15px; text-align:center;">
                    <p style="color:#FF5C00; font-size:11px; font-weight:bold;">PARADA ${atual+1} DE ${rota.length}</p>
                    <h2 style="font-size:18px; margin:10px 0;">${p.endereco}</h2>
                </div>
                <button id="btnConcluir">✅ CONCLUIR E PRÓXIMA</button>`;

            document.getElementById('modalBtns').innerHTML = `
                <button class="btn-nav waze" onclick="window.open('https://waze.com/ul?q=${encodeURIComponent(p.endereco)}&navigate=yes')">WAZE</button>
                <button class="btn-nav maps" onclick="window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}')">MAPS</button>`;

            document.getElementById('btnConcluir').onclick = () => {
                entregas = entregas.filter(e => e !== p.endereco);
                renderListas();
                atual++;
                if (atual < rota.length) carregarPasso();
                else { alert("Fim da jornada!"); modalOverlay.classList.remove('ativa'); }
            };
        };
        carregarPasso();
    }

    btnOtimizar.onclick = async () => {
        if (entregas.length === 0) return;
        btnOtimizar.textContent = "⌛...";
        const pontos = await Promise.all(entregas.map(async e => {
            const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(e)}&format=json&limit=1`);
            const d = await r.json();
            return d[0] ? { lat: d[0].lat, lon: d[0].lon, endereco: e } : null;
        }));
        const validos = pontos.filter(p => p);
        // Otimização simples (Vizinho mais próximo)
        let rota = [], ref = locAtual, copia = [...validos];
        while(copia.length > 0) {
            copia.sort((a,b) => Math.hypot(a.lat-ref.lat, a.lon-ref.lon) - Math.hypot(b.lat-ref.lat, b.lon-ref.lon));
            let p = copia.shift(); rota.push(p); ref = p;
        }
        btnOtimizar.textContent = "⚡ Otimizar Rota";
        iniciarNavegacao(rota);
    };

    document.getElementById('btnAdicionar').onclick = addEntrega;
    document.getElementById('btnFecharModal').onclick = () => modalOverlay.classList.remove('ativa');
    document.getElementById('btnCancelarModal').onclick = () => modalOverlay.classList.remove('ativa');
    document.getElementById('btnLimpar').onclick = () => { entregas = []; renderListas(); };
    
    document.querySelectorAll('.aba').forEach(b => {
        b.onclick = () => {
            document.querySelectorAll('.aba, .aba-content').forEach(el => el.classList.remove('ativa'));
            b.classList.add('ativa');
            document.getElementById(`aba-${b.dataset.aba}`).classList.add('ativa');
        }
    });

    navigator.geolocation.getCurrentPosition(p => { locAtual = { lat: p.coords.latitude, lon: p.coords.longitude }; });
    renderListas();
});