const input = document.getElementById('enderecoInput')
const btnAdicionar = document.getElementById('btnAdicionar')
const lista = document.getElementById('listaEntregas')
const contador = document.getElementById('contador')
const btnLimpar = document.getElementById('btnLimpar')
const btnModoMotoboy = document.getElementById('btnModoMotoboy')
const modalOverlay = document.getElementById('modalOverlay')
const listaOrdenada = document.getElementById('listaOrdenada')
const btnIniciarWaze = document.getElementById('btnIniciarWaze')
const btnIniciarMaps = document.getElementById('btnIniciarMaps')
const btnFecharModal = document.getElementById('btnFecharModal')

let rotaOrdenada = []
let modoAtivo = false       // true quando o motoboy está em rota
let paradaAtual = 0         // índice da parada atual na rota
let appNavegador = null     // 'waze' ou 'maps'

const CIDADE_PADRAO = 'São José dos Pinhais, Paraná, Brasil'

/* ================= FAVORITOS ================= */
function getFavoritos() {
  return JSON.parse(localStorage.getItem('luvit-favoritos') || '[]')
}
function salvarFavoritos(favs) {
  localStorage.setItem('luvit-favoritos', JSON.stringify(favs))
}
function toggleFavorito(endereco) {
  let favs = getFavoritos()
  if (favs.includes(endereco)) {
    favs = favs.filter(f => f !== endereco)
  } else {
    favs.unshift(endereco)
    if (favs.length > 20) favs = favs.slice(0, 20)
  }
  salvarFavoritos(favs)
  return favs.includes(endereco)
}
function isFavorito(endereco) {
  return getFavoritos().includes(endereco)
}

/* ================= HISTÓRICO ================= */
function getHistorico() {
  return JSON.parse(localStorage.getItem('luvit-historico') || '[]')
}
function registrarHistorico(enderecos) {
  if (!enderecos.length) return
  const hist = getHistorico()
  const hoje = new Date().toLocaleDateString('pt-BR')
  hist.unshift({
    data: hoje,
    enderecos,
    hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  })
  if (hist.length > 30) hist.pop()
  localStorage.setItem('luvit-historico', JSON.stringify(hist))
}

/* ================= NORMALIZAÇÃO ================= */
function normalizarEndereco(e) {
  return e
    .toLowerCase()
    .replace(/r\./g, 'rua')
    .replace(/av\./g, 'avenida')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ================= CACHE GEO ================= */
function salvarCache(endereco, lat, lon) {
  localStorage.setItem('geo_' + endereco, JSON.stringify({ lat, lon }))
}
function buscarCache(endereco) {
  const data = localStorage.getItem('geo_' + endereco)
  return data ? JSON.parse(data) : null
}

/* ================= GEOCODING ================= */
async function geocodificarEndereco(endereco) {
  const cache = buscarCache(endereco)
  if (cache) return { endereco, lat: cache.lat, lon: cache.lon }

  const base = normalizarEndereco(endereco)
  const ruaSemNumero = base.replace(/\d+/g, '').trim()

  const tentativas = [
    `${base}, ${CIDADE_PADRAO}`,
    `${ruaSemNumero}, ${CIDADE_PADRAO}`,
    `${base}, Paraná, Brasil`,
    `${ruaSemNumero}, Paraná, Brasil`
  ]

  for (let t of tentativas) {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(t)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      const data = await resp.json()
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat)
        const lon = parseFloat(data[0].lon)
        salvarCache(endereco, lat, lon)
        return { endereco, lat, lon }
      }
    } catch (e) {
      console.warn('Erro na tentativa:', t)
    }
  }

  console.warn('Não encontrado:', endereco)
  return null
}

/* ================= AUTOCOMPLETE ================= */
const sugestoesBox = document.getElementById('sugestoes')
let debounceTimer = null
let ultimaRequisicao = 0

input.addEventListener('input', () => {
  clearTimeout(debounceTimer)
  const val = input.value.trim()

  if (val.length < 4) {
    sugestoesBox.innerHTML = ''
    sugestoesBox.style.display = 'none'
    return
  }

  debounceTimer = setTimeout(async () => {
    const agora = Date.now()
    // Respeita política do Nominatim: máx 1 req/segundo
    if (agora - ultimaRequisicao < 1100) return
    ultimaRequisicao = agora

    try {
      const query = encodeURIComponent(val + ', ' + CIDADE_PADRAO)
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      const data = await resp.json()

      sugestoesBox.innerHTML = ''
      if (!data.length) {
        sugestoesBox.style.display = 'none'
        return
      }

      data.forEach(item => {
        const a = item.address || {}
        const partes = [
          a.road || a.pedestrian || '',
          a.house_number || '',
          a.suburb || a.neighbourhood || a.city_district || ''
        ].filter(Boolean)
        const label = partes.length
          ? partes.join(', ')
          : item.display_name.split(',').slice(0, 2).join(',').trim()

        const div = document.createElement('div')
        div.className = 'sugestao-item'
        div.textContent = label
        div.addEventListener('mousedown', () => {
          input.value = label
          sugestoesBox.innerHTML = ''
          sugestoesBox.style.display = 'none'
          input.focus()
        })
        sugestoesBox.appendChild(div)
      })

      sugestoesBox.style.display = 'block'
    } catch (e) {
      console.warn('Autocomplete falhou:', e)
    }
  }, 600)
})

document.addEventListener('click', (e) => {
  if (!e.target.closest('.input-wrapper')) {
    sugestoesBox.innerHTML = ''
    sugestoesBox.style.display = 'none'
  }
})

/* ================= DISTÂNCIA ================= */
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ================= ORDENAR ================= */
function ordenarPorDistancia(pontos, origem) {
  const restantes = [...pontos]
  const ordenados = []
  let atual = origem

  while (restantes.length > 0) {
    let menor = Infinity
    let index = 0
    restantes.forEach((p, i) => {
      const d = calcularDistancia(atual.lat, atual.lon, p.lat, p.lon)
      if (d < menor) { menor = d; index = i }
    })
    const proximo = restantes.splice(index, 1)[0]
    ordenados.push(proximo)
    atual = proximo
  }

  return ordenados
}

/* ================= LOCALIZAÇÃO ================= */
async function obterLocalizacao() {
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      )
      return { lat: pos.coords.latitude, lon: pos.coords.longitude }
    } catch {}
  }
  const fallback = await geocodificarEndereco(CIDADE_PADRAO)
  return fallback || { lat: -25.53, lon: -49.2 }
}

/* ================= CRIAR ITEM ================= */
function criarItem(endereco) {
  const vazio = lista.querySelector('.vazio')
  if (vazio) vazio.remove()

  const li = document.createElement('li')
  li.className = 'item-entrega'

  const fav = isFavorito(endereco)

  li.innerHTML = `
    <button class="btn-favorito${fav ? ' ativo' : ''}" title="Favoritar">★</button>
    <span>${endereco}</span>
    <button class="btn-waze">🗺 Waze</button>
    <button class="btn-concluido">✓ Concluído</button>
    <button class="btn-remover">✕</button>
  `

  li.querySelector('.btn-favorito').addEventListener('click', () => {
    const eraFav = isFavorito(endereco)
    toggleFavorito(endereco)
    li.querySelector('.btn-favorito').classList.toggle('ativo', !eraFav)
    renderFavoritos()
  })

  li.querySelector('.btn-waze').addEventListener('click', () => {
    window.open(`https://waze.com/ul?q=${encodeURIComponent(endereco + ', ' + CIDADE_PADRAO)}&navigate=yes`)
  })

  li.querySelector('.btn-concluido').addEventListener('click', () => {
    li.classList.add('concluido')
    li.querySelector('.btn-concluido').disabled = true
    const proximos = lista.querySelectorAll('.item-entrega:not(.concluido)')
    if (proximos.length > 0) {
      const prox = proximos[0].querySelector('span').textContent
      setTimeout(() => {
        window.open(`https://waze.com/ul?q=${encodeURIComponent(prox + ', ' + CIDADE_PADRAO)}&navigate=yes`)
      }, 500)
    } else {
      setTimeout(() => alert('🎉 Todas as entregas concluídas!'), 300)
    }
    salvarLista()
  })

  li.querySelector('.btn-remover').addEventListener('click', () => {
    li.remove()
    atualizarContador()
    salvarLista()
    if (!lista.querySelector('.item-entrega')) {
      lista.innerHTML = '<li class="vazio">Nenhuma entrega adicionada ainda.</li>'
    }
  })

  lista.appendChild(li)
}

function adicionarEndereco() {
  const endereco = input.value.trim()
  if (!endereco) return
  criarItem(endereco)
  input.value = ''
  sugestoesBox.innerHTML = ''
  sugestoesBox.style.display = 'none'
  input.focus()
  atualizarContador()
  salvarLista()
}

/* ================= FAVORITOS UI ================= */
function renderFavoritos() {
  const favs = getFavoritos()
  const container = document.getElementById('favoritosLista')
  const section = document.getElementById('favoritosSection')
  if (!container || !section) return

  if (!favs.length) {
    section.style.display = 'none'
    return
  }

  section.style.display = 'block'
  container.innerHTML = ''
  favs.forEach(f => {
    const div = document.createElement('div')
    div.className = 'fav-item'
    div.innerHTML = `<span>★ ${f}</span><button class="fav-add" title="Adicionar à lista">+ Adicionar</button>`
    div.querySelector('.fav-add').addEventListener('click', () => {
      input.value = f
      adicionarEndereco()
    })
    container.appendChild(div)
  })
}

/* ================= HISTÓRICO UI ================= */
function renderHistorico() {
  const hist = getHistorico()
  const container = document.getElementById('historicoLista')
  const section = document.getElementById('historicoSection')
  if (!container || !section) return

  if (!hist.length) {
    section.style.display = 'none'
    return
  }

  section.style.display = 'block'
  container.innerHTML = ''
  hist.slice(0, 5).forEach(dia => {
    const div = document.createElement('div')
    div.className = 'hist-dia'
    div.innerHTML = `
      <div class="hist-header">📅 ${dia.data} às ${dia.hora} — ${dia.enderecos.length} entrega${dia.enderecos.length > 1 ? 's' : ''}</div>
      <div class="hist-enderecos">${dia.enderecos.map(e => `<span class="hist-end">${e}</span>`).join('')}</div>
    `
    container.appendChild(div)
  })
}

/* ================= CONTADOR / SAVE / LOAD ================= */
function atualizarContador() {
  const total = lista.querySelectorAll('.item-entrega').length
  contador.textContent = `${total} entrega${total !== 1 ? 's' : ''} adicionada${total !== 1 ? 's' : ''}`
}

function salvarLista() {
  const itens = lista.querySelectorAll('.item-entrega')
  const enderecos = []
  itens.forEach(item => {
    enderecos.push({
      endereco: item.querySelector('span').textContent,
      concluido: item.classList.contains('concluido')
    })
  })
  localStorage.setItem('luvit-entregas', JSON.stringify(enderecos))
}

function carregarLista() {
  const salvo = localStorage.getItem('luvit-entregas')
  if (!salvo) return
  JSON.parse(salvo).forEach(dado => {
    criarItem(dado.endereco)
    if (dado.concluido) {
      const itens = lista.querySelectorAll('.item-entrega')
      const ultimo = itens[itens.length - 1]
      ultimo.classList.add('concluido')
      ultimo.querySelector('.btn-concluido').disabled = true
    }
  })
  atualizarContador()
}



/* ================= MODO MOTOBOY ================= */
async function ativarModoMotoboy() {
  const itens = lista.querySelectorAll('.item-entrega:not(.concluido)')
  if (itens.length === 0) return alert('Adicione endereços!')

  btnModoMotoboy.textContent = '⏳ Calculando...'
  btnModoMotoboy.disabled = true
  modalOverlay.classList.add('ativo')
  listaOrdenada.innerHTML = '<p style="color:#555;text-align:center;padding:20px">🔍 Calculando a melhor rota...</p>'

  const enderecos = [...itens].map(i => i.querySelector('span').textContent)
  const origem = await obterLocalizacao()
  const coords = await Promise.all(enderecos.map(geocodificarEndereco))

  const validos = coords.filter(c => c !== null)
  const falhos = enderecos.filter((_, i) => !coords[i])

  btnModoMotoboy.textContent = '🛵 Modo Motoboy'
  btnModoMotoboy.disabled = false

  if (validos.length === 0) {
    listaOrdenada.innerHTML = '<p style="color:#ff4444;text-align:center;padding:16px">❌ Nenhum endereço encontrado. Tente endereços mais completos.</p>'
    return
  }

  rotaOrdenada = ordenarPorDistancia(validos, origem)
  paradaAtual = 0
  modoAtivo = false
  registrarHistorico(rotaOrdenada.map(p => p.endereco))
  renderHistorico()

  renderModalRota(falhos)
}

function renderModalRota(falhos = []) {
  listaOrdenada.innerHTML = ''

  if (falhos.length) {
    const aviso = document.createElement('p')
    aviso.style.cssText = 'color:#FF5C00;font-size:12px;background:#1a0d00;padding:8px 10px;border-radius:6px;margin-bottom:12px'
    aviso.textContent = '⚠️ Não encontrado: ' + falhos.join(', ')
    listaOrdenada.appendChild(aviso)
  }

  // Lista de paradas
  rotaOrdenada.forEach((p, i) => {
    const div = document.createElement('div')
    div.classList.add('modal-item')
    div.dataset.index = i

    const concluida = modoAtivo && i < paradaAtual
    const atual = modoAtivo && i === paradaAtual

    div.classList.toggle('parada-concluida', concluida)
    div.classList.toggle('parada-atual', atual)

    div.innerHTML = `
      <div class="numero">${concluida ? '✓' : i + 1}</div>
      <span>${p.endereco}</span>
      ${atual ? '<span class="badge-atual">agora</span>' : ''}
    `
    listaOrdenada.appendChild(div)
  })

  // Botões de navegação (escolha do app) — só mostrar antes de iniciar
  const modalBtns = document.querySelector('.modal-btns')
  const btnFechar = document.querySelector('.btn-fechar-modal')

  if (!modoAtivo) {
    // Estado: escolher navegador e iniciar
    modalBtns.innerHTML = `
      <button class="btn-iniciar-waze" id="btnIniciarWaze">🗺 Iniciar no Waze</button>
      <button class="btn-iniciar-maps" id="btnIniciarMaps">📍 Rota no Maps</button>
    `
    btnFechar.textContent = 'Cancelar'

    document.getElementById('btnIniciarWaze').addEventListener('click', () => iniciarRota('waze'))
    document.getElementById('btnIniciarMaps').addEventListener('click', () => iniciarRota('maps'))
  } else {
    // Estado: rota em andamento
    const temProxima = paradaAtual < rotaOrdenada.length - 1
    const concluidas = paradaAtual

    modalBtns.innerHTML = `
      <button class="btn-proxima-parada" id="btnProxima" ${!temProxima ? 'disabled' : ''}>
        ${temProxima ? `▶ Próxima parada (${paradaAtual + 2}/${rotaOrdenada.length})` : '🎉 Última parada!'}
      </button>
    `
    btnFechar.textContent = `Encerrar rota (${concluidas}/${rotaOrdenada.length} concluídas)`

    if (temProxima) {
      document.getElementById('btnProxima').addEventListener('click', avancarParada)
    }
  }
}

function iniciarRota(navegador) {
  appNavegador = navegador
  modoAtivo = true
  paradaAtual = 0
  abrirNavegadorParaParada(0)
  renderModalRota()
}

function abrirNavegadorParaParada(index) {
  const ponto = rotaOrdenada[index]
  if (!ponto) return
  const enc = encodeURIComponent(ponto.endereco + ', ' + CIDADE_PADRAO)

  if (appNavegador === 'waze') {
    window.open(`https://waze.com/ul?q=${enc}&navigate=yes`)
  } else {
    // Maps: rota da parada atual até o destino final, com waypoints restantes
    const restantes = rotaOrdenada.slice(index)
    if (restantes.length === 1) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${enc}&travelmode=driving`)
    } else {
      const waypoints = restantes.slice(1, -1).map(p => encodeURIComponent(p.endereco + ', ' + CIDADE_PADRAO)).join('|')
      const destino = encodeURIComponent(restantes[restantes.length - 1].endereco + ', ' + CIDADE_PADRAO)
      const wp = waypoints ? `&waypoints=${waypoints}` : ''
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${enc}&destination=${destino}${wp}&travelmode=driving`)
    }
  }

  // Marca o item na lista principal como em progresso
  marcarParadaNaLista(index)
}

function avancarParada() {
  // Marca a parada atual como concluída na lista principal
  concluirParadaNaLista(paradaAtual)
  paradaAtual++

  if (paradaAtual >= rotaOrdenada.length) {
    encerrarRota()
    return
  }

  abrirNavegadorParaParada(paradaAtual)
  renderModalRota()
}

function marcarParadaNaLista(index) {
  const endereco = rotaOrdenada[index].endereco
  const itens = lista.querySelectorAll('.item-entrega')
  itens.forEach(item => {
    if (item.querySelector('span').textContent === endereco) {
      item.style.borderColor = '#FF5C00'
    }
  })
}

function concluirParadaNaLista(index) {
  const endereco = rotaOrdenada[index].endereco
  const itens = lista.querySelectorAll('.item-entrega')
  itens.forEach(item => {
    if (item.querySelector('span').textContent === endereco) {
      item.classList.add('concluido')
      const btn = item.querySelector('.btn-concluido')
      if (btn) btn.disabled = true
      item.style.borderColor = ''
    }
  })
  salvarLista()
  atualizarContador()
}

function encerrarRota() {
  // Conclui última parada
  concluirParadaNaLista(rotaOrdenada.length - 1)
  modoAtivo = false
  rotaOrdenada = []
  paradaAtual = 0
  modalOverlay.classList.remove('ativo')
  setTimeout(() => alert('🎉 Rota concluída! Todas as entregas foram feitas!'), 200)
}

/* ================= LIMPAR ================= */
btnLimpar.addEventListener('click', () => {
  if (!confirm('Limpar todas as entregas do dia?')) return
  lista.innerHTML = '<li class="vazio">Nenhuma entrega adicionada ainda.</li>'
  localStorage.removeItem('luvit-entregas')
  atualizarContador()
})

/* ================= EVENTOS ================= */
btnAdicionar.addEventListener('click', adicionarEndereco)
input.addEventListener('keypress', e => { if (e.key === 'Enter') adicionarEndereco() })
btnModoMotoboy.addEventListener('click', ativarModoMotoboy)
btnFecharModal.addEventListener('click', () => {
  if (modoAtivo) {
    if (!confirm('Encerrar a rota atual? O progresso será perdido.')) return
    modoAtivo = false
    rotaOrdenada = []
    paradaAtual = 0
  }
  modalOverlay.classList.remove('ativo')
})

/* ================= INIT ================= */
carregarLista()
renderFavoritos()
renderHistorico()