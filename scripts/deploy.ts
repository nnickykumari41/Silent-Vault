import hre from "hardhat"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const explorers: Record<string, string> = {
  "eth-sepolia": "https://sepolia.etherscan.io",
  "arb-sepolia": "https://sepolia.arbiscan.io",
  "base-sepolia": "https://sepolia.basescan.org",
}

function deploymentFileName(networkName: string) {
  if (networkName === "eth-sepolia") return "sepolia.json"
  return `${networkName}.json`
}

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const network = await hre.ethers.provider.getNetwork()
  const networkName = hre.network.name

  console.log(`Deploying SilentVault from ${deployer.address}`)
  console.log(`Network: ${networkName} (${network.chainId})`)

  const SilentVault = await hre.ethers.getContractFactory("SilentVault")
  const silentVault = await SilentVault.deploy()
  await silentVault.waitForDeployment()

  const address = await silentVault.getAddress()
  console.log(`SilentVault deployed to: ${address}`)

  const explorer = explorers[networkName] ? `${explorers[networkName]}/address/${address}` : ""
  const deployment = {
    network: networkName,
    chainId: Number(network.chainId),
    contract: "SilentVault",
    address,
    deployer: deployer.address,
    explorer,
    deployedAt: new Date().toISOString(),
  }

  const deploymentsDir = join(process.cwd(), "deployments")
  await mkdir(deploymentsDir, { recursive: true })
  const path = join(deploymentsDir, deploymentFileName(networkName))
  await writeFile(path, `${JSON.stringify(deployment, null, 2)}\n`)
  console.log(`Deployment metadata written to: ${path}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
