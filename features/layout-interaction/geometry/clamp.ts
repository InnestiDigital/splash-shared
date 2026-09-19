import { BOUNDS_POSITION, BOUNDS_SIZE } from '../constants'
export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)
export const clampPosition = (n: number) => clamp(n, BOUNDS_POSITION.min, BOUNDS_POSITION.max)
export const clampSize = (n: number) => clamp(n, BOUNDS_SIZE.min, BOUNDS_SIZE.max)
