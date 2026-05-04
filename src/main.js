import * as THREE from 'three'
import './style.css'

const canvas = document.querySelector('#game')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x02040b)
scene.fog = new THREE.FogExp2(0x02040b, 0.012)

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.set(0, 1.8, 8)
camera.lookAt(0, 1.2, -28)

const clock = new THREE.Clock()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2(0, 0)
let aimWorld = new THREE.Vector3(0, 1.2, -38)

const state = {
  score: 0, round: 1, maxRounds: 3, kills: 0, targetKills: 5,
  shieldHits: 0, maxShieldHits: 30, gameOver: false,
  bossActive: false, boss: null, nextSpawn: 0, lastShot: 0
}

const enemies = []
const lasers = []
const blasts = []

const scoreEl = document.querySelector('#score')
const killsEl = document.querySelector('#kills')
const waveEl = document.querySelector('#wave')
const roundEl = document.querySelector('#round')
const shieldPctEl = document.querySelector('#shieldPct')
const hitsEl = document.querySelector('#hits')
const objectiveEl = document.querySelector('#objective')
const bossHud = document.querySelector('#bossHud')
const bossBar = document.querySelector('#bossBar')
const messageEl = document.querySelector('#message')
const reticle = document.querySelector('#reticle')

// Lights
scene.add(new THREE.HemisphereLight(0x88aaff, 0x08080b, 1.1))
const key = new THREE.DirectionalLight(0x8ecbff, 2.3)
key.position.set(-5, 8, 8)
scene.add(key)
const redGlow = new THREE.PointLight(0xff2030, 3, 80)
redGlow.position.set(0, 3, -30)
scene.add(redGlow)

// Stars / nebula dots
const starGeo = new THREE.BufferGeometry()
const starCount = 1600
const starPos = []
for (let i = 0; i < starCount; i++) {
  starPos.push((Math.random() - 0.5) * 180, (Math.random() - 0.5) * 90, -Math.random() * 220 - 10)
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfe9ff, size: 0.11, transparent: true, opacity: 0.8 }))
scene.add(stars)

function mat(color, rough = 0.45, metal = 0.65) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })
}
const hullMat = mat(0x151b24)
const darkMat = mat(0x080b11)
const blueMat = new THREE.MeshStandardMaterial({ color: 0x0a58ff, emissive: 0x006dff, emissiveIntensity: 2.2 })
const redMat = new THREE.MeshStandardMaterial({ color: 0xff2028, emissive: 0xff1020, emissiveIntensity: 2.5 })
const greenMat = new THREE.MeshStandardMaterial({ color: 0x55ff80, emissive: 0x36ff66, emissiveIntensity: 1.5, transparent: true, opacity: 0.35 })

// Cockpit frame + cannons
const cockpit = new THREE.Group()
function addBox(group, sx, sy, sz, x, y, z, material, rotZ=0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
  m.position.set(x, y, z); m.rotation.z = rotZ; group.add(m); return m
}
addBox(cockpit, 9.5, .35, .45, 0, -1.65, 1.2, hullMat)
addBox(cockpit, .28, 7, .35, -5.7, 1.1, -1.2, hullMat, -0.27)
addBox(cockpit, .28, 7, .35, 5.7, 1.1, -1.2, hullMat, 0.27)
addBox(cockpit, 3.2, .25, .35, -3.8, -1.1, 0, blueMat)
addBox(cockpit, 3.2, .25, .35, 3.8, -1.1, 0, blueMat)

const cannonPositions = [new THREE.Vector3(-3.2, -1.2, 1.7), new THREE.Vector3(3.2, -1.2, 1.7)]
for (const p of cannonPositions) {
  const g = new THREE.Group(); g.position.copy(p); g.lookAt(0, .2, -20)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.16, .24, 3.2, 18), hullMat)
  barrel.rotation.x = Math.PI / 2; g.add(barrel)
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .28, 18), blueMat)
  tip.rotation.x = Math.PI / 2; tip.position.z = -1.65; g.add(tip)
  cockpit.add(g)
}
const dome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), greenMat)
dome.position.set(0, -1.52, .35); dome.scale.set(1.25, .65, .65); cockpit.add(dome)
scene.add(cockpit)

function createEnemy(isBoss=false) {
  const g = new THREE.Group()
  g.userData.isBoss = isBoss
  g.userData.maxHealth = isBoss ? 40 + state.round * 25 : 2 + Math.floor(state.round / 2)
  g.userData.health = g.userData.maxHealth
  g.userData.speed = isBoss ? 5 : 10 + state.round * 1.5 + Math.random() * 3
  g.userData.wobble = Math.random() * 10
  const s = isBoss ? 2.7 : 1
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.75 * s, 1), hullMat)
  body.scale.set(1.2, .55, 1.8); g.add(body)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.42 * s, 1.1 * s, 4), darkMat)
  nose.rotation.x = Math.PI / 2; nose.position.z = .9 * s; g.add(nose)
  const core = new THREE.Mesh(new THREE.SphereGeometry(.22 * s, 18, 18), redMat)
  core.position.z = .95 * s; g.add(core)
  const wingGeo = new THREE.BoxGeometry(1.7 * s, .12 * s, .45 * s)
  const leftWing = new THREE.Mesh(wingGeo, hullMat); leftWing.position.set(-.9*s, 0, -.15*s); leftWing.rotation.z = .25; g.add(leftWing)
  const rightWing = new THREE.Mesh(wingGeo, hullMat); rightWing.position.set(.9*s, 0, -.15*s); rightWing.rotation.z = -.25; g.add(rightWing)
  const engine1 = new THREE.Mesh(new THREE.SphereGeometry(.16*s, 12, 12), redMat); engine1.position.set(-.42*s, 0, -1.05*s); g.add(engine1)
  const engine2 = engine1.clone(); engine2.position.x = .42*s; g.add(engine2)
  g.userData.hitRadius = isBoss ? 2.8 : 1.1
  scene.add(g)
  return g
}

function spawnEnemy() {
  if (state.gameOver || state.bossActive) return
  const e = createEnemy(false)
  // Wider angle: spawn across much more of the view, including high/low lanes.
  e.position.set((Math.random() - .5) * 22, Math.random() * 9 - 2.5, -70 - Math.random() * 35)
  e.rotation.y = Math.random() * .8 - .4
  enemies.push(e)
}

function spawnBoss() {
  state.bossActive = true
  const b = createEnemy(true)
  b.position.set(0, 1.4, -85)
  b.userData.speed = 2.8
  state.boss = b
  enemies.push(b)
  bossHud.classList.remove('hidden')
  objectiveEl.textContent = 'Destroy the boss'
}

function fireLaser() {
  const now = performance.now()
  if (now - state.lastShot < 120 || state.gameOver) return
  state.lastShot = now

  for (const p of cannonPositions) {
    const start = p.clone().add(new THREE.Vector3(0,0,-.7))
    const end = aimWorld.clone()
    const mid = start.clone().lerp(end, .5)
    const len = start.distanceTo(end)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, len, 10), new THREE.MeshBasicMaterial({ color: 0x24a7ff, transparent: true, opacity: .95 }))
    beam.position.copy(mid)
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), end.clone().sub(start).normalize())
    scene.add(beam)
    lasers.push({ mesh: beam, life: .12 })
  }

  raycaster.setFromCamera(pointer, camera)
  let best = null, bestDist = Infinity
  for (const e of enemies) {
    const dist = raycaster.ray.distanceToPoint(e.position)
    if (dist < e.userData.hitRadius && e.position.z < 6 && dist < bestDist) { best = e; bestDist = dist }
  }
  if (best) damageEnemy(best)
}

function damageEnemy(e) {
  e.userData.health -= 1
  flash(e.position, e.userData.isBoss ? 1.2 : .55)
  e.scale.multiplyScalar(1.06)
  setTimeout(() => e.scale.multiplyScalar(.943), 50)
  if (e.userData.health <= 0) destroyEnemy(e)
}
function destroyEnemy(e) {
  flash(e.position, e.userData.isBoss ? 3 : 1.1, 0xff7a1a)
  scene.remove(e)
  enemies.splice(enemies.indexOf(e), 1)
  if (e.userData.isBoss) {
    state.score += 2500
    state.bossActive = false
    state.boss = null
    bossHud.classList.add('hidden')
    state.shieldHits = Math.max(0, state.shieldHits - 12)
    if (state.round >= state.maxRounds) win()
    else { state.round++; state.kills = 0; state.targetKills = [5,10,15][state.round-1]; objectiveEl.textContent = `Destroy ${state.targetKills} enemies` }
  } else {
    state.score += 100
    state.kills++
    if (state.kills >= state.targetKills && !state.bossActive) spawnBoss()
  }
}

function flash(pos, size=1, color=0xff4818) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9 }))
  m.position.copy(pos); scene.add(m); blasts.push({ mesh: m, life: .35, size })
}

function damageShield(amount=1) {
  state.shieldHits += amount
  document.body.classList.add('hit'); setTimeout(()=>document.body.classList.remove('hit'), 80)
  if (state.shieldHits > state.maxShieldHits) {
    state.gameOver = true
    messageEl.textContent = 'SHIP DESTROYED — Press R to restart'
  }
}
function win() { state.gameOver = true; messageEl.textContent = 'YOU CLEARED ALL WAVES — Press R to restart' }
function restart() { window.location.reload() }

function update(dt) {
  const t = clock.elapsedTime
  stars.rotation.z += dt * .006
  cockpit.position.x += (pointer.x * .18 - cockpit.position.x) * .07
  cockpit.rotation.y = pointer.x * .025
  cockpit.rotation.x = -pointer.y * .015
  dome.material.opacity = .12 + (1 - state.shieldHits/state.maxShieldHits) * .35
  dome.scale.setScalar(1 + (1 - state.shieldHits/state.maxShieldHits) * .15)

  const aimPlaneZ = -38
  const dir = new THREE.Vector3(pointer.x, pointer.y, .5).unproject(camera).sub(camera.position).normalize()
  const dist = (aimPlaneZ - camera.position.z) / dir.z
  aimWorld = camera.position.clone().add(dir.multiplyScalar(dist))

  state.nextSpawn -= dt
  if (!state.bossActive && state.kills < state.targetKills && state.nextSpawn <= 0) {
    spawnEnemy(); state.nextSpawn = Math.max(.45, 1.25 - state.round * .18)
  }

  for (const e of [...enemies]) {
    const boss = e.userData.isBoss
    if (!boss) {
      e.position.z += e.userData.speed * dt
      e.position.x += Math.sin(t * 1.6 + e.userData.wobble) * dt * 1.5
      e.position.y += Math.cos(t * 1.2 + e.userData.wobble) * dt * .45
    } else {
      e.position.z += e.userData.speed * dt
      e.position.x = Math.sin(t * .7) * 3.6
      e.position.y = 1.4 + Math.cos(t * .9) * .65
      if (Math.random() < dt * 1.0) damageShield(1)
    }
    e.lookAt(camera.position)
    if (e.position.z > 7) { destroyOrPass(e) }
  }
  for (const l of [...lasers]) { l.life -= dt; l.mesh.material.opacity = Math.max(0, l.life / .12); if (l.life <= 0) { scene.remove(l.mesh); lasers.splice(lasers.indexOf(l),1) } }
  for (const b of [...blasts]) { b.life -= dt; b.mesh.scale.multiplyScalar(1 + dt * 5); b.mesh.material.opacity = Math.max(0, b.life / .35); if (b.life <= 0) { scene.remove(b.mesh); blasts.splice(blasts.indexOf(b),1) } }
  updateHud()
}
function destroyOrPass(e) {
  scene.remove(e); enemies.splice(enemies.indexOf(e),1); damageShield(e.userData.isBoss ? 5 : 1)
}
function updateHud() {
  scoreEl.textContent = state.score.toLocaleString()
  killsEl.textContent = `${Math.min(state.kills, state.targetKills)} / ${state.targetKills}`
  waveEl.textContent = `${state.round} / ${state.maxRounds}`
  roundEl.textContent = state.round
  const pct = Math.max(0, Math.round((1 - state.shieldHits/state.maxShieldHits) * 100))
  shieldPctEl.textContent = `${pct}%`; hitsEl.textContent = `${state.shieldHits} / ${state.maxShieldHits} hits`
  if (state.boss) bossBar.style.width = `${Math.max(0, state.boss.userData.health / state.boss.userData.maxHealth * 100)}%`
}

window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
  reticle.style.left = `${e.clientX}px`; reticle.style.top = `${e.clientY}px`
})
window.addEventListener('pointerdown', fireLaser)
window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'r') restart(); if (e.code === 'Space') fireLaser() })
window.addEventListener('resize', () => { camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight) })

function animate() { requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), .033); if (!state.gameOver) update(dt); renderer.render(scene, camera) }
for (let i=0;i<4;i++) spawnEnemy()
updateHud(); animate()
