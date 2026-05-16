import hre from "hardhat"

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const network = await hre.ethers.provider.getNetwork()

  console.log(`Deploying SilentVault from ${deployer.address}`)
  console.log(`Network: ${network.name} (${network.chainId})`)

  const SilentVault = await hre.ethers.getContractFactory("SilentVault")
  const silentVault = await SilentVault.deploy()
  await silentVault.waitForDeployment()

  const address = await silentVault.getAddress()
  console.log(`SilentVault deployed to: ${address}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
