// The same test as ../demo.mjs, run inside a browser tab with @xmtp/browser-sdk.
// Both users live in this one tab, each with their own XMTP client and local database.
// Start the two backends first (docker compose up -d --wait), then: npm run browser

import PKC from "@pkcprotocol/pkc-js";
import { Client, LocalSigningKey } from "@xmtp/browser-sdk";
import { ethers } from "ethers";

const HOST_A = { url: "http://127.0.0.1:5150" };
const HOST_B = { url: "http://127.0.0.1:5151" };
const RUN = Date.now().toString(36); // fresh local databases on every page load

const results = [];
window.__results = results;
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  const item = document.createElement("li");
  item.className = ok ? "pass" : "fail";
  item.textContent = name;
  if (detail) item.appendChild(Object.assign(document.createElement("small"), { textContent: detail }));
  document.getElementById("results").appendChild(item);
};
const attempt = async (fn) => {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: String(error?.message ?? error).split("\n")[0].slice(0, 300) };
  }
};
const finish = (note) => {
  const failed = results.filter((result) => !result.ok);
  const text = `${results.length - failed.length}/${results.length} checks passed${note ? ` (${note})` : ""}`;
  document.getElementById("summary").textContent = text;
  window.__done = { passed: results.length - failed.length, total: results.length, note };
};

const fromBase64 = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const sameBytes = (a, b) => a.length === b.length && a.every((byte, index) => byte === b[index]);

// The BSIP-22 wallet proof, as in ../demo.mjs: same text and same signing as bitsocial-react-hooks 0.4.
const walletMessage = (authorAddress, walletAddress, timestamp) =>
  `{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"${authorAddress}","walletAddress":"${walletAddress.toLowerCase()}","timestamp":${timestamp}}`;
const ethWalletFromKey = async (keyBytes, authorAddress) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const wallet = new ethers.Wallet(ethers.utils.hexlify(keyBytes));
  const signature = await wallet.signMessage(walletMessage(authorAddress, wallet.address, timestamp));
  return { address: wallet.address, timestamp, signature: { signature, type: "eip191" } };
};
const walletIsValid = (wallet, authorAddress) =>
  wallet?.signature?.type === "eip191" &&
  wallet.timestamp <= Date.now() / 1000 + 300 &&
  ethers.utils.verifyMessage(walletMessage(authorAddress, wallet.address, wallet.timestamp), wallet.signature.signature).toLowerCase() ===
    wallet.address.toLowerCase();

const addressFromPublicKey = (publicKey) =>
  ethers.utils.base58.encode(Uint8Array.from([0x00, 0x24, 0x08, 0x01, 0x12, 0x20, ...publicKey]));
const ed25519PublicKeyFromSeed = async (seed) => {
  const pkcs8 = Uint8Array.from([...ethers.utils.arrayify("0x302e020100300506032b657004220420"), ...seed]);
  const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  return fromBase64((await crypto.subtle.exportKey("jwk", key)).x);
};

const xmtpIdentityFrom = (publication) => {
  const authorAddress = addressFromPublicKey(fromBase64(publication.signature.publicKey));
  const wallet = publication.author?.wallets?.eth;
  if (!wallet || !walletIsValid(wallet, authorAddress)) return undefined;
  return { authorAddress, identity: { identifier: wallet.address.toLowerCase(), kind: "ethereum" } };
};

const textsIn = async (conversation) =>
  (await conversation.messages())
    .filter((message) => message.content.kind === "text")
    .map((message) => ({ text: message.content.value, from: message.senderInboxId }));

const clients = [];
let pkc;
try {
  // pkc-js is used offline: it generates keys and signs publications, and contacts nothing.
  pkc = await PKC({ kuboRpcClientsOptions: ["http://127.0.0.1:1/api/v0"], httpRoutersOptions: [] });
  pkc.on("error", () => {});

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
  const openClient = async (account, host, dir) => {
    const client = await Client.create(await LocalSigningKey.fromBytes(account.keyBytes), {
      backend: host,
      storage: { location: { directory: `${RUN}-${dir}` } },
      deviceSync: false,
    });
    clients.push(client);
    return client;
  };

  const community = (await pkc.createSigner()).address;
  const alice = await newAccount("alice", community); // home: host A
  const bob = await newAccount("bob", community); // home: host B
  const bobSeen = xmtpIdentityFrom(bob.publication);
  const aliceSeen = xmtpIdentityFrom(alice.publication);
  document.getElementById("accounts").textContent =
    `alice ${alice.signer.address} -> ${aliceSeen?.identity.identifier} (home: host A) | ` +
    `bob ${bob.signer.address} -> ${bobSeen?.identity.identifier} (home: host B)`;

  const bobPublicKey = await ed25519PublicKeyFromSeed(bob.keyBytes);
  record(
    "one 32-byte key is both the Ed25519 author key and the secp256k1 wallet key",
    bob.keyBytes.length === 32 &&
      sameBytes(bobPublicKey, fromBase64(bob.publication.signature.publicKey)) &&
      addressFromPublicKey(bobPublicKey) === bob.signer.address,
  );
  record(
    "pkc-js signs a publication that carries author.wallets.eth",
    bob.publication.signature.type === "ed25519" && bob.publication.signature.signedPropertyNames.includes("author"),
  );
  record("author.wallets.eth in Bob's publication verifies against his Bitsocial address", bobSeen?.authorAddress === bob.signer.address);
  const forged = structuredClone(bob.publication);
  forged.author.wallets.eth.address = aliceSeen.identity.identifier;
  record("a wallet address swapped for someone else's is rejected", xmtpIdentityFrom(forged) === undefined);
  const xmtpIdentityOfBob = await (await LocalSigningKey.fromBytes(bob.keyBytes)).identity();
  record(
    "the XMTP identity from Bob's key bytes equals author.wallets.eth.address",
    xmtpIdentityOfBob.kind === "ethereum" && xmtpIdentityOfBob.identifier === bobSeen?.identity.identifier,
    `XMTP ${xmtpIdentityOfBob.identifier}`,
  );

  const aliceHome = await openClient(alice, HOST_A, "alice-home");
  const bobHome = await openClient(bob, HOST_B, "bob-home");
  record("each user registers on their own backend, from the browser", true);

  const reachableFromA = (await aliceHome.canMessage([bobSeen.identity])).values().next().value;
  record("no federation: Bob is not reachable from host A", reachableFromA === false, `canMessage -> ${reachableFromA}`);
  const dmFromA = await attempt(() => aliceHome.conversations.createDm(bobSeen.identity));
  record("no federation: a DM to Bob from host A is refused", Boolean(dmFromA.error), dmFromA.error ?? "it was accepted");

  const aliceOnB = await openClient(alice, HOST_B, "alice-on-b");
  record(
    "one tab holds Alice's clients for two backends at once, with the same inbox ID",
    aliceOnB.inboxId === aliceHome.inboxId,
    `A ${aliceHome.inboxId.slice(0, 16)}…  B ${aliceOnB.inboxId.slice(0, 16)}…`,
  );
  const reachableFromB = (await aliceOnB.canMessage([bobSeen.identity])).values().next().value;
  record("Bob is reachable once Alice is on host B", reachableFromB === true, `canMessage -> ${reachableFromB}`);

  const dm = await aliceOnB.conversations.createDm(bobSeen.identity);
  await dm.sendText("hello from a user of host A");
  record("Alice sends a DM on host B", true);

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

  const senderState = incoming ? (await bobHome.inboxStates([received[0].from], true))[0] : undefined;
  const senderIdentity = senderState?.identities[0]?.identifier;
  record(
    "the sender resolves to Alice's author.wallets.eth, and so to her Bitsocial address",
    senderIdentity?.toLowerCase() === aliceSeen.identity.identifier,
    `sender identity -> ${senderIdentity}, which is author.wallets.eth of ${aliceSeen.authorAddress}`,
  );

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
  finish();
} catch (error) {
  console.error(error);
  record("the run completed without an unexpected error", false, String(error?.stack ?? error).slice(0, 600));
  finish("stopped early");
} finally {
  for (const client of clients) await client.end().catch(() => {});
  await pkc?.destroy().catch(() => {});
}
