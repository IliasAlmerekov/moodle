import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap.js'
import ChatDemo from './ChatDemo.jsx'
import { HERO_SCRIPTS } from '../data.js'

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
}

/**
 * Animates a numeric value from 0 to `target` once the element scrolls
 * into view. Uses rAF + ease-out cubic so the count feels snappy and
 * finishes in ~1.5 s. Respects `prefers-reduced-motion` (skips the count
 * and renders the final value immediately).
 */
function useCountUp(target, { duration = 1500, start = 0 } = {}) {
  const [value, setValue] = useState(start)
  const ref = useRef(null)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return undefined
    const el = ref.current
    if (!el) return undefined

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setValue(target)
      hasRun.current = true
      return undefined
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasRun.current) return
        hasRun.current = true
        const t0 = performance.now()
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / duration)
          // ease-out cubic
          const eased = 1 - Math.pow(1 - p, 3)
          setValue(Math.round(start + (target - start) * eased))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        io.disconnect()
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [target, duration, start])

  return [value, ref]
}

function CountUp({ target, suffix = '' }) {
  const [value, ref] = useCountUp(target)
  return (
    <span ref={ref} className="hero__proof-num">
      {value}
      {suffix}
    </span>
  )
}

export default function Hero() {
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const reduce = useReducedMotion()

  // Cursor-reactive parallax on the five proof-grid items. Each
  // item gets its own quickTo closure with a deliberately varied
  // speed factor (0.05 / 0.10 / 0.15 / 0.20 / 0.08) so they move
  // out of phase and the grid feels alive, not in lockstep. Items
  // translate vertically only — the grid alignment stays intact.
  useGSAP(
    () => {
      if (reduce || prefersReducedMotion()) return undefined
      const el = sectionRef.current
      if (!el) return undefined
      const items = el.querySelectorAll('.hero__proof-item')
      if (items.length === 0) return undefined
      const factors = [0.05, 0.10, 0.15, 0.20, 0.08]
      const yTos = Array.from(items, (node) =>
        gsap.quickTo(node, 'y', { duration: 0.6, ease: 'power3.out' }),
      )
      const onMove = (e) => {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dy = (e.clientY - cy) * 0.4
        items.forEach((node, i) => {
          yTos[i](dy * factors[i])
        })
        // Suppress lint for cx — used by some builds; keep behaviour local.
        void cx
      }
      el.addEventListener('mousemove', onMove, { passive: true })
      const onLeave = () => items.forEach((_, i) => yTos[i](0))
      el.addEventListener('mouseleave', onLeave, { passive: true })
      return () => {
        el.removeEventListener('mousemove', onMove)
        el.removeEventListener('mouseleave', onLeave)
        yTos.forEach((t) => t.tween?.kill())
      }
    },
    { scope: sectionRef },
  )

  return (
    <section className="hero" id="top" ref={sectionRef}>
      <div className="wrap hero__inner">
        <motion.div
          className="hero__copy"
          variants={container}
          initial="hidden"
          animate="show"
        >
          <motion.span className="hero__pill" variants={item}>
            Built for Moodle 4.4 · runs on your own server
          </motion.span>

          <motion.h1 className="hero__title" variants={item}>
            A tutor that lives{' '}
            <span className="hero__hl">inside Moodle</span>
            {' '}and never leaks a byte.
          </motion.h1>

          <motion.p className="hero__lede" variants={item}>
            Students ask in plain language. The assistant searches their
            own course catalogue and answers with a local LLM — streamed
            in real time.
          </motion.p>

          <motion.div className="hero__actions" variants={item}>
            <a href="#demo" className="btn btn-primary" data-cursor="magnetic">
              Try the live demo
            </a>
            <a href="#architecture" className="btn btn-outline-secondary" data-cursor="magnetic">
              See the architecture
            </a>
          </motion.div>

          <motion.dl className="hero__proof" variants={item}>
            <div className="hero__proof-item">
              <dt><CountUp target={4} /></dt>
              <dd>Clean Architecture layers, inward-only deps</dd>
            </div>
            <div className="hero__proof-item">
              <dt><CountUp target={1} /></dt>
              <dd>command to bring up the full stack</dd>
            </div>
            <div className="hero__proof-item">
              <dt><CountUp target={417} /></dt>
              <dd>unit, integration and a11y tests</dd>
            </div>
            <div className="hero__proof-item hero__proof-item--zero">
              <dt>0 / 0</dt>
              <dd>npm audit vulnerabilities</dd>
            </div>
            <div className="hero__proof-item hero__proof-item--zero">
              <dt>0&nbsp;bytes</dt>
              <dd>of student data leaving the host</dd>
            </div>
          </motion.dl>
        </motion.div>

        <motion.div
          className="hero__stage"
          ref={stageRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        >
          <ChatDemo compact scripts={HERO_SCRIPTS} />
        </motion.div>
      </div>
    </section>
  )
}
