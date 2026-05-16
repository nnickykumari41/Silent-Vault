"use client"

import { HeartPulse, KeyRound, Shield } from "lucide-react"
import { useState, useEffect, useRef } from "react"

const services = [
  {
    icon: Shield,
    title: "Encrypted recovery vaults",
    description: "Store ciphertext instructions and private recovery metadata directly in the SilentVault contract.",
  },
  {
    icon: HeartPulse,
    title: "Proof-of-life check-ins",
    description: "Reset the dead-man timer with one owner transaction while the vault stays locked for everyone else.",
  },
  {
    icon: KeyRound,
    title: "Beneficiary unlock",
    description: "Heirs receive CoFHE decryption permission only after inactivity, grace period, or emergency mode.",
  },
]

function AnimatedIcon({ Icon, delay = 0 }: { Icon: any; delay?: number }) {
  const [isVisible, setIsVisible] = useState(false)
  const iconRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.3 },
    )

    if (iconRef.current) {
      observer.observe(iconRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={iconRef} className="relative">
      <Icon
        className={`text-foreground h-16 w-16 ${isVisible ? "animate-draw-icon" : ""}`}
        strokeWidth={1}
        style={{
          strokeDasharray: isVisible ? undefined : 1000,
          strokeDashoffset: isVisible ? undefined : 1000,
        }}
      />
    </div>
  )
}

export function ServicesSection() {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.2 },
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <section id="how-it-works" className="py-32 px-6 pb-24 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 flex justify-center pointer-events-none z-0">
        <span className="font-bold text-center text-[18vw] sm:text-[16vw] md:text-[14vw] lg:text-[12vw] leading-none tracking-tighter text-zinc-100 whitespace-nowrap">
          MISSION
        </span>
      </div>

      <style jsx>{`
        @keyframes drawPath {
          from {
            stroke-dasharray: 1000;
            stroke-dashoffset: 1000;
          }
          to {
            stroke-dasharray: 1000;
            stroke-dashoffset: 0;
          }
        }
        :global(.animate-draw-icon) :global(path),
        :global(.animate-draw-icon) :global(line),
        :global(.animate-draw-icon) :global(polyline),
        :global(.animate-draw-icon) :global(circle),
        :global(.animate-draw-icon) :global(rect) {
          animation: drawPath 2s ease-out forwards;
        }
      `}</style>

      <div className="max-w-7xl mx-auto relative z-10">
        <div ref={sectionRef} className="relative px-6 lg:px-8 py-16 lg:py-10 mb-32 overflow-hidden rounded-3xl">
          {/* Background image that spans full width */}
          <div className="absolute inset-0 w-full h-full">
            <img
              src="/images/7aecbceb-cbd3-4cbd-901c-dd0125d41525.png"
              alt="Quiet landscape for private legacy planning"
              className={`w-full h-full object-cover transition-transform duration-1000 ease-out ${
                isVisible ? "scale-100" : "scale-110"
              }`}
            />
            {/* Overlay for better text readability */}
            <div className="absolute inset-0 bg-black/20" />
          </div>

          {/* Text content on top */}
          <div className="relative z-10 grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="order-1 lg:order-2">
              <p className="text-sm uppercase tracking-[0.2em] text-white/80 font-medium mb-4">Our mission</p>
              <h2 className="font-sans md:text-4xl lg:text-5xl font-medium text-white text-balance mb-8 text-5xl">
                Private legacy without trusted middlemen
              </h2>
              <div className="space-y-6 text-white/90 leading-relaxed">
                <p>
                  SilentVault lets crypto holders define who can recover encrypted instructions if they become inactive
                  or need to trigger emergency mode.
                </p>
                <p>
                  The contract controls timing and access, while CoFHE keeps release metadata private until the protocol
                  grants beneficiary permission.
                </p>
              </div>
              <div className="mt-10"></div>
            </div>
          </div>
        </div>

        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-normal mb-6 text-balance font-serif">Everything you need</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A complete MVP for private inheritance: vault creation, beneficiaries, check-ins, emergency mode, and
            encrypted beneficiary reads.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <div
              key={index}
              className="group p-8 rounded-3xl hover:bg-zinc-50 transition-colors duration-300 text-center"
            >
              <div className="mb-6 flex justify-center">
                <AnimatedIcon Icon={service.icon} delay={index * 0.2} />
              </div>
              <h3 className="text-xl font-medium mb-3 text-foreground">{service.title}</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
