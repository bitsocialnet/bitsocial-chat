# What pkc-js Exposes Today

Can a separate chat library be built on pkc-js without changing it? Checked by reading the source of pkc-js `master` at commit `6b4e0f549` (2026-11-18). Nothing was run.

**Short answer.** Public live chat: yes, for clients that run the built-in libp2p client. Private messages: the encryption and the keys work, but there is nowhere on a node to store them.

## Findings

| Need | Status | Where |
|---|---|---|
| Pubsub for a separate library | Available | `pkc.clients.libp2pJsClients[key].heliaNode`, in [`src/helia/libp2pjsClient.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/helia/libp2pjsClient.ts) |
| The same in browsers | Available by default | Seedit and 5chan enable the libp2p client by default, in [`src/lib/p2p-browser-config.ts`](https://github.com/bitsocialnet/seedit/blob/master/src/lib/p2p-browser-config.ts) |
| Pubsub through a Kubo node | Not public | `PubsubClient._client` is marked private, in [`src/types.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/types.ts) |
| Pubsub through `pkc.pubsubSubscribe` | Not usable | It subscribes with an empty handler, to warm up publishing. Messages are discarded. [`src/pkc/pkc.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/pkc/pkc.ts) |
| Pubsub or custom methods over PKC RPC | Not available | The RPC server registers a fixed list of methods, in [`src/rpc/src/index.ts`](https://github.com/pkcprotocol/pkc-js/blob/master/src/rpc/src/index.ts) |
| Private storage on a profile node | Not available | A profile is an ordinary community. See [`docs/protocol/author-communities.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/author-communities.md) |
| Encryption helpers | Not exported, not suitable | `ed25519-aes-gcm`, in [`docs/encryption.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/encryption.md) |
| Signing key stays with the user | Yes | The RPC server accepts a `signature` and no `signer`. See "How the owner publishes" in `author-communities.md` |

## Notes

### The Shared Node

`heliaNode` returns the running Helia node. The accessor's own documentation guarantees `libp2p.services.pubsub` (gossipsub), `libp2p.services.fetch`, the `blockstore` and `libp2p.contentRouting`, and states that changing what it returns is a breaking release. It was added for libraries that share the node ([pkc-js#221](https://github.com/pkcprotocol/pkc-js/issues/221)).

[pubsub-voting](https://github.com/bitsocialnet/pubsub-voting) is a separate library built this way, with an integration test that runs it on real pkc-js instances. A chat library can follow the same pattern.

### Who Is Left Out

A client has the shared node only if it was created with `libp2pJsClientsOptions`. These clients have no usable pubsub for a chat library:

- A browser in gateway mode, which uses public pubsub providers through a private client.
- A node that uses Kubo for pubsub.
- Any client that reaches its node only over PKC RPC.

### Profiles Are Public

An author's profile is a community addressed by the author's identity key, configured so only the owner can post. A reply-able variant lets strangers reply behind a challenge. In both, every accepted record is public and published to IPFS. There is no hook for data that only the owner can fetch, so a mailbox cannot be built from a profile as it stands.

### Encryption

`ed25519-aes-gcm` encrypts the challenge exchange between a publisher and a community. It derives one shared key from the two parties' long-term keys. That is fine for a short exchange, but for messaging it means no forward secrecy: one leaked key exposes every past message between the pair. The functions are also not exported from the package. Private messages should use a separate audited library.

### Keys

A publication is signed on the client and sent to the node already signed. The RPC schema requires the signature and has no field for a private key, so the node cannot re-sign or impersonate the author. A profile is published through a second key held by the node, while the author's own key stays with the author ([`docs/protocol/delegated-ipns.md`](https://github.com/pkcprotocol/pkc-js/blob/master/docs/protocol/delegated-ipns.md)). A host that runs a user's profile node therefore holds no key that could decrypt that user's messages.

### Challenges

The built-in challenges are exported at `@pkcprotocol/pkc-js/challenges` for Node only. Whether they can be reused to gate chat messages has not been checked.
