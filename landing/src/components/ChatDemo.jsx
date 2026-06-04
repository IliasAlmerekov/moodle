import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CHAT_SCRIPTS, DEMO_GREETING, SSE_TRACE } from '../data.js'

// Tiny markdown → React for **bold**, *italic* and \n line breaks.
// The demo answers only use these — no need for a full parser.
function renderRich(text) {
  // First split on newlines so each line is processed independently.
  const lines = text.split('\n')
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    const rendered = parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**'))
        return <strong key={i}>{p.slice(2, -2)}</strong>
      if (p.startsWith('*') && p.endsWith('*'))
        return <em key={i}>{p.slice(1, -1)}</em>
      return <span key={i}>{p}</span>
    })
    return (
      <span key={lineIdx}>
        {rendered}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    )
  })
}

const STREAM_MS = 18 // per-character delay — mimics token streaming over SSE

export default function ChatDemo({ compact = false }) {
  const [tab, setTab] = useState('chat') // 'chat' | 'raw'
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: DEMO_GREETING,
      done: true,
    },
  ])
  const [streaming, setStreaming] = useState(false)
  const [used, setUsed] = useState([])
  const [rawLines, setRawLines] = useState([])
  const scrollRef = useRef(null)
  const rawRef = useRef(null)
  const timer = useRef(null)

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToEnd()
  }, [messages, scrollToEnd])

  // Animate the Raw SSE trace streaming in
  useEffect(() => {
    if (tab !== 'raw') return
    if (rawLines.length >= SSE_TRACE.length) return
    const t = setTimeout(() => {
      setRawLines((lines) => [...lines, SSE_TRACE[lines.length]])
    }, 120)
    return () => clearTimeout(t)
  }, [tab, rawLines])

  // Auto-scroll the raw panel
  useEffect(() => {
    const el = rawRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [rawLines])

  useEffect(() => () => clearInterval(timer.current), [])

  const ask = useCallback(
    (script, idx) => {
      if (streaming) return
      setStreaming(true)
      setUsed((u) => [...u, idx])
      setTab('chat')

      // 1. push the user's question
      setMessages((m) => [...m, { role: 'user', text: script.q, done: true }])

      // 2. typing indicator, then stream the answer
      setTimeout(() => {
        setMessages((m) => [...m, { role: 'bot', text: '', done: false, typing: true }])

        setTimeout(() => {
          let i = 0
          const full = script.a
          setMessages((m) => {
            const copy = [...m]
            copy[copy.length - 1] = { role: 'bot', text: '', done: false }
            return copy
          })

          timer.current = setInterval(() => {
            i += 1
            setMessages((m) => {
              const copy = [...m]
              const last = copy.length - 1
              copy[last] = {
                role: 'bot',
                text: full.slice(0, i),
                done: i >= full.length,
              }
              return copy
            })
            if (i >= full.length) {
              clearInterval(timer.current)
              setStreaming(false)
            }
          }, STREAM_MS)
        }, 550)
      }, 350)
    },
    [streaming],
  )

  const reset = () => {
    clearInterval(timer.current)
    setStreaming(false)
    setUsed([])
    setRawLines([])
    setMessages([
      {
        role: 'bot',
        text: DEMO_GREETING,
        done: true,
      },
    ])
  }

  const remaining = CHAT_SCRIPTS.map((s, i) => ({ s, i })).filter(
    ({ i }) => !used.includes(i),
  )

  const suggested = compact ? CHAT_SCRIPTS.slice(0, 3) : CHAT_SCRIPTS
  const remainingFiltered = compact
    ? suggested.map((s, i) => ({ s, i }))
    : remaining

  return (
    <div className={`demo ${compact ? 'demo--compact' : ''}`} data-cursor="card">
      <div className="demo__window">
        <div className="demo__head">
          <img
            src="/moodle_logo.svg"
            alt="AI Logo"
            className="demo__logo"
          />
          <div className="demo__head-id">
            <div>
              <strong>AI Assistent</strong>
              <span className="demo__sub">
                <i className="demo__live" /> local LLM · streaming
              </span>
            </div>
          </div>
          <div className="demo__tabs" role="tablist" aria-label="Demo view">
            <button
              role="tab"
              aria-selected={tab === 'chat'}
              className={tab === 'chat' ? 'demo__tab is-on' : 'demo__tab'}
              onClick={() => setTab('chat')}
            >
              Chat
            </button>
            <button
              role="tab"
              aria-selected={tab === 'raw'}
              className={tab === 'raw' ? 'demo__tab is-on' : 'demo__tab'}
              onClick={() => setTab('raw')}
            >
              Raw&nbsp;SSE
            </button>
          </div>
          <button
            className="demo__new-chat"
            onClick={reset}
            title="Neuer Chat"
            aria-label="Neuer Chat"
          >
            <img src="/write.png" alt="pencil" className="demo__new-chat-img" />
          </button>
        </div>

        {tab === 'chat' ? (
          <>
            <div className="demo__messages" ref={scrollRef}>
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    className={`demo__msg demo__msg--${m.role}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    {m.role === 'bot' && (
                      <img
                        src="/moodle_logo.svg"
                        alt=""
                        aria-hidden="true"
                        className="demo__msg-avatar"
                      />
                    )}
                    <div className="demo__bubble">
                      {m.typing ? (
                        <span className="demo__typing">
                          <i /> <i /> <i />
                        </span>
                      ) : (
                        <>
                          {renderRich(m.text)}
                          {!m.done && <span className="demo__caret" />}
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="demo__suggest">
              {remainingFiltered.length > 0 ? (
                remainingFiltered.map(({ s, i }) => (
                  <button
                    key={i}
                    className="demo__chip"
                    disabled={streaming}
                    onClick={() => ask(s, i)}
                    data-cursor="link"
                  >
                    {s.q}
                  </button>
                ))
              ) : (
                <button className="demo__chip demo__chip--reset" onClick={reset}>
                  ↺ Try the questions again
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="demo__raw" ref={rawRef}>
            <pre className="demo__raw-pre">
              {rawLines.map((line, i) =>
                line === '' ? (
                  <span className="demo__raw-blank" key={i} />
                ) : (
                  <span className="demo__raw-line" key={i}>
                    {highlightSse(line)}
                  </span>
                ),
              )}
              {rawLines.length < SSE_TRACE.length && (
                <span className="demo__caret demo__caret--raw" />
              )}
            </pre>
            <p className="demo__raw-note">
              What the browser actually receives during one streamed chat
              message — NDJSON from Ollama, wrapped in SSE frames.
            </p>
          </div>
        )}
      </div>

      {!compact && (
        <p className="demo__note">
          This is a scripted demo. The real assistant only answers from{' '}
          <strong>your own enrolled courses</strong> — search is fail-closed.
        </p>
      )}
    </div>
  )
}

// Lightweight syntax highlight for SSE frames
function highlightSse(line) {
  if (line.startsWith('event:')) {
    return (
      <>
        <span className="sse-key">event</span>
        <span className="sse-sep">:</span> {line.slice(6).trim()}
      </>
    )
  }
  if (line.startsWith('id:')) {
    return (
      <>
        <span className="sse-key">id</span>
        <span className="sse-sep">:</span> {line.slice(3).trim()}
      </>
    )
  }
  if (line.startsWith('data:')) {
    const body = line.slice(5).trim()
    if (body === '[DONE]') {
      return (
        <>
          <span className="sse-key">data</span>
          <span className="sse-sep">:</span>{' '}
          <span className="sse-done">[DONE]</span>
        </>
      )
    }
    return (
      <>
        <span className="sse-key">data</span>
        <span className="sse-sep">:</span> <span className="sse-json">{body}</span>
      </>
    )
  }
  return <span>{line}</span>
}
