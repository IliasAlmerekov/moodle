import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import MoodleWordmark from './MoodleWordmark.jsx'
import { GITHUB_REPO_URL } from '../data.js'

// The "How it works" link points at the architecture section — there
// is no separate "how it works" page. (Earlier versions of this file
// used #how, which was a dead anchor and silently did nothing on
// click.)
const LINKS = [
  { href: '#architecture', label: 'Architecture' },
  { href: '#demo', label: 'Live demo' },
  { href: '#architecture', label: 'How it works' },
  { href: '#security', label: 'Threat model' },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile menu on Escape and once the viewport grows past
  // the mobile breakpoint — otherwise an open panel could linger as a
  // ghost layer when the user rotates or resizes to desktop.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onResize = () => {
      if (window.innerWidth > 720) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <motion.header
      className={`nav ${scrolled ? 'nav--scrolled' : ''}`}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.21, 0.6, 0.35, 1] }}
    >
      <div className="wrap nav__inner">
        <a
          href="#top"
          className="nav__brand"
          data-cursor="wordmark"
          aria-label="Moodle AI Assistant — home"
          onClick={() => setOpen(false)}
        >
          <MoodleWordmark className="nav__logo" />
          <span className="nav__badge">AI Assistant</span>
        </a>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => (
            <a key={l.href + l.label} href={l.href} data-cursor="link">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="nav__right">
          <span className="nav__license">MIT&nbsp;License</span>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary nav__cta"
            data-cursor="magnetic"
            aria-label="Open the Moodle AI Assistant repository on GitHub"
          >
            <img src="/github-100.png" alt="" className="btn__icon" aria-hidden="true" />
            GitHub
          </a>
        </div>

        <button
          type="button"
          className="nav__toggle"
          aria-expanded={open}
          aria-controls="nav-mobile"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setOpen((o) => !o)}
          data-cursor="link"
        >
          {open ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="nav-mobile"
            className="nav__mobile"
            aria-label="Primary mobile"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="wrap nav__mobile-inner">
              {LINKS.map((l) => (
                <a
                  key={l.href + l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </a>
              ))}
              <span className="nav__mobile-license">MIT License</span>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
