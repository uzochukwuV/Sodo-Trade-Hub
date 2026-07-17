I actually think this is more valuable than the block analysis because it creates recurring usage instead of one-time research.

Your product then evolves into three layers:

Discovery → Block Intelligence (find opportunities)
Decision → AI Analyst (explain opportunities)
Execution Management → AI Trade Automation (manage open trades)

The third layer is where users are willing to keep paying monthly.

Don't compete with SoDEX

If SoDEX already has:

Stop Loss
Take Profit

don't build another stop loss.

Build everything above stop loss.

Think of your platform as:

"GitHub Actions for trades."

A trade becomes something users can attach automations to.

Example

Instead of

BTC Long

SL: 102000
TP: 110000

they create

Automation

When:

Wallet Alpha exits

OR

Funding > 0.05%

OR

OI drops 8%

OR

BTC loses VWAP

Then

Move SL to breakeven.

That is something exchanges rarely offer.

AI Trade Guardian

This is the feature I'd build.

User opens a trade.

Clicks

Protect with AI

The AI monitors

funding
open interest
whale activity
leader wallets
volatility
liquidation clusters
correlated markets
new block intelligence

Then continuously evaluates

Trade Health

83/100

Still healthy.

Reason

Wallets still holding.

Funding neutral.

Momentum intact.

Later

Trade Health

54

Warning.

Two elite wallets exited.

Funding turning crowded.

Risk increasing.

Later

Trade Health

27

Recommendation

Close 50%.

Reason

Historical pattern matches
previous reversals.

Notice:

The AI isn't executing.

It's acting as a portfolio analyst.

Then automate it

Users should choose.

Manual

AI only suggests.
Semi-auto

AI asks for approval.
Automatic

AI modifies stop loss.
Fully automatic

AI closes.
Strategy Builder

Instead of coding.

Users create

IF

Wallet Score > 90

AND

3 elite wallets buy

AND

Funding < 0

THEN

Move stop to entry.

Or

IF

Trade profit > 8%

AND

Funding rising

THEN

Sell 25%.
Trailing Stop++

Normal trailing stop

Price ↑

Stop ↑

Your version

Price ↑

Stop does not move
because volatility is increasing.


Or

Price ↑

Elite wallets exiting.

Stop tightened.

Or

Price ↑

Momentum still strong.

Stop widened.

Let winners run.

Now the trailing stop is context-aware.

Copy Trader Automation

Suppose users copy wallets.

Automation

If copied wallet reduces

reduce mine.
If copied wallet adds

notify me.
If copied wallet exits

close mine.
Block Intelligence Automation

This is where your block work becomes valuable.

Example

User Long BTC

Automation

If

next 20 blocks

show

5 high-score wallets
opening BTC shorts

notify immediately.

Or

If

block intelligence

detects exit cluster

move stop tighter.
Portfolio AI

Instead of managing one trade.

Monitor everything.

Portfolio Risk

74

ETH

Healthy

BTC

Crowded

SOL

Weakening

Overall recommendation

Reduce crypto exposure 20%.
Event-based automations

Possible triggers

Wallet

Wallet enters

Wallet exits

Wallet doubles position

Wallet liquidated

Wallet inactive

Market

Funding

OI

Volume

Spread

Volatility

Liquidation

Price

Block

Cluster detected

Large deposit

Leader appears

Follower detected

Abnormal conviction

Trade

Profit

Loss

Holding period

Risk

Time

Leverage
AI Playbooks

Instead of individual rules.

Users install

Trend Following
Breakout
Momentum
Whale Following
Swing
Scalping

Each is an automation template.

Natural Language

This is where AI shines.

User types

If my trade reaches 10%

and

Wallet Alpha exits

sell half

and

move stop to breakeven.

The AI converts it into a structured automation.

No drag-and-drop builder required.

Explainability

Every action needs justification.

Instead of

Closed trade.

Show

Reason

Wallet Alpha exited.

Wallet Beta reduced.

Funding rose 0.07%.

Open interest fell 6%.

Historical success

72%.

Confidence

81%.

Trust is critical.

Premium feature

I would call it

Trade Guardian

Dashboard

Open Trades

Health

AI

Automation

BTC

84

Watching

ETH

59

Watching

SOL

22

Close Recommended

Clicking

SOL

shows

Current Health

22

Risk

High

Why

Leader exited.

Cluster dissolved.

Funding crowded.

Volatility increasing.

Suggested

Close 70%.

Confidence

88%.
Monetization

This becomes much easier to price than research alone.

Research

Block analysis
AI investigations
Wallet intelligence

Automation

Active Trade Guardian slots (e.g. 5, 20, unlimited)
Advanced automation rules
AI playbooks
Semi-automatic execution
API/webhook actions

The recurring value is obvious: users keep the platform open because it is continuously protecting and managing their positions.

One architectural suggestion

I would not execute trades directly from day one.

Build the automation engine to produce actions first.

Trigger
        ↓
Rule Engine
        ↓
AI Evaluation
        ↓
Proposed Action
        ↓
Policy Check
        ↓
Execution Adapter

The execution adapter can initially support only:

Notify user
Telegram
Email
In-app alert

Later, add:

Modify stop loss
Modify take profit
Partial close
Full close
Open hedge
Increase position

This separation means the same automation logic can drive notifications today and, once you're confident in its reliability and users explicitly opt in, drive execution tomorrow. It also makes testing and auditing much easier because every proposed action has a recorded rationale before any trade is touched.

also so since there will be many people automating this we need an agentic workflow, ai will analyse user trades in batch rather than single every minute, so it takes a batch of trades in the database or redis and the user prompt a companying each one, use tools to fetch related data and make and execute decisions for each of them

Yes. The right design is a batched agentic trade-management engine, not one independent AI agent polling every trade every minute.

The key principle is:

Batch data collection and market analysis globally, but make decisions and enforce risk policies separately for each user trade.

You want to avoid:

10,000 trades
× one AI call every minute
× separate market-data requests

Instead:

10,000 monitored trades
        ↓
Group by market and strategy
        ↓
Fetch shared market intelligence once
        ↓
Evaluate deterministic triggers
        ↓
Send only relevant trades to AI
        ↓
Produce structured decisions in batches
        ↓
Validate each decision independently
        ↓
Execute approved actions idempotently
Recommended workflow
SoDEX account streams
Market data streams
Block intelligence
Scheduled evaluations
        ↓
Event ingestion layer
        ↓
Redis trade-state cache
        ↓
Batch coordinator
        ↓
Context enrichment
        ↓
Deterministic rule engine
        ↓
AI batch decision engine
        ↓
Per-trade policy validation
        ↓
Execution queue
        ↓
SoDEX execution adapter
        ↓
Verification and audit log
1. Store each automation as a structured mandate

The user’s natural-language prompt should not be sent directly to the model on every evaluation.

For example:

Protect this BTC long. Trail the stop when momentum is strong, close half if the lead wallet exits, and never risk more than 3% of my account.

Compile that once into a structured policy:

type TradeMandate = {
  tradeId: string;
  userId: string;

  objective: "PROTECT" | "MAXIMIZE_PROFIT" | "FOLLOW_WALLET" | "CUSTOM";

  mode: "ADVISORY" | "APPROVAL_REQUIRED" | "AUTOMATIC";

  monitoring: {
    price: boolean;
    funding: boolean;
    openInterest: boolean;
    walletActivity: boolean;
    blockClusters: boolean;
    volatility: boolean;
  };

  allowedActions: Array<
    | "NOTIFY"
    | "MOVE_STOP"
    | "MODIFY_TAKE_PROFIT"
    | "PARTIAL_CLOSE"
    | "FULL_CLOSE"
  >;

  constraints: {
    maximumLeverage: number;
    maximumLossUsd: number;
    maximumLossPercent: number;
    minimumPositionRemainingPercent: number;
    maximumActionsPerHour: number;
    cooldownSeconds: number;
  };

  rules: AutomationRule[];

  userInstructions: string;
  policyVersion: number;
};

The original prompt remains available for context, but execution is governed by the structured mandate.

2. Keep live trade state in Redis

PostgreSQL should remain the durable source of truth. Redis should hold the operational state needed for fast batching.

Example keys:

trade:{tradeId}:state
trade:{tradeId}:mandate
trade:{tradeId}:last-evaluation
trade:{tradeId}:last-action
market:{symbol}:snapshot
wallet:{address}:recent-activity
batch:{batchId}:status

Useful Redis indexes:

active-trades:BTC-PERP
active-trades:ETH-PERP
strategy:wallet-following
evaluation-due
high-risk-trades
approval-pending

Redis sorted sets are especially useful:

evaluation-due
score = nextEvaluationTimestamp
member = tradeId

A scheduler can pull all trades whose next evaluation time has arrived.

3. Do not evaluate every trade at the same frequency

Evaluation frequency should depend on trade state.

Stable trade:
Every 3–5 minutes

Near stop or liquidation:
Every 10–30 seconds

High volatility:
Every 15–60 seconds

Wallet-following strategy:
Immediately when source wallet acts

Funding strategy:
Near funding updates

Block cluster strategy:
When a relevant cluster is detected

This produces adaptive monitoring rather than wasteful polling.

A trade can hold:

type MonitoringPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "CRITICAL";

Priority can be derived deterministically from:

distance to stop;
distance to liquidation;
volatility;
position size;
unresolved warning events;
freshness of the last evaluation.
4. Batch by shared context

The best batching key is not simply “all trades due now.”

Group trades by:

market
strategy type
required tools
priority
execution mode
model complexity

Example:

Batch A
BTC-PERP
wallet-following strategies
37 trades

Batch B
ETH-PERP
trailing-risk strategies
142 trades

Batch C
SOL-PERP
critical-risk trades
9 trades

For Batch A, fetch shared information once:

BTC mark price
BTC funding
BTC open interest
BTC volatility
BTC order-book state
relevant wallet activity
recent BTC block clusters

Then attach per-trade context:

entry price
position size
current PnL
stop loss
take profit
user mandate
maximum permitted loss
last AI decision
last executed action
5. Use deterministic pre-filtering before AI

Most evaluations should never reach the LLM.

The deterministic engine should resolve obvious cases:

No meaningful market change
→ no action

Trade unchanged and healthy
→ reschedule

Hard stop condition reached
→ execute configured stop behavior

User action cooldown active
→ do not modify trade

Market data stale
→ block automatic execution

Position already closed
→ deactivate automation

Only send trades to AI when:

several signals conflict;
contextual reasoning is needed;
a dynamic trailing decision is required;
wallet activity changes the thesis;
risk is increasing but no hard rule has fired;
the user explicitly selected AI-controlled management.

An efficient funnel might look like:

5,000 due trades
        ↓
3,900 unchanged
        ↓
700 resolved by deterministic rules
        ↓
400 require AI analysis
6. AI batch request structure

Do not ask one model call to reason about hundreds of trades as one undifferentiated prompt.

Use bounded batches, perhaps 10–30 trades depending on context size.

type TradeDecisionInput = {
  tradeId: string;
  mandateId: string;

  position: {
    symbol: string;
    side: "LONG" | "SHORT";
    entryPrice: number;
    markPrice: number;
    size: number;
    leverage: number;
    unrealizedPnl: number;
    liquidationPrice?: number;
    stopLoss?: number;
    take
https://sodex.com/documentation/trading-api/trading-api#key-terminology, read aabout sub accounts and signing transactions on behalf of users

This is actually one of the most interesting parts of the SoDEX architecture, and it aligns very well with your automation idea.

1. Sub-accounts are first-class citizens

A single master wallet owns the SoDEX account, but it can have multiple sub-accounts. Most account APIs accept an optional accountID; if omitted, the primary account is used. That means one user can isolate different strategies (e.g., scalping, swing, AI automation) into different sub-accounts while keeping one master wallet.

For your platform, this is ideal:

Master Wallet

├── Main Account
│     Manual trading
│
├── Sub-account #1
│     AI Trend Following
│
├── Sub-account #2
│     Copy Trading
│
├── Sub-account #3
│     High Risk
│
└── Sub-account #4
      Testing

Instead of asking users to connect multiple wallets, they can simply select which sub-account your automation should manage.

2. API keys can sign on behalf of the master or a sub-account

The documentation states that a master account can approve API keys that sign on behalf of either the master account or any sub-account. API keys are recommended for all day-to-day trading, while the master wallet should only be used for account-management actions such as creating or revoking API keys.

This is exactly what you want.

Instead of:

User gives your backend wallet private key

you use:

User

↓

Creates API key

↓

Grants permissions

↓

Your backend signs trading requests

↓

Only for that account

This is significantly safer.

3. Permissioned API keys are even better

SoDEX supports permissioned API keys with permission bitmasks. Permissions can disable capabilities such as:

Trading
Canceling orders
Withdrawals
Internal and sub-account transfers

This opens an excellent security model.

For example, when users connect your platform:

AI Automation API Key

✓ Trade

✓ Cancel Orders

✗ Withdraw

✗ Transfer Funds

Even if your infrastructure were compromised, the attacker would not be able to withdraw the user's funds (assuming the user created an appropriately permissioned key).

4. Your platform never needs custody

This changes your architecture considerably.

Instead of:

User

↓

Deposits into your platform

↓

You trade

it becomes:

User funds remain in SoDEX

↓

User creates API key

↓

Registers automation

↓

Your AI signs requests

↓

Orders execute directly on SoDEX

Your platform never touches custody.

5. One API key per automation

One detail from the documentation is particularly important.

Nonces are tracked per signing address, and SoDEX explicitly recommends using a separate API key for each concurrent trading process to avoid nonce contention.

That means you should not use:

One API key

↓

10 automations

Instead:

Automation A

↓

API Key A

Automation B

↓

API Key B

Automation C

↓

API Key C

If a user runs multiple independent strategies, this prevents nonce races between them.

6. Your automation model becomes very clean

Instead of:

User

↓

Automation

store:

Automation

↓

Account ID

↓

API Key Name

↓

Encrypted API Private Key

↓

Permissions

↓

Strategy

For example:

Automation {
    id

    userId

    accountId

    apiKeyName

    encryptedPrivateKey

    strategy

    mode

    permissions

    status
}

Every execution job then knows exactly which sub-account and API key it should use.

7. Multiple AI strategies become possible

One user could have:

Sub-account A

AI Trend Following
Sub-account B

Whale Copy
Sub-account C

Momentum
Sub-account D

Manual

Each strategy has:

separate PnL
separate risk
separate AI prompts
separate API key
separate monitoring

That is a much cleaner operational model than mixing everything into one trading account.

8. Human approval workflows

Because every API key is tied to a specific account, you can support different execution modes.

For example:

Mode

Advisory

The AI only sends notifications.

Approval

The AI prepares the signed order, but waits for the user's approval before submitting it.

Automatic

The AI signs and submits immediately using the registered API key.

This gives users flexibility without changing your core architecture.

9. This fits your agent architecture

Earlier we discussed an agentic workflow.

Now it becomes:

Redis

↓

Open trades

↓

Grouped by market

↓

Grouped by strategy

↓

AI batch analysis

↓

Decision

↓

Execution Queue

↓

Lookup automation

↓

Decrypt API key

↓

Sign request

↓

Send to SoDEX

↓

Verify execution

↓

Store result

Notice that only the execution worker needs access to the decrypted API key. The AI reasoning layer never does.

10. One recommendation: use an execution service boundary

I would split the platform into three independent services.

AI Service

- reasoning
- suggestions
- strategy evaluation

NO PRIVATE KEYS

↓

Automation Service

- scheduling
- triggers
- policy checks

NO PRIVATE KEYS

↓

Execution Service

- decrypt API keys
- EIP-712 signing
- submit SoDEX requests
- verify responses

ONLY PLACE THAT CAN SIGN

That separation is valuable because if the AI service or scheduler has a bug, it still cannot submit trades directly. Every order must pass through the execution service, which can enforce user permissions, cooldowns, and risk limits before producing a signature.

Given everything you've built—the block intelligence engine, wallet analytics, AI trade analysis, and now SoDEX's delegated API-key model—I think the long-term product is no longer just an analytics dashboard. It starts to resemble an AI-native trading operating system: discover opportunities, reason about them, monitor positions continuously, and execute user-authorized strategies directly on SoDEX using scoped, non-custodial API credentials.