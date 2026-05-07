import "@stdlib/deploy";

const ERR_NOT_OWNER: Int = 100;
const ERR_NOT_TREASURY: Int = 101;
const ERR_PAUSED: Int = 102;
const ERR_CANCELLED: Int = 103;
const ERR_FINALIZED: Int = 104;
const ERR_NOT_STARTED: Int = 105;
const ERR_ENDED: Int = 106;
const ERR_MIN_CONTRIBUTION: Int = 107;
const ERR_MAX_CONTRIBUTION: Int = 108;
const ERR_HARD_CAP: Int = 109;
const ERR_NOT_ENDED: Int = 110;
const ERR_SOFT_CAP_NOT_MET: Int = 111;
const ERR_SOFT_CAP_MET: Int = 112;
const ERR_NOT_FINALIZED: Int = 113;
const ERR_NO_CONTRIBUTION: Int = 114;
const ERR_ALREADY_CLAIMED: Int = 115;
const ERR_BUYBACK_DISABLED: Int = 116;
const ERR_BUYBACK_NOT_STARTED: Int = 117;
const ERR_NO_BUYBACK_AVAILABLE: Int = 118;
const ERR_BAD_BUYBACK_PERCENT: Int = 119;
const ERR_BAD_BUYBACK_CHUNK: Int = 120;
const ERR_BAD_TIME: Int = 121;
const ERR_BAD_CAPS: Int = 122;

const MAX_BUYBACK_BPS: Int = 4000;
const BPS_DENOMINATOR: Int = 10000;
const TON_RESERVE: Int = 100000000;
const JETTON_TRANSFER_OP: Int = 0x0f8a7ea5;

message Contribute {}
message Finalize {}
message ClaimTokens {}
message Refund {}
message WithdrawTreasury {}
message ReleaseBuybackChunk {}
message Pause {}
message Unpause {}
message CancelSale {}

struct PresaleState {
    totalRaised: Int;
    totalSold: Int;
    finalized: Bool;
    cancelled: Bool;
    paused: Bool;
    buybackReleased: Int;
    buybackReserve: Int;
    treasuryWithdrawn: Int;
}

struct PresaleConfig {
    owner: Address;
    saleTokenJettonMaster: Address;
    saleTokenJettonWallet: Address;
    treasuryAddress: Address;
    buybackWallet: Address;
    presalePrice: Int;
    softCap: Int;
    hardCap: Int;
    minContribution: Int;
    maxContribution: Int;
    startTime: Int;
    endTime: Int;
    claimStartTime: Int;
    buybackEnabled: Bool;
    buybackPercentBps: Int;
    buybackChunkBps: Int;
    buybackIntervalSeconds: Int;
    buybackStartTime: Int;
}

contract PresalePool with Deployable {
    owner: Address;
    saleTokenJettonMaster: Address;
    saleTokenJettonWallet: Address;
    treasuryAddress: Address;
    buybackWallet: Address;
    presalePrice: Int;
    softCap: Int;
    hardCap: Int;
    minContribution: Int;
    maxContribution: Int;
    startTime: Int;
    endTime: Int;
    claimStartTime: Int;
    buybackEnabled: Bool;
    buybackPercentBps: Int;
    buybackChunkBps: Int;
    buybackIntervalSeconds: Int;
    buybackStartTime: Int;

    totalRaised: Int;
    totalSold: Int;
    finalized: Bool;
    cancelled: Bool;
    paused: Bool;
    buybackReleased: Int;
    buybackReserve: Int;
    treasuryWithdrawn: Int;
    userContribution: map<Address, Int>;
    userClaimed: map<Address, Bool>;
    userRefunded: map<Address, Bool>;

    init(
        owner: Address,
        saleTokenJettonMaster: Address,
        saleTokenJettonWallet: Address,
        treasuryAddress: Address,
        buybackWallet: Address,
        presalePrice: Int,
        softCap: Int,
        hardCap: Int,
        minContribution: Int,
        maxContribution: Int,
        startTime: Int,
        endTime: Int,
        claimStartTime: Int,
        buybackEnabled: Bool,
        buybackPercentBps: Int,
        buybackChunkBps: Int,
        buybackIntervalSeconds: Int,
        buybackStartTime: Int
    ) {
        throwUnless(ERR_BAD_CAPS, presalePrice > 0);
        throwUnless(ERR_BAD_CAPS, softCap <= hardCap);
        throwUnless(ERR_BAD_CAPS, minContribution <= maxContribution);
        throwUnless(ERR_BAD_TIME, startTime < endTime);
        throwUnless(ERR_BAD_TIME, claimStartTime >= endTime);
        throwUnless(ERR_BAD_BUYBACK_PERCENT, buybackPercentBps <= MAX_BUYBACK_BPS);
        throwUnless(ERR_BAD_BUYBACK_CHUNK, buybackChunkBps <= buybackPercentBps);
        if (buybackEnabled) {
            throwUnless(ERR_BAD_BUYBACK_PERCENT, buybackPercentBps > 0);
            throwUnless(ERR_BAD_BUYBACK_CHUNK, buybackChunkBps > 0);
            throwUnless(ERR_BAD_TIME, buybackIntervalSeconds > 0);
        }

        self.owner = owner;
        self.saleTokenJettonMaster = saleTokenJettonMaster;
        self.saleTokenJettonWallet = saleTokenJettonWallet;
        self.treasuryAddress = treasuryAddress;
        self.buybackWallet = buybackWallet;
        self.presalePrice = presalePrice;
        self.softCap = softCap;
        self.hardCap = hardCap;
        self.minContribution = minContribution;
        self.maxContribution = maxContribution;
        self.startTime = startTime;
        self.endTime = endTime;
        self.claimStartTime = claimStartTime;
        self.buybackEnabled = buybackEnabled;
        self.buybackPercentBps = buybackPercentBps;
        self.buybackChunkBps = buybackChunkBps;
        self.buybackIntervalSeconds = buybackIntervalSeconds;
        self.buybackStartTime = buybackStartTime;

        self.totalRaised = 0;
        self.totalSold = 0;
        self.finalized = false;
        self.cancelled = false;
        self.paused = false;
        self.buybackReleased = 0;
        self.buybackReserve = 0;
        self.treasuryWithdrawn = 0;
    }

    receive(_: Contribute) {
        let ctx: Context = context();
        let now: Int = now();
        throwUnless(ERR_PAUSED, !self.paused);
        throwUnless(ERR_CANCELLED, !self.cancelled);
        throwUnless(ERR_FINALIZED, !self.finalized);
        throwUnless(ERR_NOT_STARTED, now >= self.startTime);
        throwUnless(ERR_ENDED, now <= self.endTime);

        let incoming: Int = ctx.value;
        throwUnless(ERR_MIN_CONTRIBUTION, incoming >= self.minContribution);
        throwUnless(ERR_HARD_CAP, self.totalRaised < self.hardCap);

        let remaining: Int = self.hardCap - self.totalRaised;
        let accepted: Int = min(incoming, remaining);
        let currentContribution: Int = self.storedContribution(ctx.sender);
        let nextContribution: Int = currentContribution + accepted;
        throwUnless(ERR_MAX_CONTRIBUTION, nextContribution <= self.maxContribution);

        self.userContribution.set(ctx.sender, nextContribution);
        self.totalRaised += accepted;
        self.totalSold += self.tokensForTon(accepted);

        let excess: Int = incoming - accepted;
        if (excess > 0) {
            send(SendParameters{
                to: ctx.sender,
                value: excess,
                mode: SendPayGasSeparately + SendIgnoreErrors,
                bounce: false
            });
        }
    }

    receive(_: Finalize) {
        self.requireOwner();
        throwUnless(ERR_CANCELLED, !self.cancelled);
        throwUnless(ERR_FINALIZED, !self.finalized);
        throwUnless(ERR_NOT_ENDED, now() >= self.endTime);
        throwUnless(ERR_SOFT_CAP_NOT_MET, self.totalRaised >= self.softCap);

        self.finalized = true;
        if (self.buybackEnabled) {
            self.buybackReserve = (self.totalRaised * self.buybackPercentBps) / BPS_DENOMINATOR;
        }
    }

    receive(_: ClaimTokens) {
        let ctx: Context = context();
        throwUnless(ERR_NOT_FINALIZED, self.finalized);
        throwUnless(ERR_CANCELLED, !self.cancelled);
        throwUnless(ERR_NOT_STARTED, now() >= self.claimStartTime);

        let contribution: Int = self.storedContribution(ctx.sender);
        throwUnless(ERR_NO_CONTRIBUTION, contribution > 0);
        throwUnless(ERR_ALREADY_CLAIMED, !self.storedClaimed(ctx.sender));

        self.userClaimed.set(ctx.sender, true);
        self.transferJettons(ctx.sender, self.tokensForTon(contribution));
    }

    receive(_: Refund) {
        let ctx: Context = context();
        throwUnless(ERR_SOFT_CAP_MET, self.cancelled || (now() > self.endTime && self.totalRaised < self.softCap));

        let contribution: Int = self.storedContribution(ctx.sender);
        throwUnless(ERR_NO_CONTRIBUTION, contribution > 0);
        throwUnless(ERR_ALREADY_CLAIMED, !self.storedRefunded(ctx.sender));

        self.userRefunded.set(ctx.sender, true);
        self.userContribution.set(ctx.sender, 0);
        send(SendParameters{
            to: ctx.sender,
            value: contribution,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: false
        });
    }

    receive(_: WithdrawTreasury) {
        let ctx: Context = context();
        throwUnless(ERR_NOT_TREASURY, ctx.sender == self.treasuryAddress);
        throwUnless(ERR_NOT_FINALIZED, self.finalized);
        throwUnless(ERR_CANCELLED, !self.cancelled);

        let withdrawable: Int = self.totalRaised - self.buybackReserve - self.treasuryWithdrawn;
        throwUnless(ERR_NO_CONTRIBUTION, withdrawable > 0);
        self.treasuryWithdrawn += withdrawable;
        send(SendParameters{
            to: self.treasuryAddress,
            value: withdrawable,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: false
        });
    }

    receive(_: ReleaseBuybackChunk) {
        throwUnless(ERR_BUYBACK_DISABLED, self.buybackEnabled);
        throwUnless(ERR_NOT_FINALIZED, self.finalized);
        throwUnless(ERR_BUYBACK_NOT_STARTED, now() >= self.buybackStartTime);

        let elapsed: Int = now() - self.buybackStartTime;
        let intervals: Int = (elapsed / self.buybackIntervalSeconds) + 1;
        let scheduledBps: Int = min(self.buybackPercentBps, intervals * self.buybackChunkBps);
        let scheduledAmount: Int = (self.totalRaised * scheduledBps) / BPS_DENOMINATOR;
        let releasable: Int = scheduledAmount - self.buybackReleased;
        throwUnless(ERR_NO_BUYBACK_AVAILABLE, releasable > 0);
        throwUnless(ERR_NO_BUYBACK_AVAILABLE, self.buybackReleased + releasable <= self.buybackReserve);

        self.buybackReleased += releasable;
        send(SendParameters{
            to: self.buybackWallet,
            value: releasable,
            mode: SendPayGasSeparately + SendIgnoreErrors,
            bounce: false
        });
    }

    receive(_: Pause) {
        self.requireOwner();
        self.paused = true;
    }

    receive(_: Unpause) {
        self.requireOwner();
        self.paused = false;
    }

    receive(_: CancelSale) {
        self.requireOwner();
        throwUnless(ERR_FINALIZED, !self.finalized);
        self.cancelled = true;
    }

    fun requireOwner() {
        throwUnless(ERR_NOT_OWNER, context().sender == self.owner);
    }

    fun tokensForTon(amount: Int): Int {
        return (amount * self.presalePrice) / 1000000000;
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

    fun transferJettons(to: Address, amount: Int) {
        send(SendParameters{
            to: self.saleTokenJettonWallet,
            value: TON_RESERVE,
            mode: SendIgnoreErrors,
            bounce: true,
            body: beginCell()
                .storeUint(JETTON_TRANSFER_OP, 32)
                .storeUint(0, 64)
                .storeCoins(amount)
                .storeAddress(to)
                .storeAddress(self.owner)
                .storeBit(false)
                .storeCoins(0)
                .storeBit(false)
                .endCell()
        });
    }

    get fun getState(): PresaleState {
        return PresaleState{
            totalRaised: self.totalRaised,
            totalSold: self.totalSold,
            finalized: self.finalized,
            cancelled: self.cancelled,
            paused: self.paused,
            buybackReleased: self.buybackReleased,
            buybackReserve: self.buybackReserve,
            treasuryWithdrawn: self.treasuryWithdrawn
        };
    }

    get fun getConfig(): PresaleConfig {
        return PresaleConfig{
            owner: self.owner,
            saleTokenJettonMaster: self.saleTokenJettonMaster,
            saleTokenJettonWallet: self.saleTokenJettonWallet,
            treasuryAddress: self.treasuryAddress,
            buybackWallet: self.buybackWallet,
            presalePrice: self.presalePrice,
            softCap: self.softCap,
            hardCap: self.hardCap,
            minContribution: self.minContribution,
            maxContribution: self.maxContribution,
            startTime: self.startTime,
            endTime: self.endTime,
            claimStartTime: self.claimStartTime,
            buybackEnabled: self.buybackEnabled,
            buybackPercentBps: self.buybackPercentBps,
            buybackChunkBps: self.buybackChunkBps,
            buybackIntervalSeconds: self.buybackIntervalSeconds,
            buybackStartTime: self.buybackStartTime
        };
    }

    get fun getContribution(user: Address): Int {
        return self.storedContribution(user);
    }

    get fun getClaimed(user: Address): Bool {
        return self.storedClaimed(user);
    }

    get fun getRefunded(user: Address): Bool {
        return self.storedRefunded(user);
    }

    get fun getAvailableBuyback(nowTs: Int): Int {
        if (!self.buybackEnabled || !self.finalized || nowTs < self.buybackStartTime) {
            return 0;
        }
        let elapsed: Int = nowTs - self.buybackStartTime;
        let intervals: Int = (elapsed / self.buybackIntervalSeconds) + 1;
        let scheduledBps: Int = min(self.buybackPercentBps, intervals * self.buybackChunkBps);
        let scheduledAmount: Int = (self.totalRaised * scheduledBps) / BPS_DENOMINATOR;
        if (scheduledAmount <= self.buybackReleased) {
            return 0;
        }
        return scheduledAmount - self.buybackReleased;
    }
}
