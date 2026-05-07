import "@stdlib/deploy";

const ERR_NOT_OWNER: Int = 100;
const ERR_NOT_FACTORY: Int = 101;
const ERR_NOT_TREASURY: Int = 102;
const ERR_NOT_STARTED: Int = 103;
const ERR_ENDED: Int = 104;
const ERR_MIN_CONTRIBUTION: Int = 105;
const ERR_MAX_CONTRIBUTION: Int = 106;
const ERR_HARD_CAP: Int = 107;
const ERR_NOT_ENDED: Int = 108;
const ERR_SOFT_CAP_NOT_MET: Int = 109;
const ERR_SOFT_CAP_MET: Int = 110;
const ERR_NO_CONTRIBUTION: Int = 111;
const ERR_ALREADY_DONE: Int = 112;
const ERR_NOT_MIGRATED: Int = 113;
const ERR_BUYBACK_DISABLED: Int = 114;
const ERR_BUYBACK_NOT_STARTED: Int = 115;
const ERR_NO_BUYBACK_AVAILABLE: Int = 116;
const ERR_BAD_BUYBACK_PERCENT: Int = 117;
const ERR_BAD_BUYBACK_CHUNK: Int = 118;
const ERR_BAD_TIME: Int = 119;
const ERR_BAD_CAPS: Int = 120;
const ERR_BAD_ALLOCATION: Int = 121;
const ERR_NOT_TOKEN_OWNER: Int = 122;
const ERR_INSUFFICIENT_BALANCE: Int = 123;

const BPS_DENOMINATOR: Int = 10000;
const PERCENT_DENOMINATOR: Int = 100;
const MAX_BUYBACK_BPS: Int = 4000;
const TOKEN_TRANSFER_GAS: Int = 100000000;
const DEPLOY_VALUE: Int = 50000000;
const TOKEN_DEPLOY_VALUE: Int = 250000000;
const JETTON_FORWARD_TON: Int = 1;

message LaunchToken {
    name: String;
    symbol: String;
    description: String;
    metadata: Cell;
    totalSupply: Int;
    decimals: Int;
    presalePercent: Int;
    liquidityPercentTokens: Int;
    creatorPercent: Int;
    treasuryAddress: Address;
    dexAdapter: Address;
    buybackWallet: Address;
    presaleRate: Int;
    softCap: Int;
    hardCap: Int;
    minContribution: Int;
    maxContribution: Int;
    startTime: Int;
    endTime: Int;
    liquidityPercentOfRaised: Int;
    buybackEnabled: Bool;
    buybackPercentBps: Int;
    buybackChunkBps: Int;
    buybackIntervalSeconds: Int;
}

message MintToken {
    to: Address;
    amount: Int;
}

message(0xf8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int;
    destination: Address;
    responseDestination: Address?;
    customPayload: Cell?;
    forwardTonAmount: Int;
    forwardPayload: Cell;
}

message(0x178d4519) JettonInternalTransfer {
    queryId: Int as uint64;
    amount: Int;
    from: Address;
    responseAddress: Address?;
    forwardTonAmount: Int;
    forwardPayload: Cell;
}

message Contribute {}
message MigrateLiquidity {}
message ClaimTokens {}
message Refund {}
message WithdrawTreasury {}
message RecoverFailedTokens {}
message ExecuteBuyback {}
message Pause {}
message Unpause {}
message CancelSale {}

message AddLiquidity {
    token: Address;
    tokenAmount: Int;
    requester: Address;
}

message ExecuteDexBuyback {
    token: Address;
    requester: Address;
}

struct LaunchRecord {
    token: Address;
    pool: Address;
    creator: Address;
}

struct JettonData {
    totalSupply: Int;
    mintable: Bool;
    admin: Address;
    content: Cell;
    walletCode: Cell;
}

struct JettonWalletData {
    balance: Int;
    owner: Address;
    master: Address;
    walletCode: Cell;
}

struct TokenMetadata {
    factory: Address;
    name: String;
    symbol: String;
    description: String;
    metadata: Cell;
    totalSupply: Int;
    decimals: Int;
}

struct PresaleState {
    totalRaised: Int;
    totalSold: Int;
    finalized: Bool;
    failed: Bool;
    cancelled: Bool;
    paused: Bool;
    migrationDone: Bool;
    liquidityTON: Int;
    buybackReserve: Int;
    buybackReleased: Int;
    treasuryWithdrawn: Int;
}

struct PresaleConfig {
    factory: Address;
    creator: Address;
    token: Address;
    treasuryAddress: Address;
    dexAdapter: Address;
    buybackWallet: Address;
    presaleRate: Int;
    softCap: Int;
    hardCap: Int;
    minContribution: Int;
    maxContribution: Int;
    startTime: Int;
    endTime: Int;
    liquidityPercentOfRaised: Int;
    buybackEnabled: Bool;
    buybackPercentBps: Int;
    buybackChunkBps: Int;
    buybackIntervalSeconds: Int;
    presaleTokenAllocation: Int;
    liquidityTokenAllocation: Int;
}

struct DexState {
    totalLiquidityTON: Int;
    totalLiquidityTokens: Int;
    totalBuybackTON: Int;
    migrations: Int;
    buybacks: Int;
}

contract LaunchpadJettonMaster with Deployable {
    factory: Address;
    name: String;
    symbol: String;
    description: String;
    metadata: Cell;
    totalSupply: Int;
    decimals: Int;
    mintedSupply: Int;

    init(factory: Address, name: String, symbol: String, description: String, metadata: Cell, totalSupply: Int, decimals: Int) {
        self.factory = factory;
        self.name = name;
        self.symbol = symbol;
        self.description = description;
        self.metadata = metadata;
        self.totalSupply = totalSupply;
        self.decimals = decimals;
        self.mintedSupply = 0;
    }

    receive(msg: MintToken) {
        throwUnless(ERR_NOT_FACTORY, context().sender == self.factory);
        throwUnless(ERR_BAD_ALLOCATION, self.mintedSupply + msg.amount <= self.totalSupply);
        self.mintedSupply += msg.amount;

        deploy(DeployParameters{
            init: initOf JettonWallet(myAddress(), msg.to),
            value: TOKEN_TRANSFER_GAS,
            mode: SendIgnoreErrors,
            bounce: false,
            body: JettonInternalTransfer{
                queryId: 0,
                amount: msg.amount,
                from: myAddress(),
                responseAddress: null,
                forwardTonAmount: 0,
                forwardPayload: emptyCell()
            }.toCell()
        });
    }

    get fun getWalletAddress(owner: Address): Address {
        return contractAddress(initOf JettonWallet(myAddress(), owner));
    }

    get fun get_wallet_address(owner: Address): Address {
        return contractAddress(initOf JettonWallet(myAddress(), owner));
    }

    get fun getJettonData(): JettonData {
        return JettonData{
            totalSupply: self.mintedSupply,
            mintable: self.mintedSupply < self.totalSupply,
            admin: self.factory,
            content: self.metadata,
            walletCode: codeOf JettonWallet
        };
    }

    get fun get_jetton_data(): JettonData {
        return JettonData{
            totalSupply: self.mintedSupply,
            mintable: self.mintedSupply < self.totalSupply,
            admin: self.factory,
            content: self.metadata,
            walletCode: codeOf JettonWallet
        };
    }

    get fun getTokenMetadata(): TokenMetadata {
        return TokenMetadata{
            factory: self.factory,
            name: self.name,
            symbol: self.symbol,
            description: self.description,
            metadata: self.metadata,
            totalSupply: self.totalSupply,
            decimals: self.decimals
        };
    }
}

contract JettonWallet with Deployable {
    master: Address;
    owner: Address;
    balance: Int;

    init(master: Address, owner: Address) {
        self.master = master;
        self.owner = owner;
        self.balance = 0;
    }

    receive(msg: JettonInternalTransfer) {
        let sender: Address = context().sender;
        let expectedSourceWallet: Address = contractAddress(initOf JettonWallet(self.master, msg.from));
        throwUnless(ERR_NOT_FACTORY, sender == self.master || sender == expectedSourceWallet);
        self.balance += msg.amount;
    }

    receive(msg: JettonTransfer) {
        throwUnless(ERR_NOT_TOKEN_OWNER, context().sender == self.owner);
        throwUnless(ERR_INSUFFICIENT_BALANCE, self.balance >= msg.amount);

        self.balance -= msg.amount;
        let destinationInit: StateInit = initOf JettonWallet(self.master, msg.destination);
        deploy(DeployParameters{
            init: destinationInit,
            value: TOKEN_TRANSFER_GAS + msg.forwardTonAmount,
            mode: SendIgnoreErrors,
            bounce: false,
            body: JettonInternalTransfer{
                queryId: msg.queryId,
                amount: msg.amount,
                from: self.owner,
                responseAddress: msg.responseDestination,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload
            }.toCell()
        });
    }

    get fun getWalletData(): JettonWalletData {
        return JettonWalletData{
            balance: self.balance,
            owner: self.owner,
            master: self.master,
            walletCode: codeOf JettonWallet
        };
    }

    get fun get_wallet_data(): JettonWalletData {
        return JettonWalletData{
            balance: self.balance,
            owner: self.owner,
            master: self.master,
            walletCode: codeOf JettonWallet
        };
    }
}

contract DexAdapter with Deployable {
    owner: Address;
    totalLiquidityTON: Int;
    totalLiquidityTokens: Int;
    totalBuybackTON: Int;
    migrations: Int;
    buybacks: Int;

    init(owner: Address) {
        self.owner = owner;
        self.totalLiquidityTON = 0;
        self.totalLiquidityTokens = 0;
        self.totalBuybackTON = 0;
        self.migrations = 0;
        self.buybacks = 0;
    }

    receive(msg: AddLiquidity) {
        self.totalLiquidityTON += context().value;
        self.totalLiquidityTokens += msg.tokenAmount;
        self.migrations += 1;
    }

    receive(_: ExecuteDexBuyback) {
        self.totalBuybackTON += context().value;
        self.buybacks += 1;
    }

    get fun getDexState(): DexState {
        return DexState{
            totalLiquidityTON: self.totalLiquidityTON,
            totalLiquidityTokens: self.totalLiquidityTokens,
            totalBuybackTON: self.totalBuybackTON,
            migrations: self.migrations,
            buybacks: self.buybacks
        };
    }
}

contract PresalePool with Deployable {
    factory: Address;
    creator: Address;
    token: Address;
    treasuryAddress: Address;
    dexAdapter: Address;
    buybackWallet: Address;
    presaleRate: Int;
    softCap: Int;
    hardCap: Int;
    minContribution: Int;
    maxContribution: Int;
    startTime: Int;
    endTime: Int;
    liquidityPercentOfRaised: Int;
    buybackEnabled: Bool;
    buybackPercentBps: Int;
    buybackChunkBps: Int;
    buybackIntervalSeconds: Int;
    presaleTokenAllocation: Int;
    liquidityTokenAllocation: Int;

    totalRaised: Int;
    totalSold: Int;
    finalized: Bool;
    failed: Bool;
    cancelled: Bool;
    paused: Bool;
    migrationDone: Bool;
    liquidityTON: Int;
    buybackReserve: Int;
    buybackReleased: Int;
    treasuryWithdrawn: Int;
    failedTokensRecovered: Bool;
    userContribution: map<Address, Int>;
    userClaimed: map<Address, Bool>;
    userRefunded: map<Address, Bool>;

    init(
        factory: Address,
        creator: Address,
        token: Address,
        treasuryAddress: Address,
        dexAdapter: Address,
        buybackWallet: Address,
        presaleRate: Int,
        softCap: Int,
        hardCap: Int,
        minContribution: Int,
        maxContribution: Int,
        startTime: Int,
        endTime: Int,
        liquidityPercentOfRaised: Int,
        buybackEnabled: Bool,
        buybackPercentBps: Int,
        buybackChunkBps: Int,
        buybackIntervalSeconds: Int,
        presaleTokenAllocation: Int,
        liquidityTokenAllocation: Int
    ) {
        throwUnless(ERR_BAD_CAPS, presaleRate > 0);
        throwUnless(ERR_BAD_CAPS, softCap <= hardCap);
        throwUnless(ERR_BAD_CAPS, minContribution <= maxContribution);
        throwUnless(ERR_BAD_TIME, startTime < endTime);
        throwUnless(ERR_BAD_ALLOCATION, liquidityPercentOfRaised <= 100);
        throwUnless(ERR_BAD_BUYBACK_PERCENT, buybackPercentBps <= MAX_BUYBACK_BPS);
        throwUnless(ERR_BAD_BUYBACK_CHUNK, buybackChunkBps <= buybackPercentBps);
        if (buybackEnabled) {
            throwUnless(ERR_BAD_BUYBACK_PERCENT, buybackPercentBps > 0);
            throwUnless(ERR_BAD_BUYBACK_CHUNK, buybackChunkBps > 0);
            throwUnless(ERR_BAD_TIME, buybackIntervalSeconds > 0);
        }

        self.factory = factory;
        self.creator = creator;
        self.token = token;
        self.treasuryAddress = treasuryAddress;
        self.dexAdapter = dexAdapter;
        self.buybackWallet = buybackWallet;
        self.presaleRate = presaleRate;
        self.softCap = softCap;
        self.hardCap = hardCap;
        self.minContribution = minContribution;
        self.maxContribution = maxContribution;
        self.startTime = startTime;
        self.endTime = endTime;
        self.liquidityPercentOfRaised = liquidityPercentOfRaised;
        self.buybackEnabled = buybackEnabled;
        self.buybackPercentBps = buybackPercentBps;
        self.buybackChunkBps = buybackChunkBps;
        self.buybackIntervalSeconds = buybackIntervalSeconds;
        self.presaleTokenAllocation = presaleTokenAllocation;
        self.liquidityTokenAllocation = liquidityTokenAllocation;

        self.totalRaised = 0;
        self.totalSold = 0;
        self.finalized = false;
        self.failed = false;
        self.cancelled = false;
        self.paused = false;
        self.migrationDone = false;
        self.liquidityTON = 0;
        self.buybackReserve = 0;
        self.buybackReleased = 0;
        self.treasuryWithdrawn = 0;
        self.failedTokensRecovered = false;
    }

    receive(_: Contribute) {
        let ctx: Context = context();
        let currentTime: Int = now();
        throwUnless(ERR_NOT_STARTED, currentTime >= self.startTime);
        throwUnless(ERR_ENDED, currentTime <= self.endTime);
        throwUnless(ERR_ALREADY_DONE, !self.finalized && !self.cancelled && !self.paused);
        throwUnless(ERR_MIN_CONTRIBUTION, ctx.value >= self.minContribution);
        throwUnless(ERR_HARD_CAP, self.totalRaised < self.hardCap);

        let remaining: Int = self.hardCap - self.totalRaised;
        let accepted: Int = min(ctx.value, remaining);
        let previous: Int = self.storedContribution(ctx.sender);
        let nextContribution: Int = previous + accepted;
        throwUnless(ERR_MAX_CONTRIBUTION, nextContribution <= self.maxContribution);

        let tokenAmount: Int = self.tokensForTon(accepted);
        throwUnless(ERR_BAD_ALLOCATION, self.totalSold + tokenAmount <= self.presaleTokenAllocation);

        self.userContribution.set(ctx.sender, nextContribution);
        self.totalRaised += accepted;
        self.totalSold += tokenAmount;

        let excess: Int = ctx.value - accepted;
        if (excess > 0) {
            send(SendParameters{
                to: ctx.sender,
                value: excess,
                mode: SendPayGasSeparately + SendIgnoreErrors,
                bounce: false
            });
        }
    }

    receive(_: MigrateLiquidity) {
        throwUnless(ERR_ALREADY_DONE, !self.migrationDone);
        throwUnless(ERR_NOT_ENDED, now() > self.endTime || self.totalRaised >= self.hardCap);
        throwUnless(ERR_SOFT_CAP_NOT_MET, self.totalRaised >= self.softCap);
        throwUnless(ERR_ALREADY_DONE, !self.cancelled);

        self.finalized = true;
        self.liquidityTON = (self.totalRaised * self.liquidityPercentOfRaised) / PERCENT_DENOMINATOR;
        let treasuryTON: Int = self.totalRaised - self.liquidityTON;
        if (self.buybackEnabled) {
            self.buybackReserve = (treasuryTON * self.buybackPercentBps) / BPS_DENOMINATOR;
        }
        self.migrationDone = true;

        send(SendParameters{
            to: self.poolWallet(),
            value: TOKEN_TRANSFER_GAS,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: true,
            body: JettonTransfer{
                queryId: 0,
                amount: self.liquidityTokenAllocation,
                destination: self.dexAdapter,
                responseDestination: null,
                customPayload: null,
                forwardTonAmount: JETTON_FORWARD_TON,
                forwardPayload: emptyCell()
            }.toCell()
        });

        send(SendParameters{
            to: self.dexAdapter,
            value: self.liquidityTON,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: false,
            body: AddLiquidity{token: self.token, tokenAmount: self.liquidityTokenAllocation, requester: myAddress()}.toCell()
        });
    }

    receive(_: ClaimTokens) {
        let ctx: Context = context();
        throwUnless(ERR_NOT_MIGRATED, self.migrationDone);
        let contribution: Int = self.storedContribution(ctx.sender);
        throwUnless(ERR_NO_CONTRIBUTION, contribution > 0);
        throwUnless(ERR_ALREADY_DONE, !self.storedClaimed(ctx.sender));

        self.userClaimed.set(ctx.sender, true);
        send(SendParameters{
            to: self.poolWallet(),
            value: TOKEN_TRANSFER_GAS,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: true,
            body: JettonTransfer{
                queryId: 0,
                amount: self.tokensForTon(contribution),
                destination: ctx.sender,
                responseDestination: null,
                customPayload: null,
                forwardTonAmount: JETTON_FORWARD_TON,
                forwardPayload: emptyCell()
            }.toCell()
        });
    }

    receive(_: Refund) {
        let ctx: Context = context();
        throwUnless(ERR_SOFT_CAP_MET, self.cancelled || (now() > self.endTime && self.totalRaised < self.softCap));
        let contribution: Int = self.storedContribution(ctx.sender);
        throwUnless(ERR_NO_CONTRIBUTION, contribution > 0);
        throwUnless(ERR_ALREADY_DONE, !self.storedRefunded(ctx.sender));

        self.failed = true;
        self.userRefunded.set(ctx.sender, true);
        self.userContribution.set(ctx.sender, 0);
        send(SendParameters{
            to: ctx.sender,
            value: contribution,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: false
        });
    }

    receive(_: RecoverFailedTokens) {
        throwUnless(ERR_NOT_OWNER, context().sender == self.creator);
        throwUnless(ERR_SOFT_CAP_MET, self.cancelled || (now() > self.endTime && self.totalRaised < self.softCap));
        throwUnless(ERR_ALREADY_DONE, !self.failedTokensRecovered);
        self.failed = true;
        self.failedTokensRecovered = true;
        send(SendParameters{
            to: self.poolWallet(),
            value: TOKEN_TRANSFER_GAS,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: true,
            body: JettonTransfer{
                queryId: 0,
                amount: self.presaleTokenAllocation + self.liquidityTokenAllocation - self.totalSold,
                destination: self.creator,
                responseDestination: null,
                customPayload: null,
                forwardTonAmount: JETTON_FORWARD_TON,
                forwardPayload: emptyCell()
            }.toCell()
        });
    }

    receive(_: WithdrawTreasury) {
        throwUnless(ERR_NOT_TREASURY, context().sender == self.treasuryAddress);
        throwUnless(ERR_NOT_MIGRATED, self.migrationDone);
        let withdrawable: Int = self.totalRaised - self.liquidityTON - self.buybackReserve - self.treasuryWithdrawn;
        throwUnless(ERR_NO_CONTRIBUTION, withdrawable > 0);
        self.treasuryWithdrawn += withdrawable;
        send(SendParameters{
            to: self.treasuryAddress,
            value: withdrawable,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: false
        });
    }

    receive(_: ExecuteBuyback) {
        throwUnless(ERR_BUYBACK_DISABLED, self.buybackEnabled);
        throwUnless(ERR_NOT_MIGRATED, self.migrationDone);
        throwUnless(ERR_BUYBACK_NOT_STARTED, now() > self.endTime);

        let elapsed: Int = now() - self.endTime;
        let intervals: Int = (elapsed / self.buybackIntervalSeconds) + 1;
        let scheduledBps: Int = min(self.buybackPercentBps, intervals * self.buybackChunkBps);
        let treasuryTON: Int = self.totalRaised - self.liquidityTON;
        let scheduledAmount: Int = (treasuryTON * scheduledBps) / BPS_DENOMINATOR;
        let releasable: Int = scheduledAmount - self.buybackReleased;
        throwUnless(ERR_NO_BUYBACK_AVAILABLE, releasable > 0);
        throwUnless(ERR_NO_BUYBACK_AVAILABLE, self.buybackReleased + releasable <= self.buybackReserve);

        self.buybackReleased += releasable;
        send(SendParameters{
            to: self.dexAdapter,
            value: releasable,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: false,
            body: ExecuteDexBuyback{token: self.token, requester: myAddress()}.toCell()
        });
    }

    receive(_: Pause) {
        throwUnless(ERR_NOT_OWNER, context().sender == self.creator);
        self.paused = true;
    }

    receive(_: Unpause) {
        throwUnless(ERR_NOT_OWNER, context().sender == self.creator);
        self.paused = false;
    }

    receive(_: CancelSale) {
        throwUnless(ERR_NOT_OWNER, context().sender == self.creator);
        throwUnless(ERR_ALREADY_DONE, !self.migrationDone);
        self.cancelled = true;
    }

    fun tokensForTon(amount: Int): Int {
        return (amount * self.presaleRate) / 1000000000;
    }

    fun poolWallet(): Address {
        return contractAddress(initOf JettonWallet(self.token, myAddress()));
    }

    fun storedContribution(user: Address): Int {
        let value: Int? = self.userContribution.get(user);
        if (value == null) {
            return 0;
        }
        return value!!;
    }

    fun storedClaimed(user: Address): Bool {
        let value: Bool? = self.userClaimed.get(user);
        if (value == null) {
            return false;
        }
        return value!!;
    }

    fun storedRefunded(user: Address): Bool {
        let value: Bool? = self.userRefunded.get(user);
        if (value == null) {
            return false;
        }
        return value!!;
    }

    get fun getState(): PresaleState {
        return PresaleState{
            totalRaised: self.totalRaised,
            totalSold: self.totalSold,
            finalized: self.finalized,
            failed: self.failed,
            cancelled: self.cancelled,
            paused: self.paused,
            migrationDone: self.migrationDone,
            liquidityTON: self.liquidityTON,
            buybackReserve: self.buybackReserve,
            buybackReleased: self.buybackReleased,
            treasuryWithdrawn: self.treasuryWithdrawn
        };
    }

    get fun getConfig(): PresaleConfig {
        return PresaleConfig{
            factory: self.factory,
            creator: self.creator,
            token: self.token,
            treasuryAddress: self.treasuryAddress,
            dexAdapter: self.dexAdapter,
            buybackWallet: self.buybackWallet,
            presaleRate: self.presaleRate,
            softCap: self.softCap,
            hardCap: self.hardCap,
            minContribution: self.minContribution,
            maxContribution: self.maxContribution,
            startTime: self.startTime,
            endTime: self.endTime,
            liquidityPercentOfRaised: self.liquidityPercentOfRaised,
            buybackEnabled: self.buybackEnabled,
            buybackPercentBps: self.buybackPercentBps,
            buybackChunkBps: self.buybackChunkBps,
            buybackIntervalSeconds: self.buybackIntervalSeconds,
            presaleTokenAllocation: self.presaleTokenAllocation,
            liquidityTokenAllocation: self.liquidityTokenAllocation
        };
    }

    get fun getContribution(user: Address): Int {
        return self.storedContribution(user);
    }

    get fun getClaimed(user: Address): Bool {
        return self.storedClaimed(user);
    }
}

contract LaunchpadFactory with Deployable {
    owner: Address;
    launchCount: Int;
    records: map<Int, LaunchRecord>;

    init(owner: Address) {
        self.owner = owner;
        self.launchCount = 0;
    }

    receive(msg: LaunchToken) {
        let creator: Address = context().sender;
        throwUnless(ERR_BAD_ALLOCATION, msg.presalePercent + msg.liquidityPercentTokens + msg.creatorPercent == 100);
        throwUnless(ERR_BAD_ALLOCATION, msg.liquidityPercentOfRaised <= 100);
        throwUnless(ERR_BAD_BUYBACK_PERCENT, msg.buybackPercentBps <= MAX_BUYBACK_BPS);
        throwUnless(ERR_BAD_BUYBACK_CHUNK, msg.buybackChunkBps <= msg.buybackPercentBps);
        throwUnless(ERR_BAD_CAPS, msg.softCap <= msg.hardCap);
        throwUnless(ERR_BAD_CAPS, msg.minContribution <= msg.maxContribution);
        throwUnless(ERR_BAD_TIME, msg.startTime < msg.endTime);

        let launchId: Int = self.launchCount;
        let tokenInit: StateInit = initOf LaunchpadJettonMaster(myAddress(), msg.name, msg.symbol, msg.description, msg.metadata, msg.totalSupply, msg.decimals);
        let tokenAddress: Address = contractAddress(tokenInit);
        let presaleAllocation: Int = (msg.totalSupply * msg.presalePercent) / PERCENT_DENOMINATOR;
        let liquidityAllocation: Int = (msg.totalSupply * msg.liquidityPercentTokens) / PERCENT_DENOMINATOR;
        let creatorAllocation: Int = msg.totalSupply - presaleAllocation - liquidityAllocation;

        let poolInit: StateInit = initOf PresalePool(
            myAddress(),
            creator,
            tokenAddress,
            msg.treasuryAddress,
            msg.dexAdapter,
            msg.buybackWallet,
            msg.presaleRate,
            msg.softCap,
            msg.hardCap,
            msg.minContribution,
            msg.maxContribution,
            msg.startTime,
            msg.endTime,
            msg.liquidityPercentOfRaised,
            msg.buybackEnabled,
            msg.buybackPercentBps,
            msg.buybackChunkBps,
            msg.buybackIntervalSeconds,
            presaleAllocation,
            liquidityAllocation
        );
        let poolAddress: Address = contractAddress(poolInit);

        self.records.set(launchId, LaunchRecord{token: tokenAddress, pool: poolAddress, creator: creator});
        self.launchCount = launchId + 1;

        deploy(DeployParameters{
            init: tokenInit,
            value: TOKEN_DEPLOY_VALUE,
            mode: SendIgnoreErrors,
            bounce: false,
            body: MintToken{to: poolAddress, amount: presaleAllocation + liquidityAllocation}.toCell()
        });
        deploy(DeployParameters{init: poolInit, value: DEPLOY_VALUE, mode: SendIgnoreErrors, bounce: false, body: Deploy{queryId: launchId}.toCell()});
        send(SendParameters{to: tokenAddress, value: TOKEN_TRANSFER_GAS, mode: SendIgnoreErrors, bounce: true, body: MintToken{to: creator, amount: creatorAllocation}.toCell()});
    }

    get fun getLaunchCount(): Int {
        return self.launchCount;
    }

    get fun getLaunch(id: Int): LaunchRecord {
        let record: LaunchRecord? = self.records.get(id);
        throwUnless(ERR_NO_CONTRIBUTION, record != null);
        return record!!;
    }
}
