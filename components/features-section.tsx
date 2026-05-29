"use client"

import { Check } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { RealtimePropertyCard } from "./realtime-property-card"

const features = [
  "Create a vault in one transaction",
  "Encrypt release secrets with CoFHE",
  "Assign up to 8 beneficiaries",
  "Manual check-in heartbeat",
  "Emergency panic trigger",
  "Beneficiary decrypt after unlock",
]

const allTransactions = [
  { name: "Vault created", amount: "+1", category: "Encrypted state", color: "from-emerald-400 to-teal-500" },
  { name: "Check-in confirmed", amount: "+1", category: "Owner active", color: "from-blue-400 to-indigo-500" },
  { name: "Beneficiary added", amount: "+1", category: "Access policy", color: "from-amber-400 to-orange-500" },
  { name: "Emergency armed", amount: "+1", category: "Panic mode", color: "from-rose-400 to-pink-500" },
  { name: "Recovery started", amount: "+1", category: "Grace period", color: "from-violet-400 to-purple-500" },
  { name: "Vault unlocked", amount: "+1", category: "ACL granted", color: "from-cyan-400 to-blue-500" },
  { name: "Secret decrypted", amount: "+1", category: "Local view", color: "from-lime-400 to-green-500" },
  { name: "Payload verified", amount: "+1", category: "Hash match", color: "from-fuchsia-400 to-pink-500" },
]

export function FeaturesSection() {
  const [balance, setBalance] = useState(12458.32)
  const [monthlyGrowth] = useState(23.5)
  const scrollRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const scrollPosition = useRef(0)
  const lastUpdateTime = useRef(0)

  const tripleTransactions = [...allTransactions, ...allTransactions, ...allTransactions]

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!scrollRef.current) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      if (!lastUpdateTime.current) lastUpdateTime.current = timestamp
      const deltaTime = timestamp - lastUpdateTime.current
      lastUpdateTime.current = timestamp

      scrollPosition.current += (deltaTime / 1000) * 35

      const singleSetHeight = scrollRef.current.scrollHeight / 3

      if (scrollPosition.current >= singleSetHeight) {
        scrollPosition.current = 0

        const randomTransaction = allTransactions[Math.floor(Math.random() * allTransactions.length)]
        const amount = Number.parseFloat(randomTransaction.amount.replace(/[$,]/g, ""))
        setBalance((prev) => prev + amount)
      }

      scrollRef.current.style.transform = `translateY(-${scrollPosition.current}px)`
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return (
    <section id="features" className="py-32 px-6 relative overflow-hidden">
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-center pointer-events-none z-0">
        <span className="font-bold text-center text-[20vw] sm:text-[18vw] md:text-[16vw] lg:text-[14vw] leading-none tracking-tighter text-zinc-100 whitespace-nowrap">
          MANAGE
        </span>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="order-2 lg:order-1">
            <RealtimePropertyCard />
          </div>

          <div className="order-1 lg:order-2 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-5xl font-normal mb-6 text-balance font-serif">
                Manage private recovery without leaking the secret
              </h2>
              <p className="text-muted-foreground leading-relaxed text-lg">
                The dashboard follows the on-chain lifecycle: locked, recovery pending, emergency mode, unlocked, and
                decrypted locally by an authorized wallet.
              </p>
            </motion.div>

            <div className="grid sm:grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="flex items-center p-3 rounded-xl hover:bg-zinc-50 transition-colors duration-300 gap-2 py-1"
                >
                  <div className="w-6 h-6 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-sm text-foreground">{feature}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
