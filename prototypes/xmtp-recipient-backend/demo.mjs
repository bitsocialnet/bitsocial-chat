// Can a user whose mailbox is on host A message a user whose mailbox is on host B,
// when the two hosts run separate XMTP backends that do not federate?
//
// The idea under test: the sender's client connects to the RECIPIENT's backend with the
// sender's own key and delivers there. Each step prints what happened; the script exits
// non-zero if a step that the idea depends on fails.
//
// The accounts are real Bitsocial accounts: pkc-js generates each key, and the sender learns
// the recipient's XMTP identity only from `author.wallets.eth` in a publication the recipient
// signed.
//
// Start the two backends first: docker compose up -d --wait

import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import PKC from "@pkcprotocol/pkc-js";
import { Client, LocalSigningKey } from "@xmtp/node-sdk";
import { ethers } from "ethers";

const HOST_A = { url: process.env.HOST_A_URL ?? "http://127.0.0.1:5150" };
const HOST_B = { url: process.env.HOST_B_URL ?? "http://127.0.0.1:5151" };
const DATA = new URL("./data/", import.meta.url).pathname;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
};
const attempt = async (fn) => {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: String(error?.message ?? error).split("\n")[0].slice(0, 300) };
  }
};

// pkc-js is used offline: it generates keys and signs publications, and contacts nothing.
const pkc = await PKC({ noData: true, kuboRpcClientsOptions: ["http://127.0.0.1:1/api/v0"], httpRoutersOptions: [] });
pkc.on("error", () => {});

const fromBase64 = (text) => Uint8Array.from(Buffer.from(text, "base64"));

// The wallet proof BSIP-22 defines, which pkc-js 0.0.155 and later check before publishing and
// communities check on acceptance. Same text and same signing as bitsocial-react-hooks 0.4,
// src/lib/chain/author-wallet-proof.ts and chain.ts (getWalletMessageToSign,
// getEthWalletFromPkcPrivateKey), ethers 5.8.0. `authorAddress` is the key address of the signing
// key, never a name.
const walletMessage = (authorAddress, walletAddress, timestamp) =>
  `{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"${authorAddress}","walletAddress":"${walletAddress.toLowerCase()}","timestamp":${timestamp}}`;
const ethWalletFromKey = async (keyBytes, authorAddress) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const wallet = new ethers.Wallet(ethers.utils.hexlify(keyBytes));
  const signature = await wallet.signMessage(walletMessage(authorAddress, wallet.address, timestamp));
  return { address: wallet.address, timestamp, signature: { signature, type: "eip191" } };
};
// BSIP-22 accepts a timestamp up to 300 seconds ahead of the verifier's clock.
const walletIsValid = (wallet, authorAddress) =>
  wallet?.signature?.type === "eip191" &&
  wallet.timestamp <= Date.now() / 1000 + 300 &&
  ethers.utils.verifyMessage(walletMessage(authorAddress, wallet.address, wallet.timestamp), wallet.signature.signature).toLowerCase() ===
    wallet.address.toLowerCase();

// A Bitsocial address is the libp2p peer ID of the author's Ed25519 public key.
const addressFromPublicKey = (publicKey) =>
  ethers.utils.base58.encode(Uint8Array.from([0x00, 0x24, 0x08, 0x01, 0x12, 0x20, ...publicKey]));
const ed25519PublicKeyFromSeed = (seed) => {
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seed)]);
  return createPublicKey(createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" })).export({ format: "der", type: "spki" }).subarray(-32);
};

// A new Bitsocial account, made the way a client built on bitsocial-react-hooks makes one:
// a pkc-js signer, plus author.wallets.eth derived from the same 32 private-key bytes.
// `publication` is a comment pkc-js signed with that key. It stands for any record of this
// author that another user can read.
const newAccount = async (name, communityAddress) => {
  const signer = await pkc.createSigner();
  const keyBytes = fromBase64(signer.privateKey);
  const wallet = await ethWalletFromKey(keyBytes, signer.address);
  const comment = await pkc.createComment({
    signer,
    communityAddress,
    title: `${name}'s post`,
    content: "hello",
    author: { wallets: { eth: wallet } },
  });
  return { name, signer, keyBytes, publication: comment.raw.pubsubMessageToPublish };
};

// What a sender does with a recipient's publication: take the author's address from the key
// that signed it, check author.wallets.eth against that address, and use the wallet address as
// the XMTP identity. Returns undefined if the wallet does not check out.
const xmtpIdentityFrom = (publication) => {
  const authorAddress = addressFromPublicKey(fromBase64(publication.signature.publicKey));
  const wallet = publication.author?.wallets?.eth;
  if (!wallet || !walletIsValid(wallet, authorAddress)) return undefined;
  return { authorAddress, identity: { identifier: wallet.address.toLowerCase(), kind: "ethereum" } };
};

const openClient = async (account, host, dir) =>
  Client.create(await LocalSigningKey.fromBytes(account.keyBytes), {
    backend: host,
    storage: { location: { directory: `${DATA}${dir}` }, encryptionKey: randomBytes(32) },
    deviceSync: false,
  });

const textsIn = async (conversation) =>
  (await conversation.messages())
    .filter((message) => message.content.kind === "text")
    .map((message) => ({ text: message.content.value, from: message.senderInboxId }));

await rm(DATA, { recursive: true, force: true });

const community = (await pkc.createSigner()).address; // only fills the comment's community field
const alice = await newAccount("alice", community); // home: host A
const bob = await newAccount("bob", community); // home: host B

// 0. The keys. Everything Alice knows about Bob from here on comes from bobSeen.
const bobSeen = xmtpIdentityFrom(bob.publication);
const aliceSeen = xmtpIdentityFrom(alice.publication);
console.log(`alice ${alice.signer.address} -> ${aliceSeen?.identity.identifier} (home: host A)`);
console.log(`bob   ${bob.signer.address} -> ${bobSeen?.identity.identifier} (home: host B)\n`);
record(
  "one 32-byte key is both the Ed25519 author key and the secp256k1 wallet key",
  bob.keyBytes.length === 32 &&
    ed25519PublicKeyFromSeed(bob.keyBytes).equals(Buffer.from(bob.publication.signature.publicKey, "base64")) &&
    addressFromPublicKey(ed25519PublicKeyFromSeed(bob.keyBytes)) === bob.signer.address,
);
record(
  "pkc-js signs a publication that carries author.wallets.eth",
  bob.publication.signature.type === "ed25519" && bob.publication.signature.signedPropertyNames.includes("author"),
);
record(
  "author.wallets.eth in Bob's publication verifies against his Bitsocial address",
  bobSeen?.authorAddress === bob.signer.address,
);
const forged = structuredClone(bob.publication);
forged.author.wallets.eth.address = aliceSeen.identity.identifier;
record("a wallet address swapped for someone else's is rejected", xmtpIdentityFrom(forged) === undefined);
const xmtpIdentityOfBob = await (await LocalSigningKey.fromBytes(bob.keyBytes)).identity();
record(
  "the XMTP identity from Bob's key bytes equals author.wallets.eth.address",
  xmtpIdentityOfBob.kind === "ethereum" && xmtpIdentityOfBob.identifier === bobSeen?.identity.identifier,
  `XMTP ${xmtpIdentityOfBob.identifier}`,
);
if (!bobSeen || !aliceSeen) process.exit(1);

const clients = [];
try {
  // 1. Each user registers on their home backend.
  const aliceHome = await openClient(alice, HOST_A, "alice-home");
  const bobHome = await openClient(bob, HOST_B, "bob-home");
  clients.push(aliceHome, bobHome);
  record("each user registers on their own backend", true);

  // 2. The baseline: from her home backend, Alice cannot see or reach Bob.
  const reachableFromA = (await aliceHome.canMessage([bobSeen.identity])).values().next().value;
  record("no federation: Bob is not reachable from host A", reachableFromA === false, `canMessage -> ${reachableFromA}`);
  const dmFromA = await attempt(() => aliceHome.conversations.createDm(bobSeen.identity));
  record("no federation: a DM to Bob from host A is refused", Boolean(dmFromA.error), dmFromA.error ?? "it was accepted");

  // 3. The idea: Alice opens a second client, same key, on Bob's backend.
  const aliceOnB = await openClient(alice, HOST_B, "alice-on-b");
  clients.push(aliceOnB);
  record(
    "the same key gives the same inbox ID on both backends",
    aliceOnB.inboxId === aliceHome.inboxId,
    `A ${aliceHome.inboxId.slice(0, 16)}…  B ${aliceOnB.inboxId.slice(0, 16)}…`,
  );
  const reachableFromB = (await aliceOnB.canMessage([bobSeen.identity])).values().next().value;
  record("Bob is reachable once Alice is on host B", reachableFromB === true, `canMessage -> ${reachableFromB}`);

  // 4. Alice sends to Bob, addressed by the identity read from his publication.
  const dm = await aliceOnB.conversations.createDm(bobSeen.identity);
  await dm.sendText("hello from a user of host A");
  record("Alice sends a DM on host B", true);

  // 5. Bob, who has only ever used host B, receives it as a request from an unknown sender.
  await bobHome.conversations.syncAll(undefined);
  const bobDms = await bobHome.conversations.list();
  const requests = await bobHome.conversations.list({ consentStates: ["unknown"] });
  const incoming = bobDms[0];
  const received = incoming ? await textsIn(incoming) : [];
  record(
    "Bob receives it on his own backend",
    received.some((message) => message.text === "hello from a user of host A"),
    `conversations: ${bobDms.length}, of which awaiting Bob's consent: ${requests.length}`,
  );

  // 6. Bob can tell who it is from: the sender's inbox resolves to Alice's Ethereum identity.
  const senderState = incoming ? (await bobHome.inboxStates([received[0].from], true))[0] : undefined;
  const senderIdentity = senderState?.identities[0]?.identifier;
  record(
    "the sender resolves to Alice's author.wallets.eth, and so to her Bitsocial address",
    senderIdentity?.toLowerCase() === aliceSeen.identity.identifier,
    `sender identity -> ${senderIdentity}, which is author.wallets.eth of ${aliceSeen.authorAddress}`,
  );

  // 7. Bob replies. The reply lands on host B, so Alice only sees it through her host-B client.
  await incoming.updateConsentState("allowed");
  await incoming.sendText("hello back from host B");
  await aliceOnB.conversations.syncAll(undefined);
  const aliceSees = await textsIn(dm);
  record("Alice reads the reply through her host-B client", aliceSees.some((message) => message.text === "hello back from host B"));

  await aliceHome.conversations.syncAll(undefined);
  const homeConversations = await aliceHome.conversations.list();
  record(
    "the conversation does not exist on Alice's home backend",
    homeConversations.length === 0,
    `conversations visible from host A: ${homeConversations.length}`,
  );
} finally {
  for (const client of clients) await client.end().catch(() => {});
  await pkc.destroy().catch(() => {});
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
