import { motion } from 'framer-motion'

/**
 * Lightweight scroll-reveal wrapper. Animates children up + in once they
 * enter the viewport. `delay` staggers siblings; `y` controls travel.
 */
export default function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
  as = 'div',
}) {
  const MotionTag = motion[as] ?? motion.div
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{
        duration: 0.7,
        delay,
        ease: [0.21, 0.6, 0.35, 1],
      }}
    >
      {children}
    </MotionTag>
  )
}
