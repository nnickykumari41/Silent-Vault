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

    struct HiddenBeneficiary {
        bytes32 commitment;
        address wallet;
        uint16 shareBps;
        bool revealed;
    }

    struct VaultPolicyInput {
        uint64 inactivityPeriod;
        uint64 gracePeriod;
        uint8 approvalThreshold;
    }

    struct VaultMetadataInput {
        string encryptedPayload;
        bytes32 payloadHash;
        string externalPayloadCid;
        bytes32 externalPayloadHash;
        bytes32 notificationHash;
        bytes32 proofOfLifeHash;
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
        bool hiddenBeneficiaries;
        uint8 approvalThreshold;
        uint8 recoveryApprovals;
        string encryptedPayload;
        bytes32 payloadHash;
        string externalPayloadCid;
        bytes32 externalPayloadHash;
        bytes32 notificationHash;
        bytes32 proofOfLifeHash;
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
        uint8 approvalThreshold;
        uint8 recoveryApprovals;
        bool hiddenBeneficiaries;
        string externalPayloadCid;
        bytes32 externalPayloadHash;
        bytes32 notificationHash;
        bytes32 proofOfLifeHash;
    }

    uint256 public vaultCount;

    mapping(uint256 => Vault) private _vaults;
    mapping(uint256 => Beneficiary[]) private _beneficiaries;
    mapping(uint256 => HiddenBeneficiary[]) private _hiddenBeneficiaries;
    mapping(uint256 => address[]) private _recoveryApprovers;
    mapping(uint256 => mapping(bytes32 => bool)) private _hiddenCommitmentExists;
    mapping(uint256 => mapping(address => bool)) public isVaultBeneficiary;
    mapping(uint256 => mapping(address => bool)) public hasApprovedRecovery;
    mapping(address => uint256[]) private _ownerVaults;
    mapping(address => uint256[]) private _beneficiaryVaults;

    event VaultCreated(uint256 indexed vaultId, address indexed owner, bytes32 payloadHash);
    event CheckIn(uint256 indexed vaultId, address indexed owner, uint64 timestamp);
    event RecoveryStarted(uint256 indexed vaultId, address indexed actor, uint64 unlocksAt, bool emergencyMode);
    event RecoveryApproved(uint256 indexed vaultId, address indexed actor, uint8 approvals, uint8 threshold);
    event RecoveryCancelled(uint256 indexed vaultId, address indexed owner);
    event VaultUnlocked(uint256 indexed vaultId, address indexed actor);
    event BeneficiaryRotated(uint256 indexed vaultId, address indexed owner, address indexed oldWallet, address newWallet);
    event HiddenBeneficiaryRotated(uint256 indexed vaultId, address indexed owner, bytes32 oldCommitment, bytes32 newCommitment);
    event HiddenBeneficiaryRevealed(uint256 indexed vaultId, address indexed beneficiary, bytes32 commitment);
    event VaultMetadataUpdated(
        uint256 indexed vaultId,
        bytes32 payloadHash,
        bytes32 externalPayloadHash,
        bytes32 notificationHash,
        bytes32 proofOfLifeHash
    );

    error EmptyPayload();
    error InvalidBeneficiaries();
    error InvalidVault();
    error NotOwner();
    error NotAuthorized();
    error AlreadyUnlocked();
    error RecoveryAlreadyStarted();
    error RecoveryNotReady();
    error UnlockNotReady();
    error AlreadyApproved();

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
        bytes32[] memory emptyCommitments = new bytes32[](0);
        uint16[] memory emptyShares = new uint16[](0);
        VaultPolicyInput memory policy = VaultPolicyInput({
            inactivityPeriod: inactivityPeriod,
            gracePeriod: gracePeriod,
            approvalThreshold: 1
        });
        VaultMetadataInput memory metadata = VaultMetadataInput({
            encryptedPayload: encryptedPayload,
            payloadHash: payloadHash,
            externalPayloadCid: "",
            externalPayloadHash: bytes32(0),
            notificationHash: bytes32(0),
            proofOfLifeHash: bytes32(0)
        });

        return
            _createVault(
                label,
                beneficiaryWallets,
                sharesBps,
                emptyCommitments,
                emptyShares,
                policy,
                metadata,
                releaseCodeInput,
                assetCountInput,
                primaryBeneficiaryInput
            );
    }

    function createVaultAdvanced(
        string calldata label,
        address[] calldata beneficiaryWallets,
        uint16[] calldata sharesBps,
        bytes32[] calldata hiddenBeneficiaryCommitments,
        uint16[] calldata hiddenSharesBps,
        VaultPolicyInput calldata policy,
        VaultMetadataInput calldata metadata,
        InEuint64 memory releaseCodeInput,
        InEuint32 memory assetCountInput,
        InEaddress memory primaryBeneficiaryInput
    ) external returns (uint256 vaultId) {
        return
            _createVault(
                label,
                beneficiaryWallets,
                sharesBps,
                hiddenBeneficiaryCommitments,
                hiddenSharesBps,
                policy,
                metadata,
                releaseCodeInput,
                assetCountInput,
                primaryBeneficiaryInput
            );
    }

    function checkIn(uint256 vaultId) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();

        vault.lastCheckIn = uint64(block.timestamp);
        _resetRecovery(vaultId);

        emit CheckIn(vaultId, msg.sender, vault.lastCheckIn);
    }

    function startRecovery(uint256 vaultId) external vaultExists(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();
        bool callerIsBeneficiary = isVaultBeneficiary[vaultId][msg.sender];
        if (!callerIsBeneficiary && vault.owner != msg.sender) revert NotAuthorized();
        if (!isRecoveryReady(vaultId)) revert RecoveryNotReady();
        if (vault.triggerStartedAt != 0) revert RecoveryAlreadyStarted();

        vault.triggerStartedAt = uint64(block.timestamp);
        vault.emergencyMode = false;

        emit RecoveryStarted(vaultId, msg.sender, uint64(block.timestamp + vault.gracePeriod), false);

        if (callerIsBeneficiary) {
            _approveRecovery(vaultId, msg.sender);
        }
    }

    function approveRecovery(uint256 vaultId) external vaultExists(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();
        if (!isVaultBeneficiary[vaultId][msg.sender]) revert NotAuthorized();
        if (vault.triggerStartedAt == 0 || vault.emergencyMode) revert RecoveryNotReady();

        _approveRecovery(vaultId, msg.sender);
    }

    function triggerEmergency(uint256 vaultId) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();

        _resetApprovals(vaultId);
        vault.triggerStartedAt = uint64(block.timestamp);
        vault.emergencyMode = true;

        emit RecoveryStarted(vaultId, msg.sender, uint64(block.timestamp + vault.gracePeriod), true);
    }

    function cancelRecovery(uint256 vaultId) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();

        _resetRecovery(vaultId);
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

    function revealHiddenBeneficiary(uint256 vaultId, bytes32 salt) external vaultExists(vaultId) {
        bytes32 commitment = computeHiddenBeneficiaryCommitment(msg.sender, salt);
        HiddenBeneficiary[] storage hiddenBeneficiaries = _hiddenBeneficiaries[vaultId];

        for (uint256 i = 0; i < hiddenBeneficiaries.length; i++) {
            HiddenBeneficiary storage hiddenBeneficiary = hiddenBeneficiaries[i];
            if (hiddenBeneficiary.commitment != commitment) continue;

            if (!hiddenBeneficiary.revealed) {
                if (isVaultBeneficiary[vaultId][msg.sender]) revert InvalidBeneficiaries();
                hiddenBeneficiary.wallet = msg.sender;
                hiddenBeneficiary.revealed = true;
                isVaultBeneficiary[vaultId][msg.sender] = true;
                _beneficiaryVaults[msg.sender].push(vaultId);
                emit HiddenBeneficiaryRevealed(vaultId, msg.sender, commitment);
            }

            if (_vaults[vaultId].unlocked) {
                _grantBeneficiaryAccess(vaultId);
            }
            return;
        }

        revert NotAuthorized();
    }

    function rotateBeneficiary(
        uint256 vaultId,
        address oldWallet,
        address newWallet
    ) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();
        if (
            oldWallet == address(0) ||
            newWallet == address(0) ||
            oldWallet == newWallet ||
            isVaultBeneficiary[vaultId][newWallet]
        ) {
            revert InvalidBeneficiaries();
        }

        bool rotated;
        Beneficiary[] storage publicBeneficiaries = _beneficiaries[vaultId];
        for (uint256 i = 0; i < publicBeneficiaries.length; i++) {
            if (publicBeneficiaries[i].wallet == oldWallet) {
                publicBeneficiaries[i].wallet = newWallet;
                rotated = true;
                break;
            }
        }

        if (!rotated) {
            HiddenBeneficiary[] storage hiddenBeneficiaries = _hiddenBeneficiaries[vaultId];
            for (uint256 i = 0; i < hiddenBeneficiaries.length; i++) {
                if (hiddenBeneficiaries[i].revealed && hiddenBeneficiaries[i].wallet == oldWallet) {
                    hiddenBeneficiaries[i].wallet = newWallet;
                    rotated = true;
                    break;
                }
            }
        }

        if (!rotated) revert NotAuthorized();

        isVaultBeneficiary[vaultId][oldWallet] = false;
        isVaultBeneficiary[vaultId][newWallet] = true;
        _removeBeneficiaryVault(oldWallet, vaultId);
        _beneficiaryVaults[newWallet].push(vaultId);
        _resetRecovery(vaultId);

        emit BeneficiaryRotated(vaultId, msg.sender, oldWallet, newWallet);
    }

    function rotateHiddenBeneficiaryCommitment(
        uint256 vaultId,
        bytes32 oldCommitment,
        bytes32 newCommitment
    ) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();
        if (oldCommitment == bytes32(0) || newCommitment == bytes32(0) || _hiddenCommitmentExists[vaultId][newCommitment]) {
            revert InvalidBeneficiaries();
        }

        HiddenBeneficiary[] storage hiddenBeneficiaries = _hiddenBeneficiaries[vaultId];
        for (uint256 i = 0; i < hiddenBeneficiaries.length; i++) {
            HiddenBeneficiary storage hiddenBeneficiary = hiddenBeneficiaries[i];
            if (hiddenBeneficiary.commitment == oldCommitment && !hiddenBeneficiary.revealed) {
                hiddenBeneficiary.commitment = newCommitment;
                _hiddenCommitmentExists[vaultId][oldCommitment] = false;
                _hiddenCommitmentExists[vaultId][newCommitment] = true;
                _resetRecovery(vaultId);
                emit HiddenBeneficiaryRotated(vaultId, msg.sender, oldCommitment, newCommitment);
                return;
            }
        }

        revert NotAuthorized();
    }

    function updateVaultMetadata(
        uint256 vaultId,
        string calldata encryptedPayload,
        bytes32 payloadHash,
        string calldata externalPayloadCid,
        bytes32 externalPayloadHash,
        bytes32 notificationHash,
        bytes32 proofOfLifeHash
    ) external vaultExists(vaultId) onlyOwner(vaultId) {
        Vault storage vault = _vaults[vaultId];
        if (vault.unlocked) revert AlreadyUnlocked();
        if (bytes(encryptedPayload).length == 0 || payloadHash == bytes32(0)) revert EmptyPayload();

        vault.encryptedPayload = encryptedPayload;
        vault.payloadHash = payloadHash;
        vault.externalPayloadCid = externalPayloadCid;
        vault.externalPayloadHash = externalPayloadHash;
        vault.notificationHash = notificationHash;
        vault.proofOfLifeHash = proofOfLifeHash;

        emit VaultMetadataUpdated(vaultId, payloadHash, externalPayloadHash, notificationHash, proofOfLifeHash);
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
            beneficiaryCount: _beneficiaries[vaultId].length + _hiddenBeneficiaries[vaultId].length,
            approvalThreshold: vault.approvalThreshold,
            recoveryApprovals: vault.recoveryApprovals,
            hiddenBeneficiaries: vault.hiddenBeneficiaries,
            externalPayloadCid: vault.externalPayloadCid,
            externalPayloadHash: vault.externalPayloadHash,
            notificationHash: vault.notificationHash,
            proofOfLifeHash: vault.proofOfLifeHash
        });
    }

    function getBeneficiaries(uint256 vaultId) external view vaultExists(vaultId) returns (Beneficiary[] memory) {
        Beneficiary[] storage publicBeneficiaries = _beneficiaries[vaultId];
        HiddenBeneficiary[] storage hiddenBeneficiaries = _hiddenBeneficiaries[vaultId];
        Beneficiary[] memory beneficiaries = new Beneficiary[](publicBeneficiaries.length + hiddenBeneficiaries.length);

        for (uint256 i = 0; i < publicBeneficiaries.length; i++) {
            beneficiaries[i] = publicBeneficiaries[i];
        }

        for (uint256 i = 0; i < hiddenBeneficiaries.length; i++) {
            HiddenBeneficiary storage hiddenBeneficiary = hiddenBeneficiaries[i];
            beneficiaries[publicBeneficiaries.length + i] = Beneficiary({
                wallet: hiddenBeneficiary.revealed ? hiddenBeneficiary.wallet : address(0),
                shareBps: hiddenBeneficiary.shareBps
            });
        }

        return beneficiaries;
    }

    function getHiddenBeneficiaryCommitments(uint256 vaultId) external view vaultExists(vaultId) returns (bytes32[] memory) {
        HiddenBeneficiary[] storage hiddenBeneficiaries = _hiddenBeneficiaries[vaultId];
        bytes32[] memory commitments = new bytes32[](hiddenBeneficiaries.length);

        for (uint256 i = 0; i < hiddenBeneficiaries.length; i++) {
            commitments[i] = hiddenBeneficiaries[i].commitment;
        }

        return commitments;
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
        if (block.timestamp < uint256(vault.triggerStartedAt) + uint256(vault.gracePeriod)) return false;
        return vault.emergencyMode || vault.recoveryApprovals >= vault.approvalThreshold;
    }

    function computeHiddenBeneficiaryCommitment(address wallet, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(wallet, salt));
    }

    function _createVault(
        string calldata label,
        address[] calldata beneficiaryWallets,
        uint16[] calldata sharesBps,
        bytes32[] memory hiddenBeneficiaryCommitments,
        uint16[] memory hiddenSharesBps,
        VaultPolicyInput memory policy,
        VaultMetadataInput memory metadata,
        InEuint64 memory releaseCodeInput,
        InEuint32 memory assetCountInput,
        InEaddress memory primaryBeneficiaryInput
    ) private returns (uint256 vaultId) {
        if (bytes(metadata.encryptedPayload).length == 0 || metadata.payloadHash == bytes32(0)) revert EmptyPayload();
        _validateBeneficiaries(beneficiaryWallets, sharesBps, hiddenBeneficiaryCommitments, hiddenSharesBps, policy.approvalThreshold);

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
        vault.inactivityPeriod = policy.inactivityPeriod;
        vault.gracePeriod = policy.gracePeriod;
        vault.approvalThreshold = policy.approvalThreshold;
        vault.lastCheckIn = nowTs;
        vault.encryptedPayload = metadata.encryptedPayload;
        vault.payloadHash = metadata.payloadHash;
        vault.externalPayloadCid = metadata.externalPayloadCid;
        vault.externalPayloadHash = metadata.externalPayloadHash;
        vault.notificationHash = metadata.notificationHash;
        vault.proofOfLifeHash = metadata.proofOfLifeHash;
        vault.releaseCode = releaseCode;
        vault.assetCount = assetCount;
        vault.primaryBeneficiary = primaryBeneficiary;
        vault.hiddenBeneficiaries = hiddenBeneficiaryCommitments.length > 0;
        vault.exists = true;

        _ownerVaults[msg.sender].push(vaultId);

        for (uint256 i = 0; i < beneficiaryWallets.length; i++) {
            address beneficiary = beneficiaryWallets[i];
            _beneficiaries[vaultId].push(Beneficiary({wallet: beneficiary, shareBps: sharesBps[i]}));
            isVaultBeneficiary[vaultId][beneficiary] = true;
            _beneficiaryVaults[beneficiary].push(vaultId);
        }

        for (uint256 i = 0; i < hiddenBeneficiaryCommitments.length; i++) {
            bytes32 commitment = hiddenBeneficiaryCommitments[i];
            _hiddenBeneficiaries[vaultId].push(
                HiddenBeneficiary({commitment: commitment, wallet: address(0), shareBps: hiddenSharesBps[i], revealed: false})
            );
            _hiddenCommitmentExists[vaultId][commitment] = true;
        }

        emit VaultCreated(vaultId, msg.sender, metadata.payloadHash);
        emit VaultMetadataUpdated(
            vaultId,
            metadata.payloadHash,
            metadata.externalPayloadHash,
            metadata.notificationHash,
            metadata.proofOfLifeHash
        );
    }

    function _validateBeneficiaries(
        address[] calldata beneficiaryWallets,
        uint16[] calldata sharesBps,
        bytes32[] memory hiddenBeneficiaryCommitments,
        uint16[] memory hiddenSharesBps,
        uint8 approvalThreshold
    ) private pure {
        uint256 beneficiaryCount = beneficiaryWallets.length + hiddenBeneficiaryCommitments.length;
        if (
            beneficiaryCount == 0 ||
            beneficiaryCount > MAX_BENEFICIARIES ||
            beneficiaryWallets.length != sharesBps.length ||
            hiddenBeneficiaryCommitments.length != hiddenSharesBps.length ||
            approvalThreshold == 0 ||
            approvalThreshold > beneficiaryCount
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

        for (uint256 i = 0; i < hiddenBeneficiaryCommitments.length; i++) {
            if (hiddenBeneficiaryCommitments[i] == bytes32(0) || hiddenSharesBps[i] == 0) revert InvalidBeneficiaries();
            totalShare += hiddenSharesBps[i];
            for (uint256 j = i + 1; j < hiddenBeneficiaryCommitments.length; j++) {
                if (hiddenBeneficiaryCommitments[i] == hiddenBeneficiaryCommitments[j]) revert InvalidBeneficiaries();
            }
        }

        if (totalShare != BPS_DENOMINATOR) revert InvalidBeneficiaries();
    }

    function _approveRecovery(uint256 vaultId, address actor) private {
        if (hasApprovedRecovery[vaultId][actor]) revert AlreadyApproved();

        Vault storage vault = _vaults[vaultId];
        hasApprovedRecovery[vaultId][actor] = true;
        _recoveryApprovers[vaultId].push(actor);
        vault.recoveryApprovals += 1;

        emit RecoveryApproved(vaultId, actor, vault.recoveryApprovals, vault.approvalThreshold);
    }

    function _resetRecovery(uint256 vaultId) private {
        Vault storage vault = _vaults[vaultId];
        vault.triggerStartedAt = 0;
        vault.emergencyMode = false;
        _resetApprovals(vaultId);
    }

    function _resetApprovals(uint256 vaultId) private {
        Vault storage vault = _vaults[vaultId];
        address[] storage approvers = _recoveryApprovers[vaultId];
        for (uint256 i = 0; i < approvers.length; i++) {
            hasApprovedRecovery[vaultId][approvers[i]] = false;
        }

        delete _recoveryApprovers[vaultId];
        vault.recoveryApprovals = 0;
    }

    function _grantBeneficiaryAccess(uint256 vaultId) private {
        Vault storage vault = _vaults[vaultId];
        Beneficiary[] storage beneficiaries = _beneficiaries[vaultId];
        HiddenBeneficiary[] storage hiddenBeneficiaries = _hiddenBeneficiaries[vaultId];

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            _grantVaultAccess(vault, beneficiaries[i].wallet);
        }

        for (uint256 i = 0; i < hiddenBeneficiaries.length; i++) {
            if (hiddenBeneficiaries[i].revealed) {
                _grantVaultAccess(vault, hiddenBeneficiaries[i].wallet);
            }
        }
    }

    function _grantVaultAccess(Vault storage vault, address beneficiary) private {
        FHE.allow(vault.releaseCode, beneficiary);
        FHE.allow(vault.assetCount, beneficiary);
        FHE.allow(vault.primaryBeneficiary, beneficiary);
    }

    function _removeBeneficiaryVault(address beneficiary, uint256 vaultId) private {
        uint256[] storage vaultIds = _beneficiaryVaults[beneficiary];
        for (uint256 i = 0; i < vaultIds.length; i++) {
            if (vaultIds[i] == vaultId) {
                vaultIds[i] = vaultIds[vaultIds.length - 1];
                vaultIds.pop();
                return;
            }
        }
    }
}
