// Cursor — a fixed pointer-follower rendered once at the App root.
//
// The actual element is two siblings:
//   - .cursor--dot: a 16px orange circle, always visible on pointer
//     devices, mix-blend-mode: multiply so it tints over dark surfaces
//     instead of disappearing into them.
//   - .cursor--ring: a 220px spotlight ring, hidden by default, fades
//     in when an element with data-cursor="card|code|dot" is hovered.
//     It uses CSS custom properties set by useCursor to follow the
//     pointer and tint itself per section.
//
// We intentionally do not animate the ring with the same tween as
// the dot. The dot snaps to the cursor (fast), the ring trails
// slightly (soft), and the per-element spotlight is driven by its
// own per-element quickTo (so the glow sits under the cursor inside
// the hovered card, not the cursor itself).
import { useCursor } from '../hooks/useCursor.js'

export default function Cursor() {
  const { isActive } = useCursor()
  if (!isActive) return null
  return (
    <>
      <div className="cursor cursor--dot" aria-hidden="true" />
      <div className="cursor cursor--ring" aria-hidden="true" />
    </>
  )
}
