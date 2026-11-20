# Prototype: Messaging Across Two XMTP Backends

XMTP backends do not federate ([research note](../../research/existing-networks.md#no-federation)). This prototype tests one way around that: **the sender's client connects to the recipient's backend and delivers there.**

**Result: it works.** Run on 2026-11-20 against two local backends (`ghcr.io/xmtp/backend:8.0.0-rc4`) with `@xmtp/node-sdk` 8.0.0-rc4 on Node 22. All ten checks passed on three runs.

## What It Does

Two backends stand in for two Bitsocial hosts. Alice keeps her mailbox on host A, Bob on host B. Each account is 32 random bytes, used as the XMTP signing key the way a Bitsocial key would be.

| Step | Outcome |
|---|---|
| Each user registers on their own backend | Works |
| From host A, Alice asks whether Bob is reachable | No |
| From host A, Alice opens a DM to Bob | Refused: `inbox id for address … not found` |
| Alice opens a second client on host B with the same key | Works, with no step for Alice beyond the connection |
| Alice's inbox ID on host A and on host B | Identical |
| From host B, Alice asks whether Bob is reachable | Yes |
| Alice sends Bob a DM, addressed by his Ethereum identity alone | Works |
| Bob, who only ever used host B, receives it | Yes, as a conversation awaiting his consent |
| Bob looks up who sent it | The sender's inbox resolves to Alice's Ethereum identity |
| Bob replies, and Alice reads it through her host-B client | Works |
| Alice looks for the conversation on host A | It is not there |

## What This Shows

- A host can run its own XMTP backend, and users of other hosts can still message its users.
- One Bitsocial key gives one XMTP inbox ID everywhere, so the same person is recognisable on every backend.
- A sender needs two facts about a recipient: their Ethereum identity and the address of their backend. Bitsocial records could carry both.
- A stranger's first message arrives as a request, which is the behaviour the design wants.

## What It Costs

- **A conversation lives on the recipient's backend, not the sender's.** Alice sees Bob's reply only through her connection to host B. Her client must stay connected to every backend where she has a conversation, and each one is a separate local database and a separate device registration.
- **A host must let strangers register.** Alice had to create an inbox on host B before she could send. These backends ran with authentication off. A host that turns it on shuts out everyone it has not given a credential, so an open host has only rate limits and consent between it and spam.
- **Exit is not solved.** A conversation is stored on one backend. Nothing here moves Bob's conversations if he leaves host B for another host, and this prototype did not try. XMTP's notes on archives made before its October 2026 change say they are not shown to restore active conversations on another backend.
- **Who hosts a conversation is decided by who writes first.** If Bob had written first, the conversation would live on host A.

## What It Does Not Show

- Browser clients. This used the Node SDK.
- Group chats, attachments or push notifications.
- A user with two devices.
- Any load, or more than two backends.
- A real Bitsocial key. The key bytes were random, not taken from a Bitsocial account, and `author.wallets.eth` was not read or checked.
- A backend with authentication or non-default rate limits.

## Run It

Needs Docker and Node 22.12 or later. The backends listen on `127.0.0.1` only.

```bash
npm install --ignore-scripts
```

```bash
docker compose up -d --wait
```

```bash
node demo.mjs
```

```bash
docker compose down -v
```

The script exits non-zero if any check fails. It deletes and recreates `./data` on each run.
