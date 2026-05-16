"use client"

import { motion } from "framer-motion"

interface AnimatedTextProps {
  text: string
  delay?: number
}

export function AnimatedText({ text, delay = 0 }: AnimatedTextProps) {
  const words = text.split(" ")
  let charIndex = 0

  return (
    <motion.span
      aria-label={text}
      className="font-bold text-center text-5xl leading-[0.92] tracking-normal font-serif text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.28)] sm:text-6xl md:text-7xl lg:text-8xl"
      initial="hidden"
      animate="visible"
      style={{ perspective: 400, display: "inline-block" }}
    >
      {words.map((word, wordIndex) => (
        <span key={wordIndex} aria-hidden="true" style={{ display: "inline-block", whiteSpace: "nowrap" }}>
          {word.split("").map((char, index) => {
            const currentIndex = charIndex++
            return (
              <motion.span
                key={index}
                initial={{ opacity: 0, y: 30, filter: "blur(12px)", rotateX: -45 }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)", rotateX: 0 }}
                transition={{
                  duration: 0.6,
                  delay: delay + currentIndex * 0.04,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                style={{
                  display: "inline-block",
                  transformStyle: "preserve-3d",
                  transformOrigin: "center bottom",
                }}
              >
                {char}
              </motion.span>
            )
          })}
          {wordIndex < words.length - 1 && "\u00A0"}
        </span>
      ))}
    </motion.span>
  )
}
