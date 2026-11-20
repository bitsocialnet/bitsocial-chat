# How It Could Work

A sketch, not a specification. Each stage lists what is known and what is assumed. Undecided points are in [open-questions.md](open-questions.md).

## Stage 1: Public Live Chat

**What it is.** A chat room attached to a community or to one post. Messages appear as they arrive. A user who joins late sees only what is sent from then on, or a short recent history.

**How.** Each room is a pubsub topic. A message is a small signed record: the author's public key, the text, a timestamp and the room it belongs to, signed with the same key the author signs comments with. Clients subscribe to the topic, verify each signature and render what passes.

**What exists today.** pkc-js exposes the running libp2p node, including its pubsub service, through a public accessor. [pubsub-voting](https://github.com/bitsocialnet/pubsub-voting) is already a separate library built on it. So a chat library can send and receive on its own topics without any change to pkc-js. See [research/pkc-js-surface.md](research/pkc-js-surface.md) for the limits.

**What is missing.**

- **Spam control.** A community's challenges run on its host node when a post is published. A pubsub chat message has no such gate, so anyone can flood a topic. This is the hard part of Stage 1.
- **Moderation.** A moderator needs a way to remove a message or mute an author that all clients honour.
- **History.** Whether a room keeps any, and who serves it.

**Relation to instant replies.** [pkc-js#24](https://github.com/pkcprotocol/pkc-js/issues/24) proposes showing replies before the community's next update. That would make ordinary threads feel live, with the community's own spam and moderation rules applied. Live chat as a separate library is the other route: faster to try, but it has to solve spam and moderation itself. They may converge.

## Stage 2: Private Messages

**What it is.** A Reddit-style inbox. One user sends another a text message. The recipient reads it later from any app.

**Request and accept.** The first message to a stranger is a request. The recipient accepts it, ignores it or blocks the sender. Nothing further is delivered until they accept. This is the main defence against unwanted messages.

**Encryption.** End to end, with a maintained and audited library, for example a double ratchet or MLS implementation. pkc-js has its own encryption for the challenge exchange, but it derives one fixed key per pair of users, so a leaked key would expose every past message. It is not a base for private messaging.

**Where messages wait.** A recipient is often offline, so something has to hold their messages. The proposal is the recipient's own profile node, whether hosted or self-hosted. It stores ciphertext it cannot read, with a size quota and an expiry. A user who moves their profile to another host takes their mailbox with them.

**Keys.** A user's signing key stays on their devices. A publication reaches a node already signed, and the node never holds the key. A hosted profile node therefore cannot read its user's messages.

**What is missing.**

- **The mailbox.** pkc-js has no private storage on a node. A profile is an ordinary community, so everything in it is public. The mailbox has to be a service next to the node or a new part of pkc-js.
- **Several devices.** A second device needs the conversation keys and the history. This is the largest piece of design work.
- **Recovery.** What a user keeps after losing a device.
- **Abuse.** A host stores ciphertext it cannot inspect. It needs quotas, a way for recipients to report a message, and a way to drop an abusive sender.
- **Legal review** for any company that hosts mailboxes.

**What it would give apps.** Direct messages, modmail and reports. A report can be a private message to a community's moderators that the app composes.

## Stage 3: Real-Time Private Chat

When both users are online, a Stage 2 message is also sent over a pubsub topic the two share, so it arrives at once. The mailbox remains the fallback and the record. No new storage or encryption is needed.

## Stage 4: Groups and a Full Messenger

Not planned. Group encryption, attachments and calls are each large. The earlier stages should avoid choices that would block them, for example by picking an encryption scheme that can extend to groups.

## What Runs Where

| Piece | Where it would live | What it does |
|---|---|---|
| Chat library | A package any Bitsocial app can install | Message formats, signing, verification, encryption, topics. |
| Hooks | bitsocial-react-hooks, or a companion package | Rooms, conversations and inbox state for React apps. |
| Mailbox | Beside or inside a profile node | Holds ciphertext for an offline recipient. Only if Stage 2 is built. |
| Clients | Seedit, 5chan, WeTube and others | The chat and inbox screens. |
