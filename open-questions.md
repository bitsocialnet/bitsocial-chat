# Open Questions

Decisions not yet made, grouped by the stages in [how-it-could-work.md](how-it-could-work.md).

## Scope

### Build It or Reuse It

Should private messages be new code on Bitsocial nodes, or an existing project such as XMTP? The arguments are in [research/existing-networks.md](research/existing-networks.md). Possible outcomes:

- A native mailbox and a chosen encryption library, built in stages.
- An existing stack run beside each Bitsocial node, with Bitsocial identities on top.
- An existing project as an interim client integration, with a defined way out, while the native layer is built.
- No private messages. An `author.dmServices` field lists a user's accounts on other messengers and clients link out.

### Can XMTP Be the Mailbox Without Federation

Since October 2026 each XMTP backend is its own network, and backends do not exchange messages (see [research/existing-networks.md](research/existing-networks.md#no-federation)). The code is MIT-licensed. So users on different Bitsocial hosts could not message each other through it as it stands. Three ways around that are listed in the research note: one shared backend, a client that connects to each recipient's backend, or reusing only the encryption library. The second one works in a [prototype](prototypes/xmtp-recipient-backend/), at a cost: conversations live on the recipient's host, hosts must accept registrations from strangers, and a user who changes host leaves their conversations behind. Which of the three is acceptable? Identity is not the obstacle: an account's key bytes already yield the Ethereum identity XMTP accepts.

### Is the Work Worth It

One view is that users move private conversations to a dedicated messenger anyway, so the effort is better spent elsewhere. The other is that a baseline inbox is expected of any social app, and that modmail and reports depend on it. Neither has been tested against real users.

### Who Builds It

The team is small and pkc-js has little spare capacity. A design that needs changes to pkc-js competes with everything else on its roadmap. A design that lives in a separate library does not, and is easier for new contributors to pick up, but it can only use what pkc-js already exposes.

## Stage 1: Public Live Chat

### Spam Control Without a Host

A community's challenges run on its host. A pubsub chat message never reaches one. Options to compare:

- The host signs a short-lived pass after a challenge, and clients drop messages without a valid pass.
- Peers enforce a rule every one of them can check, such as a list of allowed keys published by the community.
- Rate limits per key, enforced by each client.

### Moderation

How does a moderator remove a message or mute an author so that every client honours it? Does the community's existing roles map decide who may do so?

### Clients Without the libp2p Client

Browsers in gateway mode and clients that reach a node only over RPC cannot use pubsub directly. Do they get no chat, a relay, or a new RPC method?

### History

Does a room keep any history? If so, who serves it and for how long?

### Library or Instant Replies

Should live chat be a separate library, or wait for instant replies in pkc-js ([pkc-js#24](https://github.com/pkcprotocol/pkc-js/issues/24)) and be built on those?

## Stage 2: Private Messages

### Where the Mailbox Lives

Beside the node as a separate service, or inside pkc-js as a new kind of private storage on a profile node? The first needs no pkc-js change. The second lets any node operator host mailboxes with no extra software.

### Which Encryption

A double ratchet, MLS, or something else? It has to be audited, work in browsers, and not block groups later. Not chosen.

### Several Devices

How does a second device get the conversation keys and past messages? Bitsocial accounts are a single key that the user exports and imports today.

### Finding a User's Mailbox

A sender needs the recipient's encryption keys and the address of their mailbox. A profile lives at the author's identity key, so the profile record could carry both. What happens when the recipient has no profile node?

### Retention

How long does a mailbox keep an unread message, and a read one? What are the quotas?

### Abuse and Liability

A host stores ciphertext it cannot read. What can it do about a reported message, and what does it owe to whom? This needs legal review before any company hosts mailboxes.

### Deleting

Can a sender delete a message they sent? Can a recipient delete a conversation from the host?
