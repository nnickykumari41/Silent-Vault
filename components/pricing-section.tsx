"use client"

import { useRef, useEffect, useState } from "react"
import { PropertyBookingCard } from "./property-booking-card"

const properties = [
  {
    propertyName: "Family Legacy Vault",
    location: "2 heirs / 70-30 split",
    duration: "90 day timer",
    availableDate: "Live on Sepolia",
    image: "/images/property-beach-villa.jpg",
    pricePerNight: 0,
    propertyType: "Inheritance",
    features: ["Encrypted note", "FHE release code", "Grace period", "Owner check-in"],
    amenities: ["On-chain", "Private", "2 Heirs"],
    rating: 4.9,
  },
  {
    propertyName: "Emergency Access Vault",
    location: "Trusted sibling wallet",
    duration: "Immediate panic",
    availableDate: "Owner controlled",
    image: "/images/property-mountain-cabin.jpg",
    pricePerNight: 0,
    propertyType: "Panic mode",
    features: ["Emergency trigger", "Cancelable grace", "Local decrypt", "Payload hash"],
    amenities: ["Fast", "Auditable", "Private"],
    rating: 4.8,
  },
  {
    propertyName: "Founder Succession Vault",
    location: "DAO treasury + counsel",
    duration: "1 year timer",
    availableDate: "Multi-heir",
    image: "/images/property-city-loft.jpg",
    pricePerNight: 0,
    propertyType: "Business recovery",
    features: ["Share splits", "Private inventory", "Legal note", "Wallet map"],
    amenities: ["DAO", "Counsel", "Treasury"],
    rating: 4.7,
  },
  {
    propertyName: "Cold Wallet Map",
    location: "Encrypted locations",
    duration: "30 day timer",
    availableDate: "Check-in active",
    image: "/images/property-tuscan-estate.jpg",
    pricePerNight: 0,
    propertyType: "Asset inventory",
    features: ["Hardware wallet info", "Exchange list", "NFT custody", "Bank locker note"],
    amenities: ["Wallets", "NFTs", "Docs"],
    rating: 4.9,
  },
  {
    propertyName: "Personal Message Vault",
    location: "Private family note",
    duration: "180 day timer",
    availableDate: "Encrypted",
    image: "/images/property-tropical-bungalow.jpg",
    pricePerNight: 0,
    propertyType: "Message release",
    features: ["Final letter", "Contact plan", "Decryption code", "Beneficiary-only"],
    amenities: ["Family", "Private", "Local"],
    rating: 4.8,
  },
  {
    propertyName: "Demo Immediate Vault",
    location: "Hackathon walkthrough",
    duration: "0 day timer",
    availableDate: "Ready now",
    image: "/images/property-lakefront-modern.jpg",
    pricePerNight: 0,
    propertyType: "Demo flow",
    features: ["Create", "Start recovery", "Unlock", "Decrypt"],
    amenities: ["Sepolia", "CoFHE", "Demo"],
    rating: 4.9,
  },
]

export function PricingSection() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const positionRef = useRef(0)
  const animationRef = useRef<number | null>(null)

  const duplicatedProperties = [...properties, ...properties, ...properties]

  useEffect(() => {
    const scrollContainer = scrollRef.current
    if (!scrollContainer) return

    const speed = isHovered ? 0.3 : 1 // Slow down on hover instead of changing animation duration
    let lastTime = performance.now()

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime
      lastTime = currentTime

      positionRef.current += speed * (deltaTime / 16)

      const totalWidth = scrollContainer.scrollWidth / 3

      if (positionRef.current >= totalWidth) {
        positionRef.current = 0
      }

      scrollContainer.style.transform = `translateX(-${positionRef.current}px)`
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isHovered])

  return (
    <section id="pricing" className="py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 text-center mb-20">
        <h2 className="text-4xl md:text-5xl font-normal mb-6 text-balance font-serif">Protocol use cases</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Private inheritance is not just one note. It is wallets, legal context, emergency access, business continuity,
          and human messages released only when the conditions are met.
        </p>
      </div>

      <div className="relative w-full" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <div ref={scrollRef} className="flex gap-6" style={{ width: "fit-content" }}>
          {duplicatedProperties.map((property, index) => (
            <div key={index} className="flex-shrink-0 w-[85vw] sm:w-[60vw] lg:w-[400px]">
              <PropertyBookingCard {...property} onBook={() => console.log(`Booking ${property.propertyName}`)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
