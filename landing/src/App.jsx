import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'

import './App.css'
import './cursor.css'

import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from './lib/gsap.js'
import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import ChatDemo from './components/ChatDemo.jsx'
import Reveal from './components/Reveal.jsx'
import MoodleWordmark from './components/MoodleWordmark.jsx'
import Cursor from './components/Cursor.jsx'
import {
  PROGRESS,
  ARCHITECTURE_NODES,
  ARCHITECTURE_EDGES,
  GITHUB_REPO_URL,
  THREAT_MODEL,
  HERO_SCRIPTS,
  SCREENSHOTS,
} from './data.js'

export default function App() {
  return (
    <>
      <Cursor />
      <Nav />
      <main>
        <Hero />
        <Progress />
        <DemoFull />
        <Screenshots />
        <Architecture />
        <ThreatModel />
        <CTA />
      </main>
      <Footer />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Progress — interactive tab-stepper (Before / After)                */
/* ------------------------------------------------------------------ */
function Progress() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [inView, setInView] = useState(false)
  const [hoveredTab, setHoveredTab] = useState(null)
  const [metricDisplay, setMetricDisplay] = useState({})
  const sectionRef = useRef(null)
  const reduce = useReducedMotion()

  // Pause autoplay when the user manually switches tabs.
  // Re-enabled after they leave the section so the demo feels alive
  // but never fights the user.
  const handleSelect = (i) => {
    setActive(i)
    setPaused(true)
  }

  // Track whether the section is on screen.
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return undefined
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Autoplay cycles every 6 s while visible and not paused.
  // Resumes automatically when the user moves away (mouseLeave / blur).
  useEffect(() => {
    if (!inView || paused) return undefined
    const t = setInterval(() => {
      setActive((i) => (i + 1) % PROGRESS.length)
    }, 6000)
    return () => clearInterval(t)
  }, [inView, paused])

  const current = PROGRESS[active]
  const Icon = current.icon
  // Show the hovered tab's icon as a ghost overlay on the active
  // card so the user can preview what each step covers before
  // clicking. The actual displayed icon stays the active one.
  const previewIcon = hoveredTab !== null && hoveredTab !== active
    ? PROGRESS[hoveredTab].icon
    : null
  const fillPct = PROGRESS.length === 1 ? 100 : (active / (PROGRESS.length - 1)) * 100

  // Animate the numeric part of the metric from 0 to its target
  // whenever the active step changes. Only metrics that begin with
  // a single integer ("9", "4 / 81") animate; mixed strings like
  // "0 → 376" and "a11y 0 → 8" stay static — animating a number
  // that's embedded in prose reads as a bug, not a feature.
  useGSAP(
    () => {
      const m = current.metric
      const match = /^(\d+)\b/.exec(m)
      if (!match) {
        setMetricDisplay((d) => ({ ...d, [active]: m }))
        return undefined
      }
      const target = Number(match[1])
      if (reduce || prefersReducedMotion()) {
        setMetricDisplay((d) => ({ ...d, [active]: m }))
        return undefined
      }
      const obj = { val: 0 }
      const tween = gsap.to(obj, {
        val: target,
        duration: 1.1,
        ease: 'power2.out',
        onUpdate: () => {
          const next = String(Math.round(obj.val))
          // For "4 / 81" the metric string starts with "4"; we
          // preserve the trailing " / 81" by replacing the leading
          // digits only.
          const formatted = m.replace(/^\d+/, next)
          setMetricDisplay((d) => ({ ...d, [active]: formatted }))
        },
        onComplete: () => {
          setMetricDisplay((d) => ({ ...d, [active]: m }))
        },
      })
      return () => {
        tween.kill()
      }
    },
    { dependencies: [active, reduce] },
  )

  return (
    <section
      className="section progress"
      id="progress"
      ref={sectionRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => { setPaused(false); setHoveredTab(null) }}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="wrap">
        <Reveal>
          <span className="kicker kicker--blue">Refactor</span>
        </Reveal>
        <h2 className="section__title">
          Before & <span className="progress__hl">After</span> — the story in one screen.
        </h2>
        <p className="section__lede">{current.short}</p>

        {/* Progress bar — 4 dots connected by a line */}
        <div className="progress__bar" role="tablist" aria-label="Refactor areas">
          {PROGRESS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-controls="progress-panel"
              tabIndex={i === active ? 0 : -1}
              className={`progress__dot ${i <= active ? 'is-done' : ''} ${i === active ? 'is-active' : ''}`}
              onClick={() => handleSelect(i)}
              onMouseEnter={() => setHoveredTab(i)}
              onFocus={() => setHoveredTab(i)}
              onBlur={() => setHoveredTab(null)}
              data-cursor="dot"
            >
              <span className="progress__dot-num">{p.id}</span>
              <span className="progress__dot-label">{p.title}</span>
            </button>
          ))}
          <div
            className="progress__bar-fill"
            style={{ '--p': `${fillPct}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Active detail card */}
        <div
          className="progress__panel"
          id="progress-panel"
          role="tabpanel"
          aria-live="polite"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.article
              key={current.id}
              className="progress__card"
              data-cursor="card"
              data-tilt
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <div className="progress__icon" aria-hidden="true">
                <Icon size={64} strokeWidth={1.5} />
                {previewIcon && (
                  <span className="progress__icon--preview" key={hoveredTab}>
                    <previewIcon size={64} strokeWidth={1.5} />
                  </span>
                )}
              </div>
              <div className="progress__body">
                <span className="progress__chip progress__chip--tag">
                  {current.id} · {current.title}
                </span>
                <h3 className="progress__metric">
                  <span className="progress__metric-num">
                    {metricDisplay[active] ?? current.metric}
                  </span>
                  <span className="progress__metric-lbl">{current.metricLabel}</span>
                </h3>
                <div className="progress__row">
                  <span className="progress__side-tag">Before</span>
                  <code className="progress__code">{current.beforeCode}</code>
                </div>
                <div className="progress__row">
                  <span className="progress__side-tag progress__side-tag--after">After</span>
                  <code className="progress__code progress__code--ok">{current.afterCode}</code>
                </div>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        {/* Prev/next */}
        <div className="progress__nav">
          <button
            type="button"
            onClick={() => handleSelect((active - 1 + PROGRESS.length) % PROGRESS.length)}
            aria-label="Previous refactor area"
            data-cursor="link"
          >
            <ChevronLeft size={20} strokeWidth={2} /> Previous
          </button>
          <span className="progress__counter" aria-live="off">
            {active + 1} / {PROGRESS.length}
          </span>
          <button
            type="button"
            onClick={() => handleSelect((active + 1) % PROGRESS.length)}
            aria-label="Next refactor area"
            data-cursor="link"
          >
            Next <ChevronRight size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Demo — full chat with the real widget + Raw SSE tab                 */
/* ------------------------------------------------------------------ */
function DemoFull() {
  return (
    <section className="section demo-section" id="demo">
      <div className="wrap">
        <div className="demo-section__head">
          <Reveal>
            <span className="kicker kicker--blue">Live demo</span>
          </Reveal>
          <h2 className="section__title">
            Ask a question. Watch it stream in.
          </h2>
          <p className="section__lede">
            Real answers arrive token-by-token over Server-Sent Events — so
            help feels alive, not like a loading spinner. Tap a question and
            see the same streaming the real widget uses.
          </p>
        </div>
        <Reveal delay={0.06} className="demo-section__stage">
          <ChatDemo />
        </Reveal>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Screenshots — real answers from the live Moodle instance           */
/* ------------------------------------------------------------------ */
// Renders the four real screenshots of the Moodle AI Chatbot running
// at itech-bs14.de as a 2×2 card grid. The chat above streams the
// question/answer pairs; this section gives the user a visual record
// of what those answers actually look like. Cards fade up on scroll
// (one batch reveal, 0.08s stagger) and lift on hover with the same
// cursor spotlight tint as `.progress__card`.
function Screenshots() {
  const sectionRef = useRef(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set('.screenshots__card', { opacity: 1, y: 0 })
        return undefined
      }
      const cards = sectionRef.current?.querySelectorAll('.screenshots__card') ?? []
      if (cards.length === 0) return undefined
      gsap.set(cards, { opacity: 0, y: 24 })
      const trigger = ScrollTrigger.batch(cards, {
        start: 'top 82%',
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.55,
            stagger: 0.08,
            ease: 'power2.out',
            overwrite: true,
          }),
      })
      return () => {
        trigger.forEach((t) => t.kill())
      }
    },
    { scope: sectionRef },
  )

  return (
    <section className="section screenshots" ref={sectionRef} id="answers">
      <div className="wrap">
        <Reveal>
          <span className="kicker kicker--blue">Real answers</span>
        </Reveal>
        <h2 className="section__title">
          The assistant in <span className="screenshots__hl">its own words</span>.
        </h2>
        <p className="section__lede">
          Real screenshots from the Moodle AI Chatbot running at
          itech-bs14.de — every link, every file, every requirement
          comes from the student's own course.
        </p>

        <ol className="screenshots__grid" role="list">
          {SCREENSHOTS.map((s) => (
            <li className="screenshots__card" key={s.src} data-cursor="card">
              <span className="screenshots__card-num" aria-hidden="true">
                {s.num}
              </span>
              <img
                src={s.src}
                alt={s.alt}
                className="screenshots__card-img"
                loading="lazy"
                width="640"
                height="400"
              />
              <p className="screenshots__card-caption">{s.caption}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Architecture — flow diagram of one chat request                     */
/* ------------------------------------------------------------------ */
function Architecture() {
  return (
    <section className="section arch" id="architecture">
      <div className="wrap">
        <Reveal>
          <span className="kicker kicker--blue">Architecture</span>
        </Reveal>
        <h2 className="section__title">
          One request, <span className="arch__hl">eleven checkpoints</span>.
        </h2>
        <p className="section__lede">
          Every chat message traverses this graph. Each step is a small,
          focused function with a single responsibility. If any step
          rejects, nothing downstream runs.
        </p>

        <Reveal delay={0.06} className="arch__diagram-wrap">
          <ArchitectureDiagram />
        </Reveal>
      </div>
    </section>
  )
}

// Layout — keep the existing 3-row grouping (4 / 4 / 3) because it
// groups nodes by concern: identity & input (row 1), data & AI
// (row 2), delivery (row 3). Coordinates are in a 1000×360 viewBox.
const ARCH_ROWS = [
  [
    { id: 'client', x: 30 },
    { id: 'verify', x: 280 },
    { id: 'ownership', x: 530 },
    { id: 'input', x: 780 },
  ],
  [
    { id: 'enrol', x: 155 },
    { id: 'search', x: 405 },
    { id: 'prompt', x: 655 },
    { id: 'ollama', x: 880 },
  ],
  [
    { id: 'sse', x: 155 },
    { id: 'sanitize', x: 405 },
    { id: 'render', x: 655 },
  ],
]
const ROW_Y = [40, 170, 300]
const NODE_W = 200
const NODE_H = 64

function ArchitectureDiagram() {
  const diagramRef = useRef(null)
  const svgRef = useRef(null)
  const pathRefs = useRef({})
  const nodeRefs = useRef({})
  const [nodeBoxes, setNodeBoxes] = useState({})
  const lookup = Object.fromEntries(ARCHITECTURE_NODES.map((n) => [n.id, n]))

  // 1) Measure each .arch__node on mount and on resize, write the
  //    boxes to state so the SVG can draw paths between them. The
  //    viewBox is 1000×360, but the actual DOM nodes are scaled by
  //    CSS — the path coordinates stay in viewBox space.
  useLayoutEffect(() => {
    const measure = () => {
      const svg = svgRef.current
      if (!svg) return
      const svgRect = svg.getBoundingClientRect()
      const scaleX = 1000 / svgRect.width
      const scaleY = 360 / svgRect.height
      const boxes = {}
      ARCHITECTURE_NODES.forEach((n) => {
        const el = nodeRefs.current[n.id]
        if (!el) return
        const r = el.getBoundingClientRect()
        boxes[n.id] = {
          x: (r.left - svgRect.left) * scaleX,
          y: (r.top - svgRect.top) * scaleY,
          w: r.width * scaleX,
          h: r.height * scaleY,
        }
      })
      setNodeBoxes(boxes)
    }
    measure()
    // Re-measure after the page settles (fonts, image paints).
    const t = setTimeout(measure, 50)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      clearTimeout(t)
    }
  }, [])

  // 2) Once boxes are known, build path `d` strings and stagger
  //    delays per edge. The first 10 edges form the linear chain;
  //    we use the data from ARCHITECTURE_EDGES (data.js).
  const edges = ARCHITECTURE_EDGES

  // 3) Scroll-driven reveals: (a) batch-fade the 11 nodes, and
  //    (b) draw the 10 SVG edges in sequence as the section enters
  //    the viewport. Both reuse the same diagram ref as scope.
  useGSAP(
    () => {
      const el = diagramRef.current
      if (!el) return undefined
      const nodes = el.querySelectorAll('.arch__node')
      const paths = el.querySelectorAll('.arch__edge')

      // Skip if no paths have a real `d` yet — getTotalLength() on
      // an empty path returns 0 / NaN, which corrupts the dash maths
      // and produces the "M Infinity Infinity" SVG parse error.
      const realPaths = Array.from(paths).filter((p) => {
        const d = p.getAttribute('d') || ''
        return d && !d.includes('Infinity') && !d.includes('NaN')
      })
      if (realPaths.length === 0) return undefined

      if (prefersReducedMotion()) {
        gsap.set(nodes, { opacity: 1, y: 0 })
        realPaths.forEach((p) => {
          p.style.strokeDashoffset = '0'
        })
        return undefined
      }

      // Initial state for the 11 nodes.
      gsap.set(nodes, { opacity: 0, y: 18 })

      // Initial state for the real edges — full offset, hidden.
      realPaths.forEach((p) => {
        const len = p.getTotalLength()
        if (!Number.isFinite(len) || len <= 0) return
        p.style.strokeDasharray = `${len}`
        p.style.strokeDashoffset = `${len}`
      })

      // Two ScrollTriggers: one batch reveal for nodes, one scrubbed
      // line draw for the edges. Both keyed off the same section so
      // they share a single lifecycle.
      const nodeTrigger = ScrollTrigger.batch(nodes, {
        start: 'top 80%',
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.55,
            stagger: 0.05,
            ease: 'power2.out',
            overwrite: true,
          }),
      })

      // Scrub the line draw across the section's vertical scroll.
      // The 10 edges are drawn in sequence via a per-edge data-delay
      // (0.0, 0.08, 0.16 … 0.72) so the chain reveals edge by edge.
      const lineTrigger = ScrollTrigger.create({
        trigger: el,
        start: 'top 75%',
        end: 'bottom 35%',
        scrub: 0.5,
        onUpdate: (self) => {
          const p = self.progress
          realPaths.forEach((path) => {
            const delay = Number(path.dataset.delay || 0)
            const span = 1 - delay
            const local = Math.max(0, Math.min(span, p - delay)) / span
            const len = path.getTotalLength()
            if (!Number.isFinite(len) || len <= 0) return
            path.style.strokeDashoffset = `${len * (1 - local)}`
          })
        },
      })

      return () => {
        nodeTrigger.forEach((t) => t.kill())
        lineTrigger.kill()
      }
    },
    { scope: diagramRef, dependencies: [nodeBoxes] },
  )

  // Helper: build a path between two node boxes. For the serpentine
  // layout we use a cubic Bezier that curves from the right edge of
  // the source to the left edge of the target, dipping down/up to
  // suggest the row change.
  const buildPath = (a, b) => {
    if (!a || !b) return ''
    const ax = a.x + a.w
    const ay = a.y + a.h / 2
    const bx = b.x
    const by = b.y + b.h / 2
    // Mid-x is a control point pulled to the right of the source so
    // the curve sweeps naturally to the right.
    const midX = (ax + bx) / 2
    return `M ${ax} ${ay} C ${midX} ${ay}, ${midX} ${by}, ${bx} ${by}`
  }

  return (
    <div className="arch__diagram" ref={diagramRef} data-ready={Object.keys(nodeBoxes).length > 0}>
      <svg
        ref={svgRef}
        className="arch__edges"
        viewBox="0 0 1000 360"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {edges.map(([from, to], i) => {
          const a = nodeBoxes[from]
          const b = nodeBoxes[to]
          return (
            <path
              key={`${from}-${to}`}
              ref={(el) => {
                if (el) pathRefs.current[`${from}-${to}`] = el
              }}
              className="arch__edge"
              d={buildPath(a, b)}
              data-delay={(i * 0.08).toFixed(2)}
            />
          )
        })}
      </svg>
      {ARCH_ROWS.map((row, ri) => (
        <div className="arch__row" key={ri}>
          {row.map(({ id, x }) => {
            const n = lookup[id]
            if (!n) return null
            return (
              <div
                className="arch__node-wrap"
                key={id}
                style={{
                  left: `${x}px`,
                  top: `${ROW_Y[ri]}px`,
                  width: `${NODE_W}px`,
                  height: `${NODE_H}px`,
                  position: 'absolute',
                }}
              >
                <div
                  className={`arch__node arch__node--${n.kind}`}
                  data-kind={n.kind}
                  data-cursor="card"
                  data-tilt
                  ref={(el) => {
                    if (el) nodeRefs.current[id] = el
                  }}
                >
                  <span className="arch__node-label">{n.label}</span>
                  <span className="arch__node-sub">{n.sub}</span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Threat model — attack / defense pairs                               */
/* ------------------------------------------------------------------ */
function ThreatModel() {
  const sectionRef = useRef(null)

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        gsap.set('.threat__card', { opacity: 1, y: 0 })
        return undefined
      }
      const cards = sectionRef.current?.querySelectorAll('.threat__card') ?? []
      if (cards.length === 0) return undefined
      // Initial state — cards are invisible until they scroll in.
      gsap.set(cards, { opacity: 0, y: 24 })
      const trigger = ScrollTrigger.batch(cards, {
        start: 'top 85%',
        onEnter: (batch) =>
          gsap.to(batch, {
            opacity: 1,
            y: 0,
            duration: 0.55,
            ease: 'power2.out',
            stagger: 0.07,
            overwrite: true,
          }),
      })
      return () => {
        trigger.forEach((t) => t.kill())
      }
    },
    { scope: sectionRef },
  )

  return (
    <section className="section threat" id="security" ref={sectionRef}>
      <div className="wrap">
        <Reveal>
          <span className="kicker kicker--blue">Threat model</span>
        </Reveal>
        <h2 className="section__title">
          Attacks we expected, defenses we shipped.
        </h2>
        <p className="section__lede">
          Six concrete threat scenarios, each paired with the line of code
          that defeats it. Nothing here is theoretical — every defense is
          wired in <code className="tech__inline">proxy/src</code>.
        </p>

        <ul className="threat__grid" role="list">
          {THREAT_MODEL.map((t, i) => {
            const id = String(i + 1).padStart(2, '0')
            return (
              <li
                className="threat__card"
                key={t.attack}
                data-cursor="card"
                data-cursor-color="success"
              >
                <header className="threat__card-head">
                  <span className="threat__id" aria-hidden="true">{id}</span>
                  <span className="threat__id-label">Threat</span>
                </header>

                <div className="threat__card-body">
                  <div className="threat__side threat__side--attack">
                    <span className="threat__chip threat__chip--attack">
                      <TriangleAlert size={14} strokeWidth={2.5} aria-hidden="true" />
                      Attack vector
                    </span>
                    <h3 className="threat__title">{t.attack}</h3>
                    <p className="threat__desc">{t.detail}</p>
                  </div>

                  <div className="threat__side threat__side--defense">
                    <span className="threat__chip threat__chip--defense">
                      <ShieldCheck size={14} strokeWidth={2.5} aria-hidden="true" />
                      Defense
                    </span>
                    <h3 className="threat__title">{t.defense}</h3>
                    <div className="threat__desc--mono">
                      <span className="threat__ref-label">Wired in</span>
                      <code className="threat__ref-path">{t.ref}</code>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* CTA + Footer                                                        */
/* ------------------------------------------------------------------ */
function CTA() {
  return (
    <section className="section cta" id="cta">
      <div className="wrap">
        <Reveal>
          <div className="cta__card">
            <span className="kicker kicker--blue">GitHub repository</span>
            <h2 className="cta__title">
              One command brings up the whole stack.
            </h2>
            <pre className="cta__code" data-cursor="code">
              <code><span className="cta__prompt">$</span> docker compose up -d</code>
            </pre>
            <p className="cta__sub">
              Moodle, MariaDB, Ollama, the proxy and nginx — together, on
              your own server.
            </p>
            <div className="cta__actions">
              <a href="#demo" className="btn btn-primary" data-cursor="magnetic">
                Try the demo
              </a>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline-secondary"
                data-cursor="magnetic"
              >
                <img src="/github-100.png" alt="" className="btn__icon" aria-hidden="true" />
                View on GitHub
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer__inner">
        <div className="footer__brand">
          <MoodleWordmark className="footer__logo" mono />
          <span className="footer__badge">AI Assistant</span>
        </div>
        <p className="footer__note">
          A private AI tutor embedded in Moodle. Node.js 20 · Fastify 5 · Ollama ·
          Clean Architecture. Released under the MIT License.
        </p>
        <span className="footer__copy">© 2026 · Built for the DEV Finish-Up-A-Thon</span>
      </div>
    </footer>
  )
}
