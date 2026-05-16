// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract SilentVault {
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant MAX_BENEFICIARIES = 8;

    struct Beneficiary {
        address wallet;
        uint16 shareBps;
    }

    struct Vault {
        address owner;
        string label;
        uint64 createdAt;
        uint64 inactivityPeriod;
        uint64 gracePeriod;
        uint64 lastCheckIn;
        uint64 triggerStartedAt;
        bool emergencyMode;
        bool unlocked;
        bool exists;
        string encryptedPayload;
        bytes32 payloadHash;
        euint64 releaseCode;
        euint32 assetCount;
        eaddress primaryBeneficiary;
    }

    struct VaultView {
        uint256 id;
        address owner;
        string label;
        uint64 createdAt;
        uint64 inactivityPeriod;
        uint64 gracePeriod;
        uint64 lastCheckIn;
        uint64 triggerStartedAt;
        bool emergencyMode;
        bool unlocked;
        string encryptedPayload;
        bytes32 payloadHash;
        uint256 beneficiaryCount;
    }

    uint256 public vaultCount;

    mapping(uint256 => Vault) private _vaults;
    mapping(uint256 => Beneficiary[]) private _beneficiaries;
    mapping(uint256 => mapping(address => bool)) public isVaultBeneficiary;
    mapping(address => uint256[]) private _ownerVaults;
    mapping(address => uint256[]) private _beneficiaryVaults;

    event VaultCreated(uint256 indexed vaultId, address indexed owner, bytes32 payloadHash);
    event CheckIn(uint256 indexed vaultId, address indexed owner, uint64 timestamp);
    event RecoveryStarted(uint256 indexed vaultId, address indexed actor, uint64 unlocksAt, bool emergencyMode);
    event RecoveryCancelled(uint256 indexed vaultId, address indexed owner);
    event VaultUnlocked(uint256 indexed vaultId, address indexed actor);

    error EmptyPayload();
    error InvalidBeneficiaries();
    error InvalidVault();
    error NotOwner();
    error NotAuthorized();
    error AlreadyUnlocked();
    error RecoveryAlreadyStarted();
    error RecoveryNotReady();
    error UnlockNotReady();

    modifier vaultExists(uint256 vaultId) {
        if (!_vaults[vaultId].exists) revert InvalidVault();
        _;
    }

    modifier onlyOwner(uint256 vaultId) {
        if (_vaults[vaultId].owner != msg.sender) revert NotOwner();
        _;
    }

    function createVault(
        string calldata label,
        address[] calldata beneficiaryWallets,
        uint16[] calldata sharesBps,
        uint64 inactivityPeriod,
        uint64 gracePeriod,
        string calldata encryptedPayload,
        bytes32 payloadHash,
        InEuint64 memory releaseCodeInput,
        InEuint32 memory assetCountInput,
        InEaddress memory primaryBeneficiaryInput
    ) external returns (uint256 vaultId) {
        if (bytes(encryptedPayload).length == 0 || payloadHash == bytes32(0)) revert EmptyPayload();
        _validateBeneficiaries(beneficiaryWallets, sharesBps);

        euint64 releaseCode = FHE.asEuint64(releaseCodeInput);
        euint32 assetCount = FHE.asEuint32(assetCountInput);
        eaddress primaryBeneficiary = FHE.asEaddress(primaryBeneficiaryInput);

        FHE.allowThis(releaseCode);
        FHE.allow(releaseCode, msg.sender);
        FHE.allowThis(assetCount);
        FHE.allow(assetCount, msg.sender);
        FHE.allowThis(primaryBeneficiary);
        FHE.allow(primaryBeneficiary, msg.sender);

        vaultId = ++vaultCount;
        uint64 nowTs = uint64(block.timestamp);

        Vault storage vault = _vaults[vaultId];
        vault.owner = msg.sender;
        vault.label = label;
        vault.createdAt = nowTs;
        vault.inactivityPeriod = inactivityPeriod;
        vault.gracePeriod = gracePeriod;
        vault.lastCheckIn = nowTs;
        vault.encryptedPayload = encryptedPayload;
        vault.payloadHash = payloadHash;
        vault.releaseCode = releaseCode;
        vault.assetCount = assetCount;
        vault.primaryBeneficiary = primaryBeneficiary;
        vault.exists = true;

        _ownerVaults[msg.sender].push(vaultId);

        for (uint256 i = 0; i < beneficiaryWallets.length; i++) {
            address beneficiary = beneficiaryWallets[i];
            _beneficiaries[vaultId].push(Beneficiary({wallet: beneficiary, shareBps: sharesBps[i]}));
            isVaultBeneficiary[vaultId][beneficiary] = true;
            _beneficiaryVaults[beneficiary].push(vaultId);
        }

        emit VaultCreated(vaultId, msg.sender, payloadHash);
    }

    function checkIn(uint256 vaultId) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();

        vault.lastCheckIn = uint64(block.timestamp);
        vault.triggerStartedAt = 0;
        vault.emergencyMode = false;

        emit CheckIn(vaultId, msg.sender, vault.lastCheckIn);
    }

    function startRecovery(uint256 vaultId) external vaultExists(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();
        if (!isVaultBeneficiary[vaultId][msg.sender] && vault.owner != msg.sender) revert NotAuthorized();
        if (!isRecoveryReady(vaultId)) revert RecoveryNotReady();
        if (vault.triggerStartedAt != 0) revert RecoveryAlreadyStarted();

        vault.triggerStartedAt = uint64(block.timestamp);
        vault.emergencyMode = false;

        emit RecoveryStarted(vaultId, msg.sender, uint64(block.timestamp + vault.gracePeriod), false);
    }

    function triggerEmergency(uint256 vaultId) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();

        vault.triggerStartedAt = uint64(block.timestamp);
        vault.emergencyMode = true;

        emit RecoveryStarted(vaultId, msg.sender, uint64(block.timestamp + vault.gracePeriod), true);
    }

    function cancelRecovery(uint256 vaultId) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();

        vault.triggerStartedAt = 0;
        vault.emergencyMode = false;
        vault.lastCheckIn = uint64(block.timestamp);

        emit RecoveryCancelled(vaultId, msg.sender);
    }

    function unlockVault(uint256 vaultId) external vaultExists(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();
        if (!isVaultBeneficiary[vaultId][msg.sender] && vault.owner != msg.sender) revert NotAuthorized();
        if (!canUnlock(vaultId)) revert UnlockNotReady();

        vault.unlocked = true;
        _grantBeneficiaryAccess(vaultId);

        emit VaultUnlocked(vaultId, msg.sender);
    }

    function grantUnlockedAccess(uint256 vaultId) external vaultExists(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (!vault.unlocked) revert UnlockNotReady();
        if (!isVaultBeneficiary[vaultId][msg.sender] && vault.owner != msg.sender) revert NotAuthorized();

        _grantBeneficiaryAccess(vaultId);
    }

    function getVault(uint256 vaultId) external view vaultExists(vaultId) returns (VaultView memory) {
        Vault storage vault = _vaults[vaultId];
        return VaultView({
            id: vaultId,
            owner: vault.owner,
            label: vault.label,
            createdAt: vault.createdAt,
            inactivityPeriod: vault.inactivityPeriod,
            gracePeriod: vault.gracePeriod,
            lastCheckIn: vault.lastCheckIn,
            triggerStartedAt: vault.triggerStartedAt,
            emergencyMode: vault.emergencyMode,
            unlocked: vault.unlocked,
            encryptedPayload: vault.encryptedPayload,
            payloadHash: vault.payloadHash,
            beneficiaryCount: _beneficiaries[vaultId].length
        });
    }

    function getBeneficiaries(uint256 vaultId) external view vaultExists(vaultId) returns (Beneficiary[] memory) {
        return _beneficiaries[vaultId];
    }

    function getEncryptedHandles(
        uint256 vaultId
    ) external view vaultExists(vaultId) returns (euint64 releaseCode, euint32 assetCount, eaddress primaryBeneficiary) {
        Vault storage vault = _vaults[vaultId];
        return (vault.releaseCode, vault.assetCount, vault.primaryBeneficiary);
    }

    function getVaultsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerVaults[owner];
    }

    function getVaultsByBeneficiary(address beneficiary) external view returns (uint256[] memory) {
        return _beneficiaryVaults[beneficiary];
    }

    function isRecoveryReady(uint256 vaultId) public view vaultExists(vaultId) returns (bool) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) return false;
        return block.timestamp >= uint256(vault.lastCheckIn) + uint256(vault.inactivityPeriod);
    }

    function canUnlock(uint256 vaultId) public view vaultExists(vaultId) returns (bool) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked || vault.triggerStartedAt == 0) return false;
        return block.timestamp >= uint256(vault.triggerStartedAt) + uint256(vault.gracePeriod);
    }

    function _validateBeneficiaries(address[] calldata beneficiaryWallets, uint16[] calldata sharesBps) private pure {
        if (
            beneficiaryWallets.length == 0 ||
            beneficiaryWallets.length != sharesBps.length ||
            beneficiaryWallets.length > MAX_BENEFICIARIES
        ) {
            revert InvalidBeneficiaries();
        }

        uint256 totalShare;
        for (uint256 i = 0; i < beneficiaryWallets.length; i++) {
            if (beneficiaryWallets[i] == address(0) || sharesBps[i] == 0) revert InvalidBeneficiaries();
            totalShare += sharesBps[i];
            for (uint256 j = i + 1; j < beneficiaryWallets.length; j++) {
                if (beneficiaryWallets[i] == beneficiaryWallets[j]) revert InvalidBeneficiaries();
            }
        }

        if (totalShare != BPS_DENOMINATOR) revert InvalidBeneficiaries();
    }

    function _grantBeneficiaryAccess(uint256 vaultId) private {
        Vault storage vault = _vaults[vaultId];
        Beneficiary[] storage beneficiaries = _beneficiaries[vaultId];

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            address beneficiary = beneficiaries[i].wallet;
            FHE.allow(vault.releaseCode, beneficiary);
            FHE.allow(vault.assetCount, beneficiary);
            FHE.allow(vault.primaryBeneficiary, beneficiary);
        }
    }
}
