/** OWNER: art agent. HARD RULE: zero external asset files. Every mesh, material
 *  and texture is generated in code. Keep the Renderer surface (constructor,
 *  sync, resize, frame, pick) intact — main.ts and interact.ts depend on it. */
import * as THREE from 'three'
import { TreeState, Segment } from './types'
import { extension } from './growth'
import { paletteAt } from './sky'

const UP = new THREE.Vector3(0, 1, 0)

export class Renderer {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private gl: THREE.WebGLRenderer
  private branches: THREE.InstancedMesh
  private leaves: THREE.InstancedMesh
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private ground: THREE.Mesh
  private lightMarker: THREE.Mesh
  /** Maps an instance slot back to a segment id, so taps can hit a branch. */
  private slotToSegment: number[] = []
  private static MAX = 4096

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.gl.shadowMap.enabled = true
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200)
    this.camera.position.set(4.2, 3.0, 5.2)
    this.camera.lookAt(0, 1.9, 0)

    this.sun = new THREE.DirectionalLight(0xffffff, 2.6)
    this.sun.position.set(5, 9, 4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.hemi = new THREE.HemisphereLight(0x9dbede, 0x2f3a2c, 0.8)
    this.scene.add(this.sun, this.hemi)

    // A branch is a unit cylinder along +Y, scaled and oriented per instance.
    const branchGeo = new THREE.CylinderGeometry(0.7, 1, 1, 6, 1)
    branchGeo.translate(0, 0.5, 0)
    this.branches = new THREE.InstancedMesh(
      branchGeo,
      new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.9 }),
      Renderer.MAX,
    )
    this.branches.castShadow = true
    this.branches.frustumCulled = false

    const leafGeo = new THREE.PlaneGeometry(0.34, 0.34)
    this.leaves = new THREE.InstancedMesh(
      leafGeo,
      new THREE.MeshStandardMaterial({
        color: 0x7fc45a, roughness: 0.75, side: THREE.DoubleSide,
      }),
      Renderer.MAX,
    )
    this.leaves.frustumCulled = false
    this.scene.add(this.branches, this.leaves)

    this.ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x2f3a2c, roughness: 1 }),
    )
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true

    this.lightMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    )
    this.scene.add(this.ground, this.lightMarker)
  }

  sync(t: TreeState): void {
    const pal = paletteAt(t.age)
    this.scene.background = new THREE.Color(pal.skyBottom)
    this.scene.fog = new THREE.Fog(pal.fog, 12, 42)
    this.sun.color.setHex(pal.sun)
    this.hemi.color.setHex(pal.ambient)
    ;(this.branches.material as THREE.MeshStandardMaterial).color.setHex(pal.bark)
    ;(this.leaves.material as THREE.MeshStandardMaterial).color.setHex(pal.leaf)
    ;(this.ground.material as THREE.MeshStandardMaterial).color.setHex(pal.ground)

    this.lightMarker.position.set(t.light.x * 3, t.light.y * 3, t.light.z * 3)

    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const dir = new THREE.Vector3()
    const pos = new THREE.Vector3()
    let bi = 0
    let li = 0
    this.slotToSegment.length = 0

    for (const s of t.segments) {
      const ext = extension(s, t.age)
      if (ext <= 0 || bi >= Renderer.MAX) continue
      dir.set(s.dir.x, s.dir.y, s.dir.z).normalize()
      q.setFromUnitVectors(UP, dir)
      pos.set(s.origin.x, s.origin.y, s.origin.z)
      m.compose(pos, q, new THREE.Vector3(s.radius, s.length * ext, s.radius))
      this.branches.setMatrixAt(bi, m)
      this.slotToSegment[bi] = s.id
      bi++

      if (s.leafy && ext > 0.55 && li < Renderer.MAX) {
        const tip = pos.clone().addScaledVector(dir, s.length * ext)
        m.compose(tip, q, new THREE.Vector3(1, 1, 1))
        this.leaves.setMatrixAt(li, m)
        li++
      }
    }
    this.branches.count = bi
    this.leaves.count = li
    this.branches.instanceMatrix.needsUpdate = true
    this.leaves.instanceMatrix.needsUpdate = true
  }

  /** Ray-pick a branch from normalised device coords. Returns a segment id or -1. */
  pick(ndcX: number, ndcY: number, segments: Segment[]): number {
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const hit = ray.intersectObject(this.branches, false)[0]
    if (!hit || hit.instanceId === undefined) return -1
    const id = this.slotToSegment[hit.instanceId]
    return segments.some((s) => s.id === id) ? id : -1
  }

  resize(w: number, h: number): void {
    this.gl.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  frame(): void { this.gl.render(this.scene, this.camera) }
}
