import * as THREE from 'three'
import './style.css'

const canvas = document.querySelector('#game')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x02030d)
scene.fog = new THREE.FogExp2(0x02030d, 0.009)

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1200)
camera.position.set(0, 1.8, 8)
camera.lookAt(0, 1.2, -28)

const clock = new THREE.Clock()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2(0, 0)
let aimWorld = new THREE.Vector3(0, 1.2, -38)

const state = {
  score: 0, round: 1, maxRounds: 3,
  kills: 0, targetKills: 5,
  shieldHits: 0, maxShieldHits: 30,
  gameOver: false, won: false,
  bossActive: false, boss: null,
  nextSpawn: 0, lastShot: 0,
  combo: 0, comboTimer: 0,
  screenShake: 0,
  totalEnemiesSpawned: 0,
}

const enemies = []
const lasers = []
const blasts = []
const debris = []
const enemyLasers = []
const engineTrails = []

// ─── HUD Elements ────────────────────────────────────────────────────────────
const scoreEl      = document.querySelector('#score')
const killsEl      = document.querySelector('#kills')
const waveEl       = document.querySelector('#wave')
const roundEl      = document.querySelector('#round')
const shieldPctEl  = document.querySelector('#shieldPct')
const hitsEl       = document.querySelector('#hits')
const objectiveEl  = document.querySelector('#objective')
const bossHud      = document.querySelector('#bossHud')
const bossBar      = document.querySelector('#bossBar')
const messageEl    = document.querySelector('#message')
const reticle      = document.querySelector('#reticle')
const comboEl      = document.querySelector('#combo')
const shieldBarEl  = document.querySelector('#shieldBar')

// ─── Lights ──────────────────────────────────────────────────────────────────
const ambient = new THREE.HemisphereLight(0x4466cc, 0x080810, 0.7)
scene.add(ambient)

const key = new THREE.DirectionalLight(0x8ecbff, 2.8)
key.position.set(-5, 8, 8)
key.castShadow = true
key.shadow.mapSize.set(1024, 1024)
scene.add(key)

const fill = new THREE.DirectionalLight(0x2244ff, 0.6)
fill.position.set(8, -2, 4)
scene.add(fill)

const redGlow = new THREE.PointLight(0xff2030, 4, 100)
redGlow.position.set(0, 3, -30)
scene.add(redGlow)

const blueGlow = new THREE.PointLight(0x0066ff, 2, 60)
blueGlow.position.set(0, -3, 0)
scene.add(blueGlow)

// ─── Nebula Background ───────────────────────────────────────────────────────
// Far star field
const starGeo = new THREE.BufferGeometry()
const starCount = 3000
const starPos = [], starColors = []
for (let i = 0; i < starCount; i++) {
  starPos.push(
    (Math.random() - 0.5) * 300,
    (Math.random() - 0.5) * 160,
    -Math.random() * 350 - 20
  )
  const r = Math.random()
  if (r < 0.15) { starColors.push(0.6, 0.8, 1) }       // blue-white
  else if (r < 0.25) { starColors.push(1, 0.85, 0.6) }  // warm yellow
  else if (r < 0.30) { starColors.push(1, 0.5, 0.4) }   // red giant
  else { starColors.push(0.85, 0.9, 1) }                 // white
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3))
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  size: 0.13, vertexColors: true, transparent: true, opacity: 0.9
}))
scene.add(stars)

// Mid-field brighter stars
const brightGeo = new THREE.BufferGeometry()
const bPos = []
for (let i = 0; i < 180; i++) {
  bPos.push((Math.random()-0.5)*200, (Math.random()-0.5)*110, -Math.random()*200-30)
}
brightGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3))
const brightStars = new THREE.Points(brightGeo, new THREE.PointsMaterial({
  color: 0xeef5ff, size: 0.32, transparent: true, opacity: 0.7
}))
scene.add(brightStars)

// Nebula dust clouds (large semi-transparent spheres)
const nebulaColors = [0x1a0a40, 0x0a1a3a, 0x1a0520, 0x051a20]
for (let i = 0; i < 6; i++) {
  const geo = new THREE.SphereGeometry(18 + Math.random()*22, 12, 8)
  const mat = new THREE.MeshBasicMaterial({
    color: nebulaColors[i % nebulaColors.length],
    transparent: true, opacity: 0.07 + Math.random()*0.05, side: THREE.BackSide
  })
  const cloud = new THREE.Mesh(geo, mat)
  cloud.position.set((Math.random()-0.5)*60, (Math.random()-0.5)*30, -60 - Math.random()*80)
  scene.add(cloud)
}

// Asteroids
const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.9, metalness: 0.1 })
const asteroids = []
for (let i = 0; i < 30; i++) {
  const size = 0.18 + Math.random() * 0.55
  const a = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), asteroidMat)
  a.position.set((Math.random()-0.5)*80, (Math.random()-0.5)*35, -20 - Math.random()*160)
  a.rotation.set(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2)
  a.userData.rotSpeed = new THREE.Vector3((Math.random()-0.5)*0.4, (Math.random()-0.5)*0.4, (Math.random()-0.5)*0.4)
  a.userData.drift = (Math.random()-0.5)*0.3
  scene.add(a)
  asteroids.push(a)
}

// ─── Materials ───────────────────────────────────────────────────────────────
function mat(color, rough = 0.45, metal = 0.7) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}
const hullMat  = mat(0x161c28, 0.4, 0.8)
const hull2Mat = mat(0x0e1218, 0.5, 0.75)
const darkMat  = mat(0x07090e, 0.6, 0.6)
const blueMat  = new THREE.MeshStandardMaterial({ color: 0x1a7fff, emissive: 0x0066ff, emissiveIntensity: 2.8 })
const redMat   = new THREE.MeshStandardMaterial({ color: 0xff2028, emissive: 0xff0818, emissiveIntensity: 3.2 })
const orangeMat= new THREE.MeshStandardMaterial({ color: 0xff6a10, emissive: 0xff4400, emissiveIntensity: 2.5 })
const greenMat = new THREE.MeshStandardMaterial({ color: 0x44ff70, emissive: 0x22ff55, emissiveIntensity: 1.8, transparent: true, opacity: 0.32 })
const accentMat= new THREE.MeshStandardMaterial({ color: 0x44aaff, emissive: 0x2288ff, emissiveIntensity: 1.4 })

// ─── Player Cockpit ──────────────────────────────────────────────────────────
const cockpit = new THREE.Group()

function addBox(group, sx, sy, sz, x, y, z, material, rotZ=0, rotX=0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
  m.position.set(x, y, z)
  m.rotation.z = rotZ
  m.rotation.x = rotX
  m.castShadow = true
  group.add(m)
  return m
}

// Main cockpit body panels
addBox(cockpit, 10.5, .4, .5,  0, -1.65, 1.2, hullMat)
addBox(cockpit, 1.8,  .3, .4,  0, -1.7,  0.0, hull2Mat)   // center ridge

// Side struts (angled)
addBox(cockpit, .30, 7.2, .38, -5.8, 1.15, -1.3, hullMat, -0.27)
addBox(cockpit, .30, 7.2, .38,  5.8, 1.15, -1.3, hullMat,  0.27)

// Wing accent strips
addBox(cockpit, 3.4, .22, .30, -3.9, -1.12, 0.1, blueMat)
addBox(cockpit, 3.4, .22, .30,  3.9, -1.12, 0.1, blueMat)
addBox(cockpit, 1.6, .15, .22, -3.9, -1.35, 0.1, accentMat)
addBox(cockpit, 1.6, .15, .22,  3.9, -1.35, 0.1, accentMat)

// Cockpit rim segments
const rimPositions = [-4.2, -2.1, 0, 2.1, 4.2]
rimPositions.forEach(x => {
  addBox(cockpit, .22, .14, .38, x, -1.58, 1.35, hull2Mat)
})

// Cannon assemblies
const cannonPositions = [new THREE.Vector3(-3.2, -1.2, 1.7), new THREE.Vector3(3.2, -1.2, 1.7)]
for (const p of cannonPositions) {
  const g = new THREE.Group()
  g.position.copy(p)
  g.lookAt(0, .2, -20)

  // Barrel with detail rings
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.16, .26, 3.4, 20), hullMat)
  barrel.rotation.x = Math.PI / 2; g.add(barrel)

  // Ring details along barrel
  for (let r = 0; r < 3; r++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .14, 16), hull2Mat)
    ring.rotation.x = Math.PI / 2
    ring.position.z = -0.8 + r * 0.5
    g.add(ring)
  }

  // Emitter tip (glowing)
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(.21, .21, .32, 18), blueMat)
  tip.rotation.x = Math.PI / 2; tip.position.z = -1.7; g.add(tip)

  // Under-barrel cooling vent
  const vent = new THREE.Mesh(new THREE.BoxGeometry(.12, .35, 1.2), darkMat)
  vent.position.set(0, -0.22, -0.4); g.add(vent)

  cockpit.add(g)
}

// Shield dome (improved geometry)
const dome = new THREE.Mesh(
  new THREE.SphereGeometry(1.7, 40, 20, 0, Math.PI*2, 0, Math.PI/2),
  greenMat
)
dome.position.set(0, -1.52, .38)
dome.scale.set(1.3, 0.6, 0.7)
cockpit.add(dome)

// Dome inner glow ring
const domeRing = new THREE.Mesh(
  new THREE.TorusGeometry(1.7*1.3, 0.06, 12, 60, Math.PI),
  new THREE.MeshStandardMaterial({ color: 0x66ffaa, emissive: 0x33ff88, emissiveIntensity: 2, transparent: true, opacity: 0.7 })
)
domeRing.position.set(0, -1.52, .38)
domeRing.rotation.z = Math.PI
domeRing.scale.z = 0.7
cockpit.add(domeRing)

scene.add(cockpit)

// Engine glow lights attached to cockpit
const engineLightL = new THREE.PointLight(0x0066ff, 1.5, 12)
engineLightL.position.set(-3.2, -1.2, 2.5)
cockpit.add(engineLightL)
const engineLightR = new THREE.PointLight(0x0066ff, 1.5, 12)
engineLightR.position.set(3.2, -1.2, 2.5)
cockpit.add(engineLightR)

// ─── Enemy Creation ───────────────────────────────────────────────────────────
function createEnemy(isBoss = false) {
  const g = new THREE.Group()
  g.userData.isBoss = isBoss
  g.userData.maxHealth = isBoss ? 45 + state.round * 28 : 2 + Math.floor(state.round / 2)
  g.userData.health    = g.userData.maxHealth
  g.userData.speed     = isBoss ? 4.5 : 9 + state.round * 1.8 + Math.random() * 4
  g.userData.wobble    = Math.random() * 10
  g.userData.lane      = Math.random()
  g.userData.nextShot  = 1.5 + Math.random() * 2
  g.userData.shotTimer = 0
  const s = isBoss ? 2.9 : 1

  // Body
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.78 * s, 1), hullMat)
  body.scale.set(1.25, 0.52, 1.9)
  g.add(body)

  // Nose cone
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.44 * s, 1.15 * s, 5), darkMat)
  nose.rotation.x = Math.PI / 2; nose.position.z = .92 * s; g.add(nose)

  // Core glow
  const core = new THREE.Mesh(new THREE.SphereGeometry(.24 * s, 18, 18), redMat)
  core.position.z = .96 * s; g.add(core)

  // Core light
  const coreLight = new THREE.PointLight(0xff2030, isBoss ? 3.5 : 1.8, isBoss ? 12 : 5)
  coreLight.position.z = .96 * s
  g.add(coreLight)

  // Wings
  const wingGeo = new THREE.BoxGeometry(1.8 * s, .13 * s, .48 * s)
  const lWing = new THREE.Mesh(wingGeo, hullMat); lWing.position.set(-.95*s, 0, -.18*s); lWing.rotation.z =  .28; g.add(lWing)
  const rWing = new THREE.Mesh(wingGeo, hullMat); rWing.position.set( .95*s, 0, -.18*s); rWing.rotation.z = -.28; g.add(rWing)

  // Wing tip accent
  const tipMat = isBoss ? orangeMat : redMat
  const lTip = new THREE.Mesh(new THREE.BoxGeometry(.22*s, .1*s, .22*s), tipMat)
  lTip.position.set(-1.82*s, .18*s, -.18*s); g.add(lTip)
  const rTip = lTip.clone(); rTip.position.x = 1.82*s; g.add(rTip)

  // Engines
  const eng1 = new THREE.Mesh(new THREE.SphereGeometry(.18*s, 12, 12), redMat)
  eng1.position.set(-.44*s, 0, -1.08*s); g.add(eng1)
  const eng2 = eng1.clone(); eng2.position.x = .44*s; g.add(eng2)

  // Boss extras
  if (isBoss) {
    // Shoulder cannons
    for (const sx of [-1.8, 1.8]) {
      const sc = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, 1.6, 12), darkMat)
      sc.rotation.x = Math.PI/2; sc.position.set(sx*s, .2*s, .5*s); g.add(sc)
      const scTip = new THREE.Mesh(new THREE.SphereGeometry(.22*s, 10, 10), orangeMat)
      scTip.position.set(sx*s, .2*s, 1.35*s); g.add(scTip)
    }
    // Armor plates
    const plateGeo = new THREE.BoxGeometry(1.4*s, .25*s, .85*s)
    for (let px of [-0.8, 0.8]) {
      const p = new THREE.Mesh(plateGeo, hull2Mat); p.position.set(px*s, .45*s, 0); g.add(p)
    }
    addBox(g, 2.5*s, .18*s, .55*s, 0, .55*s, -0.4*s, hull2Mat)
  }

  g.userData.hitRadius = isBoss ? 3.0 : 1.15
  scene.add(g)
  return g
}

// ─── Spawning ─────────────────────────────────────────────────────────────────
function spawnEnemy() {
  if (state.gameOver || state.bossActive) return
  const e = createEnemy(false)
  e.position.set((Math.random() - .5) * 24, Math.random() * 10 - 3, -75 - Math.random() * 40)
  e.rotation.y = Math.random() * .9 - .45
  e.rotation.x = (Math.random() - .5) * .2
  enemies.push(e)
  state.totalEnemiesSpawned++
  // Spawn engine trail
  spawnTrail(e)
}

function spawnBoss() {
  state.bossActive = true
  const b = createEnemy(true)
  b.position.set(0, 1.4, -100)
  b.userData.speed = 3.2
  state.boss = b
  enemies.push(b)
  bossHud.classList.remove('hidden')
  objectiveEl.textContent = 'Destroy the BOSS!'
  // Boss entrance flash
  flashBossWarning()
}

// ─── Engine Trails ────────────────────────────────────────────────────────────
function spawnTrail(enemy) {
  const trail = {
    enemy,
    particles: [],
    timer: 0
  }
  engineTrails.push(trail)
}

// ─── Firing ───────────────────────────────────────────────────────────────────
function fireLaser() {
  const now = performance.now()
  if (now - state.lastShot < 115 || state.gameOver) return
  state.lastShot = now

  for (const p of cannonPositions) {
    const worldP = p.clone()
    cockpit.localToWorld(worldP)
    const end = aimWorld.clone()
    const mid = worldP.clone().lerp(end, .5)
    const len = worldP.distanceTo(end)

    // Main beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(.05, .05, len, 8),
      new THREE.MeshBasicMaterial({ color: 0x44bbff, transparent: true, opacity: .95 })
    )
    beam.position.copy(mid)
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), end.clone().sub(worldP).normalize())
    scene.add(beam)

    // Glow beam (wider, more transparent)
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(.18, .18, len, 8),
      new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: .18 })
    )
    glow.position.copy(mid)
    glow.quaternion.copy(beam.quaternion)
    scene.add(glow)

    lasers.push({ mesh: beam, glow, life: .13 })
  }

  // Impact detection
  raycaster.setFromCamera(pointer, camera)
  let best = null, bestDist = Infinity
  for (const e of enemies) {
    const dist = raycaster.ray.distanceToPoint(e.position)
    if (dist < e.userData.hitRadius && e.position.z < 6 && dist < bestDist) {
      best = e; bestDist = dist
    }
  }
  if (best) {
    damageEnemy(best)
    state.combo++
    state.comboTimer = 2.5
  } else {
    // Miss — decay combo slightly
  }
}

// Enemy fires at player
function enemyFireAt(e) {
  const start = e.position.clone()
  const dir = new THREE.Vector3(0, -1.2, 8).normalize() // aimed at player
  const speed = e.userData.isBoss ? 28 : 20

  const bolt = new THREE.Mesh(
    new THREE.CylinderGeometry(.06, .06, 1.8, 8),
    new THREE.MeshBasicMaterial({ color: e.userData.isBoss ? 0xff6600 : 0xff2020, transparent: true, opacity: .9 })
  )
  bolt.position.copy(start)
  bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize())
  scene.add(bolt)

  // Glow
  const boltGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(.2, .2, 1.8, 8),
    new THREE.MeshBasicMaterial({ color: e.userData.isBoss ? 0xff4400 : 0xff0000, transparent: true, opacity: .12 })
  )
  boltGlow.position.copy(start)
  boltGlow.quaternion.copy(bolt.quaternion)
  scene.add(boltGlow)

  enemyLasers.push({ mesh: bolt, glow: boltGlow, dir, speed, life: 3.5 })
}

// ─── Damage ───────────────────────────────────────────────────────────────────
function damageEnemy(e) {
  e.userData.health -= 1
  flash(e.position, e.userData.isBoss ? 1.4 : 0.6)
  // Hit flash scale
  e.scale.multiplyScalar(1.07)
  setTimeout(() => e.scale.multiplyScalar(1/1.07), 55)
  // Boss bar
  if (e.userData.isBoss && bossBar) {
    bossBar.style.width = `${Math.max(0, e.userData.health / e.userData.maxHealth * 100)}%`
  }
  if (e.userData.health <= 0) destroyEnemy(e)
}

function destroyEnemy(e) {
  spawnDebris(e.position, e.userData.isBoss ? 14 : 5, e.userData.isBoss ? 0xff6020 : 0xff3010)
  flash(e.position, e.userData.isBoss ? 3.8 : 1.4, 0xff6a10)
  flash(e.position, e.userData.isBoss ? 2.5 : 0.9, 0xffcc44)
  state.screenShake = e.userData.isBoss ? 0.55 : 0.25

  // Remove trail
  const trailIdx = engineTrails.findIndex(t => t.enemy === e)
  if (trailIdx !== -1) engineTrails.splice(trailIdx, 1)

  scene.remove(e)
  enemies.splice(enemies.indexOf(e), 1)

  if (e.userData.isBoss) {
    state.score += 2500 + state.combo * 50
    state.bossActive = false
    state.boss = null
    bossHud.classList.add('hidden')
    state.shieldHits = Math.max(0, state.shieldHits - 12)
    if (state.round >= state.maxRounds) win()
    else {
      state.round++
      state.kills = 0
      state.targetKills = [5, 10, 15][state.round - 1]
      objectiveEl.textContent = `Destroy ${state.targetKills} enemies`
    }
  } else {
    const bonus = state.combo >= 5 ? 250 : state.combo >= 3 ? 150 : 100
    state.score += bonus
    state.kills++
    if (state.kills >= state.targetKills && !state.bossActive) spawnBoss()
  }
}

// ─── Explosions & Debris ──────────────────────────────────────────────────────
function flash(pos, size = 1, color = 0xff4818) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size, 16, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .92 })
  )
  m.position.copy(pos)
  scene.add(m)
  blasts.push({ mesh: m, life: .4, maxLife: .4 })
}

function spawnDebris(pos, count = 5, color = 0xff4010) {
  for (let i = 0; i < count; i++) {
    const size = 0.06 + Math.random() * 0.18
    const geo = Math.random() > 0.5
      ? new THREE.TetrahedronGeometry(size, 0)
      : new THREE.BoxGeometry(size, size, size)
    const piece = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }))
    piece.position.copy(pos)
    const vel = new THREE.Vector3((Math.random()-.5)*14, (Math.random()-.5)*10, (Math.random()-.5)*12)
    const rotVel = new THREE.Euler((Math.random()-.5)*8, (Math.random()-.5)*8, (Math.random()-.5)*8)
    scene.add(piece)
    debris.push({ mesh: piece, vel, rotVel, life: 0.8 + Math.random()*0.6, maxLife: 1.4 })
  }
}

function flashBossWarning() {
  const el = document.createElement('div')
  el.className = 'boss-warning'
  el.textContent = '⚠ BOSS INCOMING ⚠'
  document.getElementById('hud').appendChild(el)
  setTimeout(() => el.remove(), 2200)
}

// ─── Shield / Damage ─────────────────────────────────────────────────────────
function damageShield(amount = 1) {
  state.shieldHits += amount
  state.combo = 0
  state.screenShake = Math.max(state.screenShake, 0.35)
  document.body.classList.add('hit')
  setTimeout(() => document.body.classList.remove('hit'), 80)
  if (state.shieldHits > state.maxShieldHits) {
    state.gameOver = true
    messageEl.innerHTML = '💥 SHIP DESTROYED &nbsp;—&nbsp; Press <kbd>R</kbd> to restart'
  }
}

function win() {
  state.gameOver = true
  state.won = true
  messageEl.innerHTML = '🏆 ALL WAVES CLEARED! &nbsp;—&nbsp; Press <kbd>R</kbd> to restart'
}

function restart() { window.location.reload() }

// ─── Update Loop ──────────────────────────────────────────────────────────────
function update(dt) {
  const t = clock.elapsedTime

  // Screen shake
  if (state.screenShake > 0) {
    const s = state.screenShake
    camera.position.x = Math.sin(t * 38) * s * 0.25
    camera.position.y = 1.8 + Math.cos(t * 42) * s * 0.18
    state.screenShake -= dt * 3.5
    if (state.screenShake < 0) {
      state.screenShake = 0
      camera.position.set(0, 1.8, 8)
    }
  }

  // Ambient animations
  stars.rotation.z  += dt * .005
  stars.rotation.y  += dt * .002
  brightStars.rotation.z += dt * .003

  asteroids.forEach(a => {
    a.rotation.x += a.userData.rotSpeed.x * dt
    a.rotation.y += a.userData.rotSpeed.y * dt
    a.rotation.z += a.userData.rotSpeed.z * dt
    a.position.z += dt * 1.8
    a.position.x += a.userData.drift * dt
    if (a.position.z > 20) { a.position.z = -180; a.position.x = (Math.random()-.5)*80 }
  })

  // Cockpit sway
  cockpit.position.x += (pointer.x * .2 - cockpit.position.x) * .075
  cockpit.position.y += (-pointer.y * .08 - cockpit.position.y - 0) * .06
  cockpit.rotation.y = pointer.x * .028
  cockpit.rotation.x = -pointer.y * .016
  cockpit.rotation.z = -pointer.x * .012

  // Engine glow pulse
  const pulse = 1.2 + Math.sin(t * 8) * 0.3
  engineLightL.intensity = engineLightR.intensity = pulse
  blueMat.emissiveIntensity = 2.5 + Math.sin(t * 6) * 0.4

  // Shield dome opacity
  const shieldFrac = Math.max(0, 1 - state.shieldHits / state.maxShieldHits)
  dome.material.opacity = 0.08 + shieldFrac * 0.32
  domeRing.material.opacity = 0.4 + shieldFrac * 0.45
  dome.scale.y = 0.55 + shieldFrac * 0.1

  // Red glow flicker
  redGlow.intensity = 3.5 + Math.sin(t * 2.2) * 0.8

  // Aim world calculation
  const dir = new THREE.Vector3(pointer.x, pointer.y, .5).unproject(camera).sub(camera.position).normalize()
  const aimPlaneZ = -38
  const dist = (aimPlaneZ - camera.position.z) / dir.z
  aimWorld = camera.position.clone().add(dir.multiplyScalar(dist))

  // Combo timer
  if (state.comboTimer > 0) {
    state.comboTimer -= dt
    if (state.comboTimer <= 0) state.combo = 0
  }

  // Enemy spawning
  state.nextSpawn -= dt
  if (!state.bossActive && state.kills < state.targetKills && state.nextSpawn <= 0) {
    spawnEnemy()
    state.nextSpawn = Math.max(.38, 1.2 - state.round * .15)
  }

  // Update enemies
  for (const e of [...enemies]) {
    const boss = e.userData.isBoss

    if (!boss) {
      e.position.z += e.userData.speed * dt
      e.position.x += Math.sin(t * 1.7 + e.userData.wobble) * dt * 1.8
      e.position.y += Math.cos(t * 1.3 + e.userData.wobble) * dt * .55
      // Enemy shooting (only when close enough)
      if (e.position.z > -45) {
        e.userData.shotTimer += dt
        if (e.userData.shotTimer >= e.userData.nextShot) {
          enemyFireAt(e)
          e.userData.shotTimer = 0
          e.userData.nextShot = 1.8 + Math.random() * 2.5
        }
      }
    } else {
      e.position.z += e.userData.speed * dt
      e.position.x = Math.sin(t * .65) * 4.2
      e.position.y = 1.4 + Math.cos(t * .85) * .8
      // Boss shoots more
      e.userData.shotTimer += dt
      if (e.userData.shotTimer >= 0.8) {
        enemyFireAt(e)
        e.userData.shotTimer = 0
      }
      if (Math.random() < dt * 0.8) damageShield(1)
    }

    e.lookAt(camera.position)
    if (e.position.z > 7.5) destroyOrPass(e)
  }

  // Update enemy lasers
  for (const l of [...enemyLasers]) {
    l.mesh.position.addScaledVector(l.dir, l.speed * dt)
    l.glow.position.copy(l.mesh.position)
    l.life -= dt
    // Check if it hits player zone
    if (l.mesh.position.z > 5.5 && Math.abs(l.mesh.position.x) < 4 && Math.abs(l.mesh.position.y + 1) < 3) {
      damageShield(1)
      scene.remove(l.mesh); scene.remove(l.glow)
      enemyLasers.splice(enemyLasers.indexOf(l), 1)
      continue
    }
    if (l.life <= 0 || l.mesh.position.z > 12) {
      scene.remove(l.mesh); scene.remove(l.glow)
      enemyLasers.splice(enemyLasers.indexOf(l), 1)
    }
  }

  // Update player lasers
  for (const l of [...lasers]) {
    l.life -= dt
    const fade = Math.max(0, l.life / .13)
    l.mesh.material.opacity = fade * .95
    l.glow.material.opacity = fade * .18
    if (l.life <= 0) {
      scene.remove(l.mesh); scene.remove(l.glow)
      lasers.splice(lasers.indexOf(l), 1)
    }
  }

  // Update blasts
  for (const b of [...blasts]) {
    b.life -= dt
    b.mesh.scale.multiplyScalar(1 + dt * 5.5)
    b.mesh.material.opacity = Math.max(0, b.life / b.maxLife) * .9
    if (b.life <= 0) { scene.remove(b.mesh); blasts.splice(blasts.indexOf(b), 1) }
  }

  // Update debris
  for (const d of [...debris]) {
    d.life -= dt
    d.mesh.position.addScaledVector(d.vel, dt)
    d.vel.multiplyScalar(0.96)
    d.mesh.rotation.x += d.rotVel.x * dt
    d.mesh.rotation.y += d.rotVel.y * dt
    d.mesh.rotation.z += d.rotVel.z * dt
    d.mesh.material.opacity = Math.max(0, d.life / d.maxLife)
    if (d.life <= 0) { scene.remove(d.mesh); debris.splice(debris.indexOf(d), 1) }
  }

  updateHud()
}

function destroyOrPass(e) {
  scene.remove(e)
  enemies.splice(enemies.indexOf(e), 1)
  damageShield(e.userData.isBoss ? 6 : 1)
}

function updateHud() {
  scoreEl.textContent = state.score.toLocaleString()
  killsEl.textContent = `${Math.min(state.kills, state.targetKills)} / ${state.targetKills}`
  waveEl.textContent  = `${state.round} / ${state.maxRounds}`
  roundEl.textContent = state.round

  const shieldFrac = Math.max(0, 1 - state.shieldHits / state.maxShieldHits)
  const pct = Math.round(shieldFrac * 100)
  shieldPctEl.textContent = `${pct}%`
  hitsEl.textContent = `${state.shieldHits} / ${state.maxShieldHits}`
  if (shieldBarEl) shieldBarEl.style.width = `${pct}%`

  // Shield color
  if (pct < 25) { shieldPctEl.style.color = '#ff3344'; domeRing.material.color.set(0xff3344) }
  else if (pct < 55) { shieldPctEl.style.color = '#ffaa22'; domeRing.material.color.set(0xffaa22) }
  else { shieldPctEl.style.color = ''; domeRing.material.color.set(0x33ff88) }

  if (state.boss) {
    bossBar.style.width = `${Math.max(0, state.boss.userData.health / state.boss.userData.maxHealth * 100)}%`
  }

  // Combo display
  if (comboEl) {
    if (state.combo >= 3) {
      comboEl.textContent = `${state.combo}x COMBO`
      comboEl.style.opacity = '1'
      comboEl.style.transform = `scale(${1 + Math.min(state.combo, 12)*0.04})`
    } else {
      comboEl.style.opacity = '0'
    }
  }
}

// ─── Input ───────────────────────────────────────────────────────────────────
window.addEventListener('pointermove', (e) => {
  pointer.x =  (e.clientX / window.innerWidth)  * 2 - 1
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
  reticle.style.left = `${e.clientX}px`
  reticle.style.top  = `${e.clientY}px`
})
window.addEventListener('pointerdown', fireLaser)
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') restart()
  if (e.code === 'Space') { e.preventDefault(); fireLaser() }
})
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ─── Animate ─────────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(clock.getDelta(), .033)
  if (!state.gameOver) update(dt)
  renderer.render(scene, camera)
}

// Seed initial enemies
for (let i = 0; i < 5; i++) spawnEnemy()
updateHud()
animate()
