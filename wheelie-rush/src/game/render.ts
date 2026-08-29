/** OWNER: art/render agent. HARD RULE: zero external asset files. Every mesh,
 *  material and texture is generated in code. Upgrade freely, but keep the
 *  Renderer class surface (constructor, sync, frame) intact. */
import * as THREE from 'three'
import { World, LANE_W, WIPEOUT_ANGLE } from './types'
import { TrackChunk, CHUNK_LEN } from './track'

export class Renderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private gl: THREE.WebGLRenderer
  private bike = new THREE.Group()
  private frontWheel = new THREE.Mesh()
  private ground: THREE.Mesh
  private obstaclePool: THREE.Mesh[] = []
  private chunkPool: THREE.Mesh[] = []

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.gl.setPixelRatio(1)
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap

    this.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400)
    this.scene.background = new THREE.Color(0x11131f)
    this.scene.fog = new THREE.Fog(0x11131f, 60, 220)

    const key = new THREE.DirectionalLight(0xfff0dd, 2.4)
    key.position.set(-14, 26, 10)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    this.scene.add(key, new THREE.HemisphereLight(0x88aaff, 0x221a12, 0.7))

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 1200),
      new THREE.MeshStandardMaterial({ color: 0x2a2b38, roughness: 0.95 }),
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.scene.add(this.ground)

    this.buildBike()
    this.scene.add(this.bike)
  }

  private buildBike(): void {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 1.9),
      new THREE.MeshStandardMaterial({ color: 0xd8452f, roughness: 0.35, metalness: 0.6 }),
    )
    body.position.y = 0.72
    body.castShadow = true

    const wheelGeo = new THREE.TorusGeometry(0.42, 0.13, 12, 28)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.8 })
    const rear = new THREE.Mesh(wheelGeo, wheelMat)
    rear.position.set(0, 0.42, -0.8)
    rear.castShadow = true
    this.frontWheel = new THREE.Mesh(wheelGeo, wheelMat)
    this.frontWheel.position.set(0, 0.42, 0.9)
    this.frontWheel.castShadow = true

    const rider = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.55, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x2f6fd8, roughness: 0.6 }),
    )
    rider.position.set(0, 1.35, -0.15)
    rider.castShadow = true

    this.bike.add(body, rear, this.frontWheel, rider)
  }

  /** Rebuild transient visuals from the sim. Pure read of `world`. */
  sync(world: World, chunks: TrackChunk[]): void {
    const b = world.bike
    // Pivot around the rear contact patch so a wheelie reads correctly.
    this.bike.position.set(b.x, 0, b.z)
    this.bike.rotation.x = -b.pitch
    if (b.crashed) this.bike.rotation.z = Math.min(1.4, this.bike.rotation.z + 0.06)

    this.ground.position.z = b.z

    this.ensurePool(this.obstaclePool, world.obstacles.length, () => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xe0b341, roughness: 0.5 }),
      )
      m.castShadow = true
      this.scene.add(m)
      return m
    })
    world.obstacles.forEach((o, i) => {
      const m = this.obstaclePool[i]
      m.visible = !o.dead
      m.position.set(o.lane * LANE_W, o.kind === 'lowbar' ? 1.7 : 0.5, o.z)
      const mat = m.material as THREE.MeshStandardMaterial
      mat.color.setHex(o.kind === 'coin' ? 0xffd34d : o.kind === 'lowbar' ? 0xc94f4f : 0x8a8f9e)
    })
    for (let i = world.obstacles.length; i < this.obstaclePool.length; i++) {
      this.obstaclePool[i].visible = false
    }

    this.ensurePool(this.chunkPool, chunks.length, () => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(2, 8, CHUNK_LEN * 0.9),
        new THREE.MeshStandardMaterial({ color: 0x3a3d4d, roughness: 0.9 }),
      )
      this.scene.add(m)
      return m
    })
    chunks.forEach((c, i) => {
      const m = this.chunkPool[i]
      m.visible = true
      m.position.set(-8.5, 4, c.z)
    })
    for (let i = chunks.length; i < this.chunkPool.length; i++) this.chunkPool[i].visible = false

    // Chase camera. Rises with the wheelie so the horizon tilts into the trick.
    const lead = 1 - b.pitch / WIPEOUT_ANGLE
    this.camera.position.set(b.x * 0.5, 3.1 + b.pitch * 1.6, b.z - 7.5)
    this.camera.lookAt(b.x * 0.7, 1.2 + b.pitch * 1.1, b.z + 8 * lead)
  }

  private ensurePool(pool: THREE.Mesh[], n: number, make: () => THREE.Mesh): void {
    while (pool.length < n) pool.push(make())
  }

  resize(w: number, h: number): void {
    this.gl.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  frame(): void { this.gl.render(this.scene, this.camera) }
}
