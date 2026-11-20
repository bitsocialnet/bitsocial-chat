# Existing Networks

Notes on the messaging projects that came up as alternatives to a native layer, and the arguments on each side.

> **Dates.** The XMTP and Coinbase facts were read from the linked pages on 2026-11-20. The Matrix, SimpleX and Meta notes are from August 2026 and have not been re-checked. Corrections are welcome.

## XMTP Changed in October 2026

Most of the earlier discussion assumed XMTP was one shared network that an app connects to. That is no longer true, and it changes the arguments below.

On 2026-10-21 XMTP announced that it is now a messaging stack each app runs itself ([announcement](https://blog.xmtp.org/self-hosted-xmtp/)):

- **The shared network is closing.** The hosted `dev` and `production` networks shut down on 2027-02-01. Messages do not carry over: a client starts with a fresh database on a self-hosted backend, with a one-time import for apps that stored messages.
- **The backend is one program.** A single binary with PostgreSQL 17 or later for storage. It serves web and native clients on one port. [Run the backend](https://xmtp.org/get-started/run-the-backend/), [deployment overview](https://xmtp.org/deploy/overview/)
- **Each backend is its own network, and backends do not federate.** A client is given one backend URL, and its local database is bound to that backend's identifier. Participants in a conversation have to be on the same backend. See [No Federation](#no-federation) below.
- **Licence.** MIT. The backend, the core library and the SDKs live in one repository, [xmtp/libxmtp](https://github.com/xmtp/libxmtp), whose `LICENSE` and Cargo workspace both say MIT.
- **The operator sets the rules.** Rate limits, group size, retention (90 days by default for messages), optional sign-in by API key or token, and optional attachment storage.
- **No token and no network fees.** The announcement says there is no token and will not be one. XMTP Labs says it will fund the project for two years while it moves to community ownership.
- **Encryption.** MLS for one-to-one and group chats, with forward secrecy and recovery after a key is compromised. NCC Group reviewed the MLS implementation in 2024. [Security](https://xmtp.org/protocol/security/)
- **Spam.** Consent preferences let a user allow or block senders, and sync between that user's devices. [Consent](https://xmtp.org/sdk/consent/)

**Not checked.** Which identity types the new SDKs accept, and whether a Bitsocial key can be one. How it behaves in a browser at Bitsocial's scale. How long an integration would take.

### No Federation

Two XMTP backends cannot exchange messages. This is a conclusion from the documentation, not a statement XMTP makes in those words:

- The full developer guide and the protocol specs ([llms-full.txt](https://xmtp.org/llms-full.txt) and [llms-specs.txt](https://xmtp.org/llms-specs.txt), about 1.9 MB of text) do not contain the word "federate" or "federation", and describe no way for one backend to reach another.
- Every example that connects two parties puts them on the same backend URL. The home page says all participants need an integration "on the same backend".
- The client's local database is bound to one backend identifier. Connecting it to a backend with a different identifier is recorded as a conflict and stops it working.
- The announcement describes the direction as many separate networks: "Instead of one network that we run, the plan is lots of them, run by the people building on them, all on the same open protocol."
- A search of the repository's issues and code for federation found nothing relevant.

"The same open protocol" here means any app can point at any backend, not that backends talk to each other. Apps interoperate by sharing a backend.

## What This Means for the Arguments

Two arguments from the earlier discussion no longer apply to XMTP:

- *"Someone else stores the messages."* With a self-hosted backend, whoever runs it stores them. The abuse and legal questions are the same as for a native mailbox.
- *"Bitsocial would depend on another network's operators and fees."* There is no shared operator set and no per-message fee any more.

That leaves a different question: **could the XMTP stack be the mailbox?** A host would run the XMTP backend next to its Bitsocial node, and the chat library would use the XMTP SDKs instead of new code.

- **For:** encryption, offline delivery, device sync, groups and consent are built, audited in part, and maintained by someone else. A small team would write an integration, not a messenger.
- **Against:** backends do not federate, so two users on different hosts cannot message each other through it as it stands. That leaves three shapes, none of them free:
  - **One backend for all of Bitsocial.** Simple, but a single operator holds every mailbox and nobody can exit to their own node.
  - **The sender connects to the recipient's backend.** Each host runs its own, and a client opens a separate XMTP client, with its own inbox and local database, for every backend it talks to. Nothing in the documentation rules this out or describes it. It needs a prototype.
  - **Use only the library.** Take the MIT-licensed MLS code from libxmtp and write Bitsocial's own delivery and storage. This keeps the audited cryptography and gives up the ready-made backend.
- **Unknown:** whether a Bitsocial identity can be used directly, and how stable a stack is that changed direction this sharply within a year.

## The Arguments That Still Stand

### For Building on an Existing Project

- **The hard parts are already built.** Audited encryption, delivery to offline users and sync between devices take years to get right.
- **The team is small.** A mailbox, device sync, recovery and abuse handling are original engineering even when the cryptography is reused.
- **Users may not stay.** People often open a conversation on a social app and then move it to a dedicated messenger.

### For a Native Layer

- **Exit.** A user can move their profile and communities from a hosted node to a competing host or their own node. Their messages should be able to move the same way.
- **One inbox across apps.** Changing app should not change identity, inbox or conversations. A list of external accounts keeps each inbox separate.
- **The scope can be small.** One-to-one, text only and asynchronous is far less than a messenger.

### Where Both Agree

- New cryptography should not be invented.
- A messenger on the scale of Telegram or Discord is out of reach for now.
- The work should be designed and estimated before anyone commits to it.

## Matrix

Federated, client to server. Users have accounts on homeservers, and the servers relay end-to-end encrypted messages they cannot read. It has embeddable SDKs, but an integration brings Matrix accounts, a homeserver, device state and key management with it. [Encryption guide](https://matrix.org/docs/matrix-concepts/end-to-end-encryption/)

Unlike XMTP's backends as documented, Matrix homeservers do talk to each other. A homeserver run by a Bitsocial app was suggested as a quick interim option.

## SimpleX

No user identifiers. Each contact pair uses its own message queues on relays the users choose. It has its own identity and delivery model, so embedding it does not make its conversations Bitsocial conversations. The code is AGPLv3. [Protocol overview](https://github.com/simplex-chat/simplexmq/blob/stable/protocol/overview-tjr.md)

## Waku

Pubsub with spam protection, close in design to Bitsocial's own pubsub layer. It was suggested as a middle ground. Not evaluated. An earlier conversation between the two projects is on the [Vac forum](https://forum.vac.dev/t/waku-brain-dump-conversation-with-plebbit-devs/506).

## Others Mentioned

- **Berty and Keet.** Peer-to-peer messengers with open-source code. Suggested as sources of code to reuse. Not evaluated.
- **Nostr.** Suggested as a transport. [bitchat](https://github.com/permissionlesstech/bitchat) uses it for messages that leave Bluetooth range. Not evaluated.
- **Freenet.** Suggested, and described as immature. Not evaluated.

## Linking Out: `author.dmServices`

A proposed field on an author listing their accounts elsewhere, for example `{ "signal": "username" }`. Clients choose which to show. It costs almost nothing to add and could sit beside a native inbox. On its own it gives no channel that is guaranteed to work between two Bitsocial users, since both need an account on the same outside service.

## Related Precedents

- **Coinbase Wallet** used XMTP for in-app messaging. Its help page says the feature has been unavailable since 20 January 2025 during an upgrade. [Coinbase Wallet messaging](https://help.coinbase.com/en-au/wallet/messaging/info)
- **Meta** stated in 2019 that people should be able to reach each other across its apps, and joined Instagram and Messenger messaging for a time before ending that feature in 2023. It shows demand for one inbox behind several apps, and that it is hard to keep even inside one company. [Zuckerberg, 2019](https://about.fb.com/news/2019/03/vision-for-social-networking/)
