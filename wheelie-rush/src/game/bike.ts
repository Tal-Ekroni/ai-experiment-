/** OWNER: bike-physics agent.
 *  The whole game lives or dies here: balancing a wheelie must feel like holding
 *  a ball on a hill — always drifting, never stable, recoverable with skill. */
import { BikeState, InputState, LANE_W, WIPEOUT_ANGLE, FIXED_DT } from './types'

const BALANCE_POINT = 0.62      // rad; torque-neutral angle
const LIFT_TORQUE = 4.2
const GRAVITY_TORQUE = 5.6
const DAMPING = 1.9
const ACCEL = 5.5
const MAX_SPEED = 34
const LANE_LERP = 9

export function createBike(): BikeState {
  return { pitch: 0, pitchVel: 0, x: 0, z: 0, speed: 12, wheelieTime: 0, crashed: false }
}

export function stepBike(b: BikeState, input: InputState, dt: number = FIXED_DT): void {
  if (b.crashed) return

  // Rider weight shift vs. gravity. Past BALANCE_POINT gravity pulls you over
  // backwards; below it the nose drops. Neither side is stable.
  const gravity = -Math.sin(b.pitch) * GRAVITY_TORQUE
  const lift = input.lean * LIFT_TORQUE
  const restoring = (BALANCE_POINT - b.pitch) * 0.8
  b.pitchVel += (gravity + lift + restoring) * dt
  b.pitchVel -= b.pitchVel * DAMPING * dt
  b.pitch += b.pitchVel * dt

  if (b.pitch < 0) { b.pitch = 0; b.pitchVel = Math.max(0, b.pitchVel) }
  if (b.pitch > WIPEOUT_ANGLE) { b.crashed = true; b.pitch = WIPEOUT_ANGLE }

  // Wheelie = front wheel up. Speed builds only while you hold it.
  const up = b.pitch > 0.18
  b.wheelieTime = up ? b.wheelieTime + dt : 0
  const drag = input.brake ? 14 : 0
  b.speed += ((up ? ACCEL : ACCEL * 0.35) - drag) * dt
  b.speed = Math.max(6, Math.min(MAX_SPEED, b.speed))

  const targetX = Math.max(-1, Math.min(1, input.steer)) * LANE_W
  b.x += (targetX - b.x) * Math.min(1, LANE_LERP * dt)
  b.z += b.speed * dt
}

export function laneOf(x: number): -1 | 0 | 1 {
  if (x < -LANE_W * 0.5) return -1
  if (x > LANE_W * 0.5) return 1
  return 0
}
