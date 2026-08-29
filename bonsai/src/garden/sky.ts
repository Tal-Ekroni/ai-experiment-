/** OWNER: atmosphere agent. Sky, season palette, day/night, lighting mood.
 *  All colours are computed — no gradient textures ship. */
import { Season, seasonAt, seasonPhase } from './types'

export interface Palette {
  skyTop: number; skyBottom: number; sun: number; ambient: number
  bark: number; leaf: number; ground: number; fog: number
}

const SEASON: Record<Season, Omit<Palette, 'skyTop' | 'skyBottom' | 'fog'>> = {
  spring: { sun: 0xfff2d8, ambient: 0x9dbede, bark: 0x5b4636, leaf: 0x7fc45a, ground: 0x2f3a2c },
  summer: { sun: 0xfff6e0, ambient: 0x8fb6e8, bark: 0x54402f, leaf: 0x3f8f3a, ground: 0x2b3628 },
  autumn: { sun: 0xffd9a0, ambient: 0xb9a08a, bark: 0x4d3a2b, leaf: 0xd4762a, ground: 0x3a2f22 },
  winter: { sun: 0xdfe8ff, ambient: 0x9fb3cc, bark: 0x413428, leaf: 0x9aa6ad, ground: 0x36393c },
}

/** 0 = midnight, 0.5 = noon. */
export function timeOfDay(age: number): number { return (age % 120) / 120 }

export function paletteAt(age: number): Palette {
  const s = SEASON[seasonAt(age)]
  const t = timeOfDay(age)
  const day = Math.max(0, Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5)
  const night = 1 - day
  const mix = (a: number, b: number, k: number) => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
    return (((ar + (br - ar) * k) | 0) << 16) | (((ag + (bg - ag) * k) | 0) << 8) | ((ab + (bb - ab) * k) | 0)
  }
  return {
    ...s,
    sun: mix(s.sun, 0x2a3350, night * 0.8),
    ambient: mix(s.ambient, 0x141c2c, night * 0.85),
    skyTop: mix(0x4a7fc0, 0x070b16, night),
    skyBottom: mix(0xcfe0ee, 0x141a2a, night),
    fog: mix(0xcfe0ee, 0x0d1220, night),
  }
}

export { seasonAt, seasonPhase }
