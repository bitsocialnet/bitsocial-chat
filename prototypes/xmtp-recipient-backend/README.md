# Prototype: Messaging Across Two XMTP Backends

XMTP backends do not federate ([research note](../../research/existing-networks.md#no-federation)). This prototype tests one way around that: **the sender's client connects to the recipient's backend and delivers there.**

**Result: it works.** Run on 2026-11-20 against two local backends (`ghcr.io/xmtp/backend:8.0.0-rc4`) with `@xmtp/node-sdk` 8.0.0-rc4, `@pkcprotocol/pkc-js` 0.0.153 and `ethers` 5.8.0 on Node 22. All fifteen checks passed on three runs.

## What It Does

Two backends stand in for two Bitsocial hosts. Alice keeps her mailbox on host A, Bob on host B. Each account is a real Bitsocial account, made the way a client built on bitsocial-react-hooks makes one: pkc-js generates the key, `author.wallets.eth` is derived from the same 32 private-key bytes, and pkc-js signs a comment that carries it. That comment stands for any record of the author that another user can read. It is not published anywhere, and pkc-js contacts nothing.

Alice learns Bob's XMTP identity only from his signed comment.

| Step | Outcome |
|---|---|
| The 32 key bytes give the Ed25519 public key that signed the comment, and the author's address | Yes |
| pkc-js signs a comment carrying `author.wallets.eth` | Works, and `author` is among the signed fields |
| Alice checks `author.wallets.eth` in Bob's comment against his Bitsocial address | Valid |
| The same comment with the wallet address swapped for another | Rejected |
| The XMTP identity made from Bob's key bytes | Equal to `author.wallets.eth.address` |
| Each user registers on their own backend, signing in with their Bitsocial key bytes | Works |
| From host A, Alice asks whether Bob is reachable | No |
| From host A, Alice opens a DM to Bob | Refused: `inbox id for address … not found` |
| Alice opens a second client on host B with the same key | Works, with no step for Alice beyond the connection |
| Alice's inbox ID on host A and on host B | Identical |
| From host B, Alice asks whether Bob is reachable | Yes |
| Alice sends Bob a DM, addressed by the identity read from his comment | Works |
| Bob, who only ever used host B, receives it | Yes, as a conversation awaiting his consent |
| Bob looks up who sent it | The sender's inbox resolves to the `author.wallets.eth` address in Alice's comment, and so to her Bitsocial address |
| Bob replies, and Alice reads it through her host-B client | Works |
| Alice looks for the conversation on host A | It is not there |

## What This Shows

- A host can run its own XMTP backend, and users of other hosts can still message its users.
- A Bitsocial account needs nothing added to become an XMTP inbox. The key bytes sign in, and the `author.wallets.eth` that clients already publish is the address others send to.
- One Bitsocial key gives one XMTP inbox ID everywhere, so the same person is recognisable on every backend.
- The link runs both ways. A sender goes from a Bitsocial address to an XMTP identity, and a recipient goes from an incoming XMTP message back to a Bitsocial address.
- A sender needs two facts about a recipient: their Ethereum identity and the address of their backend. Bitsocial records already carry the first and could carry the second.
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
- A comment fetched from the network. The comment was signed locally and never published. Its Ed25519 signature was not verified here, because pkc-js does not export its verifier. A real client must rely on that check, which pkc-js runs on what it fetches: without it, anyone could forge a comment in Bob's name that carries their own wallet.
- An account with no `author.wallets.eth`, or one whose wallet was made from a different key.
- An existing account. The keys were generated for the test.
- A backend with authentication or non-default rate limits.

## Run It

Needs Docker and Node 22.12 or later. The backends listen on `127.0.0.1` only.

```bash
npm install --ignore-scripts
```

```bash
npm rebuild better-sqlite3
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
