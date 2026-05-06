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

const CIDADE_PADRAO = 'São José dos Pinhais, Paraná, Brasil'

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

/* ================= CACHE ================= */
function salvarCache(endereco, lat, lon) {
  localStorage.setItem('geo_' + endereco, JSON.stringify({ lat, lon }))
}

function buscarCache(endereco) {
  const data = localStorage.getItem('geo_' + endereco)
  return data ? JSON.parse(data) : null
}

/* ================= GEOCODING ROBUSTO ================= */
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
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(t)}&format=json&limit=1`, {
        headers: { 'Accept-Language': 'pt-BR' }
      })

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

  console.warn('❌ Não encontrado:', endereco)
  return null
}

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
      if (d < menor) {
        menor = d
        index = i
      }
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
      return {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude
      }
    } catch {}
  }

  const fallback = await geocodificarEndereco(CIDADE_PADRAO)
  return fallback || { lat: -25.53, lon: -49.2 }
}

/* ================= MODO MOTOBOY ================= */
async function ativarModoMotoboy() {
  const itens = lista.querySelectorAll('.item-entrega:not(.concluido)')
  if (itens.length === 0) return alert('Adicione endereços')

  btnModoMotoboy.textContent = '⏳ Calculando...'
  btnModoMotoboy.disabled = true

  modalOverlay.classList.add('ativo')
  listaOrdenada.innerHTML = '🔍 Buscando endereços...'

  const enderecos = [...itens].map(i =>
    i.querySelector('span').textContent
  )

  const origem = await obterLocalizacao()
  const coords = await Promise.all(enderecos.map(geocodificarEndereco))

  const validos = coords.filter(c => c !== null)
  const falhos = enderecos.filter((_, i) => !coords[i])

  if (validos.length === 0) {
    listaOrdenada.innerHTML = '❌ Nenhum endereço encontrado'
    btnModoMotoboy.disabled = false
    btnModoMotoboy.textContent = '🛵 Modo Motoboy'
    return
  }

  rotaOrdenada = ordenarPorDistancia(validos, origem)

  listaOrdenada.innerHTML = ''

  if (falhos.length) {
    const aviso = document.createElement('p')
    aviso.textContent = '⚠️ Não encontrado: ' + falhos.join(', ')
    aviso.style.color = 'orange'
    listaOrdenada.appendChild(aviso)
  }

  rotaOrdenada.forEach((p, i) => {
    const div = document.createElement('div')
    div.textContent = `${i + 1}. ${p.endereco}`
    listaOrdenada.appendChild(div)
  })

  btnModoMotoboy.textContent = '🛵 Modo Motoboy'
  btnModoMotoboy.disabled = false
}

/* ================= ADICIONAR ================= */
btnAdicionar.onclick = () => {
  const endereco = input.value.trim()
  if (!endereco) return

  const li = document.createElement('li')
  li.className = 'item-entrega'

  const span = document.createElement('span')
  span.textContent = endereco

  const btnConcluir = document.createElement('button')
  btnConcluir.textContent = 'Entregue'
  btnConcluir.style.background = '#00c853'
  btnConcluir.style.color = '#fff'

  btnConcluir.onclick = () => {
    li.classList.add('concluido')
    btnConcluir.disabled = true
  }

  const btnRemover = document.createElement('button')
  btnRemover.textContent = '✕'

  btnRemover.onclick = () => li.remove()

  li.appendChild(span)
  li.appendChild(btnConcluir)
  li.appendChild(btnRemover)

  lista.appendChild(li)

  input.value = ''
  contador.textContent = lista.children.length + ' entregas'
}

/* ================= MAPS ================= */
btnIniciarMaps.onclick = () => {
  if (!rotaOrdenada.length) return

  const waypoints = rotaOrdenada.slice(1, -1)
    .map(p => encodeURIComponent(p.endereco + ', ' + CIDADE_PADRAO))
    .join('|')

  const origem = encodeURIComponent(rotaOrdenada[0].endereco + ', ' + CIDADE_PADRAO)
  const destino = encodeURIComponent(rotaOrdenada[rotaOrdenada.length - 1].endereco + ', ' + CIDADE_PADRAO)

  window.open(`https://www.google.com/maps/dir/?api=1&origin=${origem}&destination=${destino}&waypoints=${waypoints}`)
}

/* ================= WAZE ================= */
btnIniciarWaze.onclick = () => {
  if (!rotaOrdenada.length) return

  const destino = encodeURIComponent(rotaOrdenada[0].endereco + ', ' + CIDADE_PADRAO)
  window.open(`https://waze.com/ul?q=${destino}&navigate=yes`)
}

/* ================= LIMPAR ================= */
btnLimpar.onclick = () => {
  lista.innerHTML = ''
  contador.textContent = '0 entregas'
}

/* ================= EVENTOS ================= */
btnModoMotoboy.onclick = ativarModoMotoboy
btnFecharModal.onclick = () => modalOverlay.classList.remove('ativo')