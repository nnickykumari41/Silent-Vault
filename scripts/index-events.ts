import hre from "hardhat"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const eventNames = [
  "VaultCreated",
  "CheckIn",
  "RecoveryStarted",
  "RecoveryApproved",
  "RecoveryCancelled",
  "VaultUnlocked",
  "BeneficiaryRotated",
  "HiddenBeneficiaryRotated",
  "HiddenBeneficiaryRevealed",
  "VaultMetadataUpdated",
]

function stringify(value: unknown) {
  return JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  )
}

async function readDeploymentAddress() {
  const envAddress = process.env.NEXT_PUBLIC_SILENT_VAULT_ADDRESS
  if (/^0x[a-fA-F0-9]{40}$/.test(envAddress || "")) return envAddress as string

  const deploymentPath = join(process.cwd(), "deployments", hre.network.name === "eth-sepolia" ? "sepolia.json" : `${hre.network.name}.json`)
  const deployment = JSON.parse(await readFile(deploymentPath, "utf8")) as { address?: string }
  const address = deployment.address
  if (!/^0x[a-fA-F0-9]{40}$/.test(address || "")) {
    throw new Error("No SilentVault address found in env or deployment metadata")
  }

  return address as string
}

async function main() {
  const address = await readDeploymentAddress()
  const contract = await hre.ethers.getContractAt("SilentVault", address)
  const latestBlock = await hre.ethers.provider.getBlockNumber()
  const fromBlock = process.env.INDEX_FROM_BLOCK ? Number(process.env.INDEX_FROM_BLOCK) : Math.max(0, latestBlock - 50_000)
  const chunkSize = Number(process.env.INDEX_BLOCK_CHUNK || 45_000)
  if (!Number.isSafeInteger(fromBlock) || fromBlock < 0 || fromBlock > latestBlock) {
    throw new Error("INDEX_FROM_BLOCK must be a non-negative block number no greater than the latest block")
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 45_000) {
    throw new Error("INDEX_BLOCK_CHUNK must be an integer between 1 and 45000")
  }

  const indexed = []
  for (const eventName of eventNames) {
    const filter = (contract.filters as any)[eventName]()
    for (let startBlock = fromBlock; startBlock <= latestBlock; startBlock += chunkSize) {
      const endBlock = Math.min(latestBlock, startBlock + chunkSize - 1)
      const logs = await contract.queryFilter(filter, startBlock, endBlock)
      for (const log of logs) {
        const event = log as any
        indexed.push({
          event: event.fragment?.name || eventName,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: event.index,
          args: event.args?.toObject?.() || {},
        })
      }
    }
  }

  indexed.sort((a, b) => {
    const blockDelta = BigInt(b.blockNumber) - BigInt(a.blockNumber)
    if (blockDelta !== 0n) return Number(blockDelta)
    return Number(BigInt(b.logIndex) - BigInt(a.logIndex))
  })

  const output = {
    network: hre.network.name,
    address,
    indexedAt: new Date().toISOString(),
    events: indexed,
  }

  const deploymentsDir = join(process.cwd(), "deployments")
  await mkdir(deploymentsDir, { recursive: true })
  const outputPath = join(deploymentsDir, "events-cache.json")
  await writeFile(outputPath, `${stringify(output)}\n`)
  console.log(`Indexed ${indexed.length} events into ${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
