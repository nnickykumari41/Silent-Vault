"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"

const testimonials = [
  {
    name: "Maya I.",
    role: "Long-term ETH holder",
    content: "I can finally leave instructions without giving anyone access before they need it.",
    avatar: "/placeholder.svg?height=48&width=48",
  },
  {
    name: "Dev K.",
    role: "Protocol founder",
    content: "The emergency mode and grace period make this feel practical, not just theoretical.",
    avatar: "/placeholder.svg?height=48&width=48",
  },
  {
    name: "Anika S.",
    role: "Family office operator",
    content: "Encrypted instructions plus on-chain timing is the missing bridge for self-custody inheritance.",
    avatar: "/placeholder.svg?height=48&width=48",
  },
]

const testimonials2 = [
  {
    name: "Lucas P.",
    role: "Security reviewer",
    content: "The contract never receives plaintext recovery notes. That is the right default.",
    avatar: "/placeholder.svg?height=48&width=48",
  },
  {
    name: "Emma L.",
    role: "DAO treasurer",
    content: "Beneficiary shares make it usable for teams, not only families.",
    avatar: "/placeholder.svg?height=48&width=48",
  },
  {
    name: "Antoine R.",
    role: "Wallet power user",
    content: "The demo flow is clear: create, miss check-in, unlock, decrypt.",
    avatar: "/placeholder.svg?height=48&width=48",
  },
]

const duplicatedTestimonials = [...testimonials, ...testimonials, ...testimonials]
const duplicatedTestimonials2 = [...testimonials2, ...testimonials2, ...testimonials2]

export function TestimonialsSection() {
  const [isPaused, setIsPaused] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollRef2 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef2.current) {
        scrollRef2.current.scrollLeft = scrollRef2.current.scrollWidth / 3
      }
      setIsInitialized(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (isPaused || !isInitialized || !scrollRef.current) return

    const scrollContainer = scrollRef.current
    let animationFrameId: number
    let isActive = true

    const scroll = () => {
      if (!isActive || !scrollContainer) return

      scrollContainer.scrollLeft += 1
      const maxScroll = scrollContainer.scrollWidth / 3

      if (scrollContainer.scrollLeft >= maxScroll) {
        scrollContainer.scrollLeft = 0
      }

      animationFrameId = requestAnimationFrame(scroll)
    }

    animationFrameId = requestAnimationFrame(scroll)

    return () => {
      isActive = false
      cancelAnimationFrame(animationFrameId)
    }
  }, [isPaused, isInitialized])

  useEffect(() => {
    if (isPaused || !isInitialized || !scrollRef2.current) return

    const scrollContainer = scrollRef2.current
    let animationFrameId: number
    let isActive = true

    const scroll = () => {
      if (!isActive || !scrollContainer) return

      scrollContainer.scrollLeft -= 1

      if (scrollContainer.scrollLeft <= 0) {
        scrollContainer.scrollLeft = scrollContainer.scrollWidth / 3
      }

      animationFrameId = requestAnimationFrame(scroll)
    }

    animationFrameId = requestAnimationFrame(scroll)

    return () => {
      isActive = false
      cancelAnimationFrame(animationFrameId)
    }
  }, [isPaused, isInitialized])

  return (
    <section id="testimonials" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-normal leading-tight font-serif">Built for serious self-custody</h2>
        </div>

        <div className="space-y-6">
          {/* First row - scrolls left to right */}
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

            <div
              ref={scrollRef}
              className="flex gap-6 overflow-x-hidden"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
              style={{ scrollBehavior: "auto" }}
            >
              {duplicatedTestimonials.map((testimonial, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 w-full sm:w-[400px] bg-card border border-border rounded-2xl p-8 border-none py-4"
                >
                  <div className="flex items-start gap-4 mb-6">
                    <Image
                      src={testimonial.avatar || "/placeholder.svg"}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <p className="text-foreground leading-relaxed flex-1 text-lg">
                      &ldquo;{testimonial.content}&rdquo;
                    </p>
                  </div>
                  <div className="mt-auto">
                    <p className="text-foreground text-sm font-bold">{testimonial.name}</p>
                    <p className="text-muted-foreground text-xs">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Second row - scrolls right to left */}
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

            <div
              ref={scrollRef2}
              className="flex gap-6 overflow-x-hidden"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
              style={{ scrollBehavior: "auto" }}
            >
              {duplicatedTestimonials2.map((testimonial, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 w-full sm:w-[400px] bg-card border border-border rounded-2xl p-8 border-none py-4"
                >
                  <div className="flex items-start gap-4 mb-6">
                    <Image
                      src={testimonial.avatar || "/placeholder.svg"}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <p className="text-lg text-foreground leading-relaxed flex-1">
                      &ldquo;{testimonial.content}&rdquo;
                    </p>
                  </div>
                  <div className="mt-auto">
                    <p className="text-foreground text-sm font-bold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
