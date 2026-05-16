import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const faqs = [
  {
    question: "What is stored on-chain?",
    answer:
      "SilentVault stores the encrypted recovery payload, payload hash, beneficiaries, distribution shares, check-in timer, grace period, trigger state, and CoFHE encrypted handles in the contract.",
  },
  {
    question: "Can the contract read my secret?",
    answer:
      "No. The long-form note is encrypted locally in the browser. The release code, asset count, and primary beneficiary are CoFHE encrypted state, so the contract controls access without learning the plaintext.",
  },
  {
    question: "When can beneficiaries decrypt?",
    answer:
      "Beneficiaries can start recovery only after the inactivity timer is ready. After the grace period, unlocking the vault grants them CoFHE ACL permission to decrypt the release code locally.",
  },
  {
    question: "Can the owner stop a false trigger?",
    answer:
      "Yes. The owner can check in or cancel recovery before unlock. Either action resets the trigger and keeps the recovery payload locked.",
  },
  {
    question: "Does this move funds automatically?",
    answer:
      "The MVP focuses on encrypted recovery instructions and access control. It can point heirs to wallets, documents, and recovery steps without exposing seed phrases before unlock.",
  },
  {
    question: "Which networks are supported?",
    answer:
      "The configuration supports CoFHE-compatible Sepolia, Arbitrum Sepolia, and Base Sepolia. The frontend defaults to Ethereum Sepolia unless NEXT_PUBLIC_CHAIN_ID is changed.",
  },
]

export function FAQSection() {
  return (
    <section id="faq" className="py-32 px-6 pb-80">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-normal mb-6 text-balance font-serif">Frequently asked questions</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about the SilentVault MVP and the on-chain recovery flow.
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-3 py-0 my-0">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="bg-card border border-border rounded-xl px-6 data-[state=open]:border-foreground/30"
            >
              <AccordionTrigger className="text-left text-base font-medium text-foreground hover:no-underline py-5">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-5 leading-relaxed text-sm">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
