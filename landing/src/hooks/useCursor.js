// useCursor — the single source of truth for all cursor-reactive
// motion in the landing page.
//
// Strategy: instead of wiring every section to its own mousemove
// listener (and re-rendering React on every move), we use GSAP's
// `quickTo` — a closure that reuses a single tween per property,
// writes only to CSS custom properties or element transforms, and
// never causes a React re-render. Sections opt in declaratively via
// `data-cursor="<type>"` on their elements; the hook attaches a
// local listener for spotlight / magnetic effects.
//
// Types:
//   - "link"      → dot scales 1.4× on hover (no per-element move)
//   - "card"      → ring becomes visible, --spot-x/y drives a CSS
//                   radial-gradient; --cursor-tint defaults to brand
//                   orange but can be overridden per-card via
//                   data-cursor-color="success" | "info" | "warning"
//   - "magnetic"  → the element itself translates up to ±20px toward
//                   the cursor with elastic ease
//   - "code"      → like "card" but for the CTA code block; uses
//                   --code-spot-x/y (orange-tinted)
//   - "wordmark"  → the nav wordmark; --wordmark-tilt is set in deg
//   - "dot"       → the progress stepper dot; uses --spot-x/y with
//                   a tighter, brighter orange glow
//
// Touch devices (Observer.isTouch === 1) and reduced-motion users
// get an inactive hook — no listeners, no quickTo, dot stays hidden.

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Observer } from 'gsap/Observer'
import { prefersReducedMotion } from '../lib/gsap.js'

// Map data-cursor-color attribute values to CSS vars the cursor.css
// file understands. Kept tiny so we don't grow a colour system in
// two places.
const TINT_VARS = {
  primary: 'var(--moodle-primary)',
  success: 'var(--moodle-success)',
  info: 'var(--moodle-info)',
  warning: 'var(--moodle-text)',
}

const SPOTLIGHT_TINT = {
  card: TINT_VARS.primary,
  code: TINT_VARS.primary,
  dot: TINT_VARS.primary,
}
// Spotlight ring diameter. Picked to be a *visible* but not
// dominant glow — a 220px ring looks like a soft flashlight cone,
// 90px reads as a tight hot-spot, 60px is barely a halo. We sit
// in the middle: small enough to feel like a precision cursor,
// large enough to land the "the page is alive" intent.
const SPOTLIGHT_RADIUS = {
  card: '140px',
  code: '160px',
  dot: '60px',
}

export function useCursor() {
  // Refs are kept on a single object so the cleanup function can
  // reach into them without forcing the consumer to thread them
  // through.
  const state = useRef({
    quickX: null,
    quickY: null,
    quickScale: null,
    quickRotate: null,
    dot: null,
    ring: null,
    activeEl: null,
    activeType: null,
    activeTint: TINT_VARS.primary,
    // QuickTo closures for the active magnetic element. Rebound on
    // hover changes — cheaper than one pair per element when only
    // one is hovered at a time. Card / code / dot don't need any
    // quickTo: the spotlight follows the cursor via CSS custom
    // properties (--spot-x / --spot-y) written directly from
    // mousemove.
    magXTo: null,
    magYTo: null,
    attached: new Map(), // element → { type, onEnter, onLeave, onMove, cleanup }
  })

  useEffect(() => {
    if (prefersReducedMotion()) return undefined
    // Observer ships with the core gsap bundle; importing here keeps
    // the bundle light (this file is only touched on mount).
    if (Observer.isTouch === 1) return undefined

    const s = state.current
    // Look up the DOM elements the <Cursor /> component will mount.
    // We do this in useEffect (not in the hook init) because the
    // Cursor component renders first, then this effect runs.
    s.dot = document.querySelector('.cursor--dot')
    s.ring = document.querySelector('.cursor--ring')
    if (!s.dot || !s.ring) return undefined

    // Make the cursor visible. The CSS hides it by default (display:none)
    // until the JS attaches. The dot is visible from the start of the
    // page; the ring is opt-in per hovered element.
    s.dot.style.display = 'block'
    s.ring.style.display = 'block'

    // 1) Always-on position tweens for the dot. quickTo reuses a
    //    single tween, so the mousemove handler is essentially free.
    s.quickX = gsap.quickTo(s.dot, 'x', {
      duration: 0.18,
      ease: 'power3.out',
    })
    s.quickY = gsap.quickTo(s.dot, 'y', {
      duration: 0.18,
      ease: 'power3.out',
    })
    // Mirror the position onto the ring with a slightly longer
    // duration so the ring lags a hair — feels like a soft spotlight
    // trailing the dot.
    s.quickScale = gsap.quickTo(s.dot, 'scale', {
      duration: 0.25,
      ease: 'power3.out',
    })
    s.quickRotate = gsap.quickTo(s.dot, 'rotation', {
      duration: 0.4,
      ease: 'power3.out',
    })

    // 2) One global mousemove — updates the dot position only.
    //    The ring and per-element effects are driven by the per-
    //    element `attach()` handlers.
    let lastClientX = 0
    let lastClientY = 0
    const onGlobalMove = (e) => {
      lastClientX = e.clientX
      lastClientY = e.clientY
      s.quickX(e.clientX)
      s.quickY(e.clientY)
      // Keep the ring on the same position as the dot. We write the
      // CSS var directly so the per-element spotlight radial-gradient
      // can read it (the ring's own transform is updated by the
      // active element's quickTo so it trails the dot for the
      // soft-spotlight effect).
      s.ring.style.setProperty('--mx', `${e.clientX}px`)
      s.ring.style.setProperty('--my', `${e.clientY}px`)
    }
    window.addEventListener('mousemove', onGlobalMove, { passive: true })

    // 3) setActive — switch the type of the currently hovered element.
    //    Sets scale, ring visibility, and tint.
    const setActive = (el, type) => {
      s.activeEl = el
      s.activeType = type
      s.quickScale(1.4)

      const tintAttr = el.getAttribute('data-cursor-color')
      s.activeTint = TINT_VARS[tintAttr] || SPOTLIGHT_TINT[type] || TINT_VARS.primary
      s.ring.style.setProperty('--cursor-tint', s.activeTint)
      s.ring.style.setProperty(
        '--cursor-radius',
        SPOTLIGHT_RADIUS[type] || SPOTLIGHT_RADIUS.card,
      )
      s.ring.classList.add('is-spotlight')

      // Bind quickTo closures for the active element type. The
      // element's own CSS uses --spot-x / --spot-y (and --rx / --ry
      // for tilt) — we write those custom properties directly from
      // the mousemove handler, so we never animate `xPercent` /
      // `yPercent` on the element itself. Animating those would
      // *move the card* toward the cursor, which is not what we
      // want for `card` / `code` / `dot` (the spotlight is supposed
      // to follow the cursor *inside* the card, not drag the card
      // with the cursor).
      if (type === 'magnetic') {
        s.magXTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.3)' })
        s.magYTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.3)' })
      } else if (type === 'wordmark') {
        s.quickRotate(0) // reset first frame
      }
      // No quickTo for card / code / dot — the CSS-variable writes
      // in onPointerMove are enough, and the radial-gradient reads
      // --spot-x / --spot-y without forcing a layout.
    }
    const clearActive = (el) => {
      if (s.activeEl !== el) return
      s.activeEl = null
      s.activeType = null
      s.quickScale(1)
      s.quickRotate(0)
      s.ring.classList.remove('is-spotlight')
      // Snap magnetic elements back home.
      if (el && s.magXTo) {
        s.magXTo(0)
        s.magYTo(0)
      }
      // Reset tilt on any data-tilt element inside the leaving tree.
      if (el) {
        const tiltEls = el.querySelectorAll?.('[data-tilt]') ?? []
        if (el.matches?.('[data-tilt]')) tiltEls.push(el)
        tiltEls.forEach((node) => {
          node.style.setProperty('--rx', '0deg')
          node.style.setProperty('--ry', '0deg')
        })
      }
    }

    // 4) Wire up per-element listeners via event delegation. We
    //    listen on the document for mouseover/mouseout and filter
    //    by the data-cursor attribute. This is the cheapest way to
    //    support many opt-in elements without attaching a listener
    //    per element.
    const findOptIn = (target) => {
      if (!(target instanceof Element)) return null
      // Walk up until we find an element with data-cursor, or hit
      // the document. Closest-ancestor lets nested elements (a span
      // inside an <a>) opt-in via the parent.
      return target.closest('[data-cursor]')
    }
    const onPointerOver = (e) => {
      const el = findOptIn(e.target)
      if (!el) return
      const type = el.getAttribute('data-cursor')
      if (!type) return
      setActive(el, type)
    }
    const onPointerOut = (e) => {
      const el = findOptIn(e.target)
      if (!el) return
      // Verify we're really leaving (not just crossing a child).
      const related = e.relatedTarget
      if (related instanceof Element && el.contains(related)) return
      clearActive(el)
    }
    const onPointerMove = (e) => {
      const el = findOptIn(e.target)
      if (!el || el !== s.activeEl) return
      const type = s.activeType

      if (type === 'magnetic' && s.magXTo) {
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        // Strength 0.3, capped at ±20px by the soft-clamp below.
        const dx = (e.clientX - cx) * 0.3
        const dy = (e.clientY - cy) * 0.3
        s.magXTo(Math.max(-20, Math.min(20, dx)))
        s.magYTo(Math.max(-20, Math.min(20, dy)))
      } else if (type === 'wordmark') {
        // Tilt the wordmark ±6deg based on cursor X relative to its
        // centre. The CSS reads --wordmark-tilt on the element.
        const r = el.getBoundingClientRect()
        const ratio = ((e.clientX - r.left) / r.width - 0.5) * 2
        const tilt = ratio * 6
        el.style.setProperty('--wordmark-tilt', `${tilt}deg`)
        s.quickRotate(0)
      } else {
        // Card / code / dot: convert cursor position to a 0..100%
        // coordinate inside the element so a CSS radial-gradient
        // can place the glow under the cursor. We write the CSS
        // custom properties directly — no transform on the element
        // itself, otherwise the card would follow the pointer.
        const r = el.getBoundingClientRect()
        const xPct = ((e.clientX - r.left) / r.width) * 100
        const yPct = ((e.clientY - r.top) / r.height) * 100
        el.style.setProperty('--spot-x', `${xPct}%`)
        el.style.setProperty('--spot-y', `${yPct}%`)
      }
      // 3D-tilt: any element with data-tilt gets rotateX / rotateY
      // written to --rx / --ry. The CSS for that selector reads
      // those vars on its transform. The walk up the DOM tree
      // handles nested opt-ins (a child of a tilted card).
      let tiltEl = el
      while (tiltEl && tiltEl !== document.body) {
        if (tiltEl.matches?.('[data-tilt]')) {
          const tr = tiltEl.getBoundingClientRect()
          const ratioX = ((e.clientX - tr.left) / tr.width - 0.5) * 2
          const ratioY = ((e.clientY - tr.top) / tr.height - 0.5) * 2
          tiltEl.style.setProperty('--ry', `${ratioX * 6}deg`)
          tiltEl.style.setProperty('--rx', `${ratioY * -6}deg`)
          break
        }
        tiltEl = tiltEl.parentElement
      }
    }
    document.addEventListener('mouseover', onPointerOver, { passive: true })
    document.addEventListener('mouseout', onPointerOut, { passive: true })
    document.addEventListener('mousemove', onPointerMove, { passive: true })

    return () => {
      window.removeEventListener('mousemove', onGlobalMove)
      document.removeEventListener('mouseover', onPointerOver)
      document.removeEventListener('mouseout', onPointerOut)
      document.removeEventListener('mousemove', onPointerMove)
      // Hide the dot when the hook unmounts (route change in SPA).
      if (s.dot) s.dot.style.display = 'none'
      if (s.ring) s.ring.style.display = 'none'
      // Kill tweens to release their closures.
      if (s.quickX) s.quickX.tween?.kill()
      if (s.quickY) s.quickY.tween?.kill()
      if (s.quickScale) s.quickScale.tween?.kill()
      if (s.quickRotate) s.quickRotate.tween?.kill()
      s.attached.clear()
    }
  }, [])

  // isActive: the consumer (Cursor.jsx) uses this to decide whether
  // to render the dot/ring at all. We just expose the initial value
  // based on the same checks.
  const isActive =
    typeof window !== 'undefined' &&
    Observer.isTouch !== 1 &&
    !prefersReducedMotion()

  return { isActive }
}
