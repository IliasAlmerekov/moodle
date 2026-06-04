// Single point of registration for GSAP + ScrollTrigger + the React
// useGSAP hook. Imported by every section that needs GSAP; safe to
// import many times — `gsap.registerPlugin` is idempotent.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

// Re-export so consumers only need a single import path.
export { gsap, ScrollTrigger, useGSAP }

/**
 * Returns true when the user has prefers-reduced-motion: reduce.
 * Safe to call on the server (returns false) and inside effects.
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
