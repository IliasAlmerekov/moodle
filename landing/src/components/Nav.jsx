import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
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

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
      </div>
    </motion.header>
  )
}
