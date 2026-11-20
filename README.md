# Bitsocial Chat

**Bitsocial Chat is a plan for chat on Bitsocial: live chat in communities and private messages between users**, using the identities and nodes Bitsocial already has. Any Bitsocial app could use it, so a user keeps one identity and one inbox whichever app they open.

> **Status: idea stage.** This repository collects the design and the research. Nothing here is built or tested, and the scope is not agreed yet. See [open-questions.md](open-questions.md).

## The Problem

Bitsocial has posts, replies and votes. It has no chat of any kind ([pkc-js#51](https://github.com/pkcprotocol/pkc-js/issues/51), [pkc-js#24](https://github.com/pkcprotocol/pkc-js/issues/24)):

- A user cannot message a moderator, so there is no modmail and no private report.
- A forum or a Twitter-style app has no direct messages.
- A video app has no live chat beside a stream.

A reply is also slow by design. A community publishes its updates on an interval, so a thread cannot behave like a chat room.

## Three Features, Not One

"Chat" covers three things with very different costs. Treating them as one is what makes the whole look too large to build.

| | Public live chat | Private messages | Private real-time and group chat |
|---|---|---|---|
| Examples | Stream chat, live threads, chat rooms | Modmail, reports, direct messages | A messenger |
| Who can read it | Anyone | Two people | The participants |
| Kept for later | No, or briefly | Yes, until read or expired | Yes |
| Needs encryption | No | Yes | Yes |
| Needs storage while a user is offline | No | Yes | Yes |
| Needs syncing between a user's devices | No | Yes | Yes |
| Private data a host has to hold | None | Ciphertext | Ciphertext |

## The Plan

| Stage | What it is | What it needs |
|---|---|---|
| **1. Public live chat** | Signed messages sent over pubsub in a topic tied to a community or a post. Shown as they arrive and not stored permanently. | No pkc-js change for browsers and nodes that run the built-in libp2p client. See [research/pkc-js-surface.md](research/pkc-js-surface.md). Spam control is the open problem. |
| **2. Private messages** | One-to-one, text only, asynchronous. A request the recipient accepts or blocks, then end-to-end encrypted messages held as ciphertext on the recipient's profile node until fetched. | A mailbox beside or inside the node, which pkc-js does not have. An audited encryption library, not new cryptography. |
| **3. Real-time private chat** | Stage 2 messages delivered over the Stage 1 path when both sides are online. | Stages 1 and 2. |
| **4. Groups and a full messenger** | Group chats, attachments, calls. | Not planned. The earlier stages should not rule it out. |

Details are in [how-it-could-work.md](how-it-could-work.md).

## Out of Scope for Now

Groups, typing indicators, read receipts, presence, native attachments, calls and disappearing messages. A client that needs a full messenger today can link out to one.

## Build It or Reuse It

This is the main open question, and both sides have real arguments. They are laid out in [research/existing-networks.md](research/existing-networks.md). In short:

- **For reusing an existing project:** audited encryption, offline delivery and device sync already exist. A small team should not rebuild them.
- **For a native layer:** every other part of Bitsocial can move between a hosted node, a competing host and a self-hosted node. A user's messages should move the same way, and one inbox should work in every Bitsocial app.

The two may not conflict. In October 2026 XMTP became a stack that anyone runs themselves, with no shared network. A Bitsocial host could run it beside its node as the mailbox, and its code is MIT-licensed. The catch is that two such backends do not exchange messages, so users on different hosts could not reach each other without extra design.

## How to Help

Nothing is decided, so opinions and evidence are both useful. Open an issue if you can:

- Answer or sharpen anything in [open-questions.md](open-questions.md).
- Correct or update the research notes. Each one says when it was last checked.
- Share experience building on XMTP, Matrix, Waku, MLS or a double ratchet, in a browser especially.
- Propose a design for spam control in a pubsub chat room.

## Documents

- [how-it-could-work.md](how-it-could-work.md): the stages in more detail.
- [open-questions.md](open-questions.md): decisions not yet made.
- [research/pkc-js-surface.md](research/pkc-js-surface.md): what pkc-js exposes to a separate library today.
- [research/existing-networks.md](research/existing-networks.md): XMTP, Matrix, SimpleX, Waku and others.

## License

[GPL-3.0](LICENSE)
