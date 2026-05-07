/* =====================================================
   LUVIT — app.js
   Geocodificação: Nominatim (OpenStreetMap)
   Mapa: Leaflet.js + OpenStreetMap
   100% gratuito, sem API key
   ===================================================== */

const input        = document.getElementById('enderecoInput')
const btnAdicionar = document.getElementById('btnAdicionar')
const lista        = document.getElementById('listaEntregas')
const contador     = document.getElementById('contador')
const btnLimpar    = document.getElementById('btnLimpar')
const btnOtimizar  = document.getElementById('btnOtimizar')
const modalOverlay = document.getElementById('modalOverlay')
const listaOrdenada= document.getElementById('listaOrdenada')
const btnFecharModal  = document.getElementById('btnFecharModal')
const btnCancelarModal= document.getElementById('btnCancelarModal')
const modalBtns    = document.getElementById('modalBtns')
const sugestoesBox = document.getElementById('sugestoes')

let rotaOrdenada = []
let modoAtivo    = false
let paradaAtual  = 0
let appNavegador = null
let mapaLeaflet  = null

// Cidade detectada automaticamente pelo GPS
let CIDADE = ''
let cidadeDetectada = false

/* =====================================================
   DETECÇÃO AUTOMÁTICA DE CIDADE VIA GPS
   ===================================================== */
async function detectarCidade() {
  const labelCidade = document.getElementById('labelCidade')

  // Cache do dia — evita gastar req toda vez
  const cache = localStorage.getItem('luvit-cidade-cache')
  if (cache) {
    const { cidade, data } = JSON.parse(cache)
    const hoje = new Date().toLocaleDateString('pt-BR')
    if (data === hoje) {
      CIDADE = cidade
      cidadeDetectada = true
      if (labelCidade) labelCidade.textContent = '📍 ' + cidade.split(',')[0]
      return
    }
  }

  if (!navigator.geolocation) {
    if (labelCidade) labelCidade.textContent = '⚠️ GPS indisponível'
    return
  }

  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
    )
    const { latitude: lat, longitude: lon } = pos.coords

    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    )
    const data = await resp.json()
    const a = data.address || {}

    const municipio = a.city || a.town || a.village || a.county || ''
    const estado = a.state || ''
    CIDADE = [municipio, estado, 'Brasil'].filter(Boolean).join(', ')
    cidadeDetectada = true

    localStorage.setItem('luvit-cidade-cache', JSON.stringify({
      cidade: CIDADE,
      data: new Date().toLocaleDateString('pt-BR')
    }))

    if (labelCidade) labelCidade.textContent = '📍 ' + municipio
  } catch (e) {
    if (labelCidade) labelCidade.textContent = '⚠️ Localização não detectada'
    console.warn('Cidade não detectada:', e)
  }
}

function getCidade() {
  return CIDADE || 'Brasil'
}

/* =====================================================
   ABAS
   ===================================================== */
document.querySelectorAll('.aba').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach(b => b.classList.remove('ativa'))
    document.querySelectorAll('.aba-content').forEach(s => s.classList.remove('ativa'))
    btn.classList.add('ativa')
    document.getElementById('aba-' + btn.dataset.aba).classList.add('ativa')
  })
})

/* =====================================================
   FAVORITOS
   ===================================================== */
function getFavoritos() {
  return JSON.parse(localStorage.getItem('luvit-favoritos') || '[]')
}
function salvarFavoritos(favs) {
  localStorage.setItem('luvit-favoritos', JSON.stringify(favs))
}
function isFavorito(end) { return getFavoritos().includes(end) }
function toggleFavorito(end) {
  let favs = getFavoritos()
  favs = favs.includes(end) ? favs.filter(f => f !== end) : [end, ...favs].slice(0, 30)
  salvarFavoritos(favs)
}

function renderFavoritos() {
  const favs = getFavoritos()
  const container = document.getElementById('favoritosLista')
  const vazio = document.getElementById('favoritosVazio')
  vazio.style.display = favs.length ? 'none' : 'block'
  container.innerHTML = ''
  favs.forEach(f => {
    const div = document.createElement('div')
    div.className = 'fav-item'
    div.innerHTML = `
      <div class="fav-nome">★ <span>${f}</span></div>
      <button class="fav-add">+ Adicionar</button>
      <button class="fav-del" title="Remover favorito">✕</button>
    `
    div.querySelector('.fav-add').addEventListener('click', () => {
      input.value = f
      adicionarEndereco()
      // muda pra aba entregas
      document.querySelector('[data-aba="entregas"]').click()
    })
    div.querySelector('.fav-del').addEventListener('click', () => {
      toggleFavorito(f)
      renderFavoritos()
      renderListaComFavoritos()
    })
    container.appendChild(div)
  })
}

/* =====================================================
   HISTÓRICO — só data + quantidade
   ===================================================== */
function getHistorico() {
  return JSON.parse(localStorage.getItem('luvit-historico') || '[]')
}
function registrarHistorico(quantidade) {
  if (!quantidade) return
  const hist = getHistorico()
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  hist.unshift({ data: hoje, hora, quantidade })
  if (hist.length > 60) hist.pop()
  localStorage.setItem('luvit-historico', JSON.stringify(hist))
}

function renderHistorico() {
  const hist = getHistorico()
  const container = document.getElementById('historicoLista')
  const vazio = document.getElementById('historicoVazio')
  vazio.style.display = hist.length ? 'none' : 'block'
  container.innerHTML = ''
  hist.forEach(h => {
    const div = document.createElement('div')
    div.className = 'hist-item'
    div.innerHTML = `
      <span class="hist-data">📅 ${h.data} às ${h.hora}</span>
      <span class="hist-qtd">${h.quantidade} entrega${h.quantidade !== 1 ? 's' : ''}</span>
    `
    container.appendChild(div)
  })
}

/* =====================================================
   GEOCODIFICAÇÃO — Nominatim
   ===================================================== */
function normalizarEndereco(e) {
  return e.toLowerCase()
    .replace(/r\./g, 'rua').replace(/av\./g, 'avenida')
    .replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
}
function salvarCacheGeo(end, lat, lon) {
  localStorage.setItem('geo_' + end, JSON.stringify({ lat, lon }))
}
function buscarCacheGeo(end) {
  const d = localStorage.getItem('geo_' + end)
  return d ? JSON.parse(d) : null
}

async function geocodificarEndereco(endereco) {
  const cache = buscarCacheGeo(endereco)
  if (cache) return { endereco, lat: cache.lat, lon: cache.lon }

  const base = normalizarEndereco(endereco)
  const semNum = base.replace(/\d+/g, '').trim()
  const tentativas = [
    `${base}, ${getCidade()}`,
    `${semNum}, ${getCidade()}`,
    `${base}, Paraná, Brasil`,
  ]

  for (const t of tentativas) {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(t)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      const data = await resp.json()
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat)
        const lon = parseFloat(data[0].lon)
        salvarCacheGeo(endereco, lat, lon)
        return { endereco, lat, lon }
      }
    } catch (e) { console.warn('Geo falhou:', t) }
  }
  return null
}

/* =====================================================
   AUTOCOMPLETE — debounce 600ms, respeita 1req/s
   ===================================================== */
let debounceTimer = null
let ultimaReq = 0

input.addEventListener('input', () => {
  clearTimeout(debounceTimer)
  const val = input.value.trim()
  if (val.length < 4) { fecharSugestoes(); return }

  debounceTimer = setTimeout(async () => {
    const agora = Date.now()
    if (agora - ultimaReq < 1100) return
    ultimaReq = agora
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val + ', ' + getCidade())}&format=json&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      const data = await resp.json()
      sugestoesBox.innerHTML = ''
      if (!data.length) { fecharSugestoes(); return }
      data.forEach(item => {
        const a = item.address || {}
        const partes = [a.road || a.pedestrian || '', a.house_number || '', a.suburb || a.neighbourhood || ''].filter(Boolean)
        const label = partes.length ? partes.join(', ') : item.display_name.split(',').slice(0, 2).join(',').trim()
        const div = document.createElement('div')
        div.className = 'sugestao-item'
        div.textContent = label
        div.addEventListener('mousedown', () => {
          input.value = label
          fecharSugestoes()
          input.focus()
        })
        sugestoesBox.appendChild(div)
      })
      sugestoesBox.style.display = 'block'
    } catch (e) { fecharSugestoes() }
  }, 600)
})

function fecharSugestoes() {
  sugestoesBox.innerHTML = ''
  sugestoesBox.style.display = 'none'
}
document.addEventListener('click', e => {
  if (!e.target.closest('.input-wrapper')) fecharSugestoes()
})

/* =====================================================
   DISTÂNCIA + ORDENAÇÃO
   ===================================================== */
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = v => v * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function ordenarPorDistancia(pontos, origem) {
  const rest = [...pontos], ord = []
  let atual = origem
  while (rest.length > 0) {
    let menor = Infinity, idx = 0
    rest.forEach((p, i) => {
      const d = calcularDistancia(atual.lat, atual.lon, p.lat, p.lon)
      if (d < menor) { menor = d; idx = i }
    })
    const prox = rest.splice(idx, 1)[0]
    ord.push(prox); atual = prox
  }
  return ord
}

/* =====================================================
   LOCALIZAÇÃO
   ===================================================== */
async function obterLocalizacao() {
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      )
      return { lat: pos.coords.latitude, lon: pos.coords.longitude }
    } catch {}
  }
  return { lat: -25.53, lon: -49.2 } // fallback SJP
}

/* =====================================================
   MAPA LEAFLET
   ===================================================== */
function iniciarMapa(pontos, origem) {
  const container = document.getElementById('mapContainer')
  container.innerHTML = '<div class="leaflet-map" id="leafletMap"></div>'

  if (mapaLeaflet) { mapaLeaflet.remove(); mapaLeaflet = null }

  mapaLeaflet = L.map('leafletMap', { zoomControl: true, attributionControl: false })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(mapaLeaflet)

  const bounds = []

  // Pin de origem (localização atual)
  const iconOrigem = L.divIcon({
    html: '<div style="background:#333;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #555">📍</div>',
    className: '', iconAnchor: [14, 14]
  })
  L.marker([origem.lat, origem.lon], { icon: iconOrigem })
    .addTo(mapaLeaflet)
    .bindPopup('Você está aqui')
  bounds.push([origem.lat, origem.lon])

  // Linha da rota
  const latlngs = [[origem.lat, origem.lon], ...pontos.map(p => [p.lat, p.lon])]
  L.polyline(latlngs, { color: '#FF5C00', weight: 3, opacity: 0.8, dashArray: '8 6' }).addTo(mapaLeaflet)

  // Pins numerados
  pontos.forEach((p, i) => {
    const iconPin = L.divIcon({
      html: `<div style="background:#FF5C00;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)">${i + 1}</div>`,
      className: '', iconAnchor: [14, 14]
    })
    L.marker([p.lat, p.lon], { icon: iconPin })
      .addTo(mapaLeaflet)
      .bindPopup(`<b>${i + 1}.</b> ${p.endereco}`)
    bounds.push([p.lat, p.lon])
  })

  mapaLeaflet.fitBounds(bounds, { padding: [24, 24] })
}

/* =====================================================
   MODAL — ROTA OTIMIZADA
   ===================================================== */
async function ativarOtimizarRota() {
  const itens = lista.querySelectorAll('.item-entrega:not(.concluido)')
  if (itens.length === 0) return alert('Adicione pelo menos um endereço!')

  btnOtimizar.textContent = '⏳ Calculando...'
  btnOtimizar.disabled = true
  modalOverlay.classList.add('ativo')
  listaOrdenada.innerHTML = '<p style="color:#555;text-align:center;padding:20px 0">🔍 Buscando endereços...</p>'
  document.getElementById('mapContainer').innerHTML = ''
  modalBtns.innerHTML = ''

  const enderecos = [...itens].map(i => i.querySelector('.item-texto').textContent)
  const origem = await obterLocalizacao()
  const coords = await Promise.all(enderecos.map(geocodificarEndereco))

  const validos = coords.filter(Boolean)
  const falhos  = enderecos.filter((_, i) => !coords[i])

  btnOtimizar.textContent = '🗺 Otimizar Rota'
  btnOtimizar.disabled = false

  if (validos.length === 0) {
    listaOrdenada.innerHTML = '<p style="color:#ff4444;text-align:center;padding:20px">❌ Nenhum endereço encontrado. Tente incluir rua + número.</p>'
    return
  }

  rotaOrdenada = ordenarPorDistancia(validos, origem)
  paradaAtual = 0
  modoAtivo = false

  registrarHistorico(rotaOrdenada.length)
  renderHistorico()
  renderModalRota(falhos, origem)
}

function renderModalRota(falhos = [], origem = null) {
  listaOrdenada.innerHTML = ''

  if (falhos.length) {
    const av = document.createElement('p')
    av.style.cssText = 'color:#FF5C00;font-size:12px;background:#1a0d00;padding:8px 12px;border-radius:8px;margin-bottom:10px'
    av.textContent = '⚠️ Não encontrado: ' + falhos.join(', ')
    listaOrdenada.appendChild(av)
  }

  rotaOrdenada.forEach((p, i) => {
    const div = document.createElement('div')
    div.className = 'modal-item' +
      (modoAtivo && i < paradaAtual ? ' parada-concluida' : '') +
      (modoAtivo && i === paradaAtual ? ' parada-atual' : '')
    div.innerHTML = `
      <div class="numero">${modoAtivo && i < paradaAtual ? '✓' : i + 1}</div>
      <span>${p.endereco}</span>
      ${modoAtivo && i === paradaAtual ? '<span class="badge-atual">agora</span>' : ''}
    `
    listaOrdenada.appendChild(div)
  })

  // Mapa
  if (origem) iniciarMapa(rotaOrdenada, origem)

  // Botões
  modalBtns.innerHTML = ''
  if (!modoAtivo) {
    const bw = document.createElement('button')
    bw.className = 'btn-iniciar-waze'
    bw.textContent = '🗺 Iniciar no Waze'
    bw.addEventListener('click', () => iniciarRota('waze'))

    const bm = document.createElement('button')
    bm.className = 'btn-iniciar-maps'
    bm.textContent = '📍 Google Maps'
    bm.addEventListener('click', () => iniciarRota('maps'))

    modalBtns.appendChild(bw)
    modalBtns.appendChild(bm)
  } else {
    const temProx = paradaAtual < rotaOrdenada.length - 1
    const bp = document.createElement('button')
    bp.className = 'btn-proxima-parada'
    bp.disabled = !temProx
    bp.textContent = temProx
      ? `▶ Próxima parada (${paradaAtual + 2}/${rotaOrdenada.length})`
      : '🎉 Última parada!'
    if (temProx) bp.addEventListener('click', avancarParada)
    modalBtns.appendChild(bp)
  }

  // Texto do botão cancelar
  btnCancelarModal.textContent = modoAtivo
    ? `Encerrar rota (${paradaAtual}/${rotaOrdenada.length} concluídas)`
    : 'Cancelar'
}

function iniciarRota(nav) {
  appNavegador = nav
  modoAtivo = true
  paradaAtual = 0
  abrirNavegador(0)
  renderModalRota([], null)
}

function abrirNavegador(idx) {
  const p = rotaOrdenada[idx]
  if (!p) return
  const enc = encodeURIComponent(p.endereco + ', ' + getCidade())
  if (appNavegador === 'waze') {
    window.open(`https://waze.com/ul?q=${enc}&navigate=yes`)
  } else {
    const rest = rotaOrdenada.slice(idx)
    if (rest.length === 1) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${enc}&travelmode=driving`)
    } else {
      const wp = rest.slice(1, -1).map(x => encodeURIComponent(x.endereco + ', ' + getCidade())).join('|')
      const dest = encodeURIComponent(rest[rest.length - 1].endereco + ', ' + getCidade())
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${enc}&destination=${dest}${wp ? '&waypoints=' + wp : ''}&travelmode=driving`)
    }
  }
  marcarNaLista(idx)
}

function avancarParada() {
  concluirNaLista(paradaAtual)
  paradaAtual++
  if (paradaAtual >= rotaOrdenada.length) { encerrarRota(); return }
  abrirNavegador(paradaAtual)
  renderModalRota([], null)
}

function marcarNaLista(idx) {
  const end = rotaOrdenada[idx].endereco
  lista.querySelectorAll('.item-entrega').forEach(item => {
    if (item.querySelector('.item-texto').textContent === end)
      item.style.borderColor = '#FF5C00'
  })
}

function concluirNaLista(idx) {
  const end = rotaOrdenada[idx].endereco
  lista.querySelectorAll('.item-entrega').forEach(item => {
    if (item.querySelector('.item-texto').textContent === end) {
      item.classList.add('concluido')
      item.style.borderColor = ''
      const btn = item.querySelector('.btn-concluido')
      if (btn) btn.disabled = true
    }
  })
  salvarLista()
  atualizarContador()
}

function encerrarRota() {
  concluirNaLista(rotaOrdenada.length - 1)
  modoAtivo = false; rotaOrdenada = []; paradaAtual = 0
  fecharModal()
  setTimeout(() => alert('🎉 Rota concluída! Todas as entregas feitas!'), 200)
}

function fecharModal() {
  modalOverlay.classList.remove('ativo')
  if (mapaLeaflet) { mapaLeaflet.remove(); mapaLeaflet = null }
  document.getElementById('mapContainer').innerHTML = ''
}

/* =====================================================
   CRIAR ITEM NA LISTA
   ===================================================== */
function criarItem(endereco) {
  const vazio = lista.querySelector('.vazio')
  if (vazio) vazio.remove()

  const li = document.createElement('li')
  li.className = 'item-entrega'
  const fav = isFavorito(endereco)

  li.innerHTML = `
    <button class="btn-favorito ${fav ? 'ativo' : ''}" title="Favoritar">★</button>
    <span class="item-texto">${endereco}</span>
    <button class="btn-waze">🗺 Waze</button>
    <button class="btn-concluido">✓ Entregue</button>
    <button class="btn-remover">✕</button>
  `

  li.querySelector('.btn-favorito').addEventListener('click', () => {
    toggleFavorito(endereco)
    li.querySelector('.btn-favorito').classList.toggle('ativo', isFavorito(endereco))
    renderFavoritos()
  })

  li.querySelector('.btn-waze').addEventListener('click', () => {
    window.open(`https://waze.com/ul?q=${encodeURIComponent(endereco + ', ' + getCidade())}&navigate=yes`)
  })

  li.querySelector('.btn-concluido').addEventListener('click', function() {
    li.classList.add('concluido')
    this.disabled = true
    const proximos = lista.querySelectorAll('.item-entrega:not(.concluido)')
    if (proximos.length > 0) {
      const prox = proximos[0].querySelector('.item-texto').textContent
      setTimeout(() => window.open(`https://waze.com/ul?q=${encodeURIComponent(prox + ', ' + getCidade())}&navigate=yes`), 500)
    } else {
      setTimeout(() => alert('🎉 Todas as entregas concluídas!'), 300)
    }
    salvarLista()
  })

  li.querySelector('.btn-remover').addEventListener('click', () => {
    li.remove()
    atualizarContador()
    salvarLista()
    if (!lista.querySelector('.item-entrega'))
      lista.innerHTML = '<li class="vazio">Nenhuma entrega adicionada ainda.</li>'
  })

  lista.appendChild(li)
}

function adicionarEndereco() {
  const end = input.value.trim()
  if (!end) return
  criarItem(end)
  input.value = ''
  fecharSugestoes()
  input.focus()
  atualizarContador()
  salvarLista()
}

function renderListaComFavoritos() {
  lista.querySelectorAll('.item-entrega').forEach(item => {
    const end = item.querySelector('.item-texto').textContent
    item.querySelector('.btn-favorito').classList.toggle('ativo', isFavorito(end))
  })
}

/* =====================================================
   CONTADOR / SAVE / LOAD
   ===================================================== */
function atualizarContador() {
  const total = lista.querySelectorAll('.item-entrega').length
  contador.textContent = `${total} entrega${total !== 1 ? 's' : ''} adicionada${total !== 1 ? 's' : ''}`
}

function salvarLista() {
  const itens = lista.querySelectorAll('.item-entrega')
  const dados = [...itens].map(item => ({
    endereco: item.querySelector('.item-texto').textContent,
    concluido: item.classList.contains('concluido')
  }))
  localStorage.setItem('luvit-entregas', JSON.stringify(dados))
}

function carregarLista() {
  const salvo = localStorage.getItem('luvit-entregas')
  if (!salvo) return
  JSON.parse(salvo).forEach(d => {
    criarItem(d.endereco)
    if (d.concluido) {
      const itens = lista.querySelectorAll('.item-entrega')
      const ultimo = itens[itens.length - 1]
      ultimo.classList.add('concluido')
      const btn = ultimo.querySelector('.btn-concluido')
      if (btn) btn.disabled = true
    }
  })
  atualizarContador()
}

/* =====================================================
   EVENTOS
   ===================================================== */
btnAdicionar.addEventListener('click', adicionarEndereco)
input.addEventListener('keypress', e => { if (e.key === 'Enter') adicionarEndereco() })
btnOtimizar.addEventListener('click', ativarOtimizarRota)

btnFecharModal.addEventListener('click', () => {
  if (modoAtivo && !confirm('Encerrar a rota atual?')) return
  modoAtivo = false; rotaOrdenada = []; paradaAtual = 0
  fecharModal()
})
btnCancelarModal.addEventListener('click', () => {
  if (modoAtivo && !confirm('Encerrar a rota atual?')) return
  modoAtivo = false; rotaOrdenada = []; paradaAtual = 0
  fecharModal()
})

btnLimpar.addEventListener('click', () => {
  if (!confirm('Limpar todas as entregas do dia?')) return
  lista.innerHTML = '<li class="vazio">Nenhuma entrega adicionada ainda.</li>'
  localStorage.removeItem('luvit-entregas')
  atualizarContador()
})

/* =====================================================
   INIT
   ===================================================== */
carregarLista()
renderFavoritos()
renderHistorico()
detectarCidade() // detecta cidade pelo GPS ao abrir o app