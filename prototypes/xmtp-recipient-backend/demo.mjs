// Can a user whose mailbox is on host A message a user whose mailbox is on host B,
// when the two hosts run separate XMTP backends that do not federate?
//
// The idea under test: the sender's client connects to the RECIPIENT's backend with the
// sender's own key and delivers there. Each step prints what happened; the script exits
// non-zero if a step that the idea depends on fails.
//
// Start the two backends first: docker compose up -d --wait

import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { Client, LocalSigningKey } from "@xmtp/node-sdk";

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

// A Bitsocial account is 32 private-key bytes. The same bytes become the XMTP signer.
const newAccount = async (name) => {
  const keyBytes = randomBytes(32);
  const signer = await LocalSigningKey.fromBytes(keyBytes);
  return { name, keyBytes, signer, identity: await signer.identity() };
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

const alice = await newAccount("alice"); // home: host A
const bob = await newAccount("bob"); // home: host B
console.log(`alice ${alice.identity.identifier} (home: host A)`);
console.log(`bob   ${bob.identity.identifier} (home: host B)\n`);

const clients = [];
try {
  // 1. Each user registers on their home backend.
  const aliceHome = await openClient(alice, HOST_A, "alice-home");
  const bobHome = await openClient(bob, HOST_B, "bob-home");
  clients.push(aliceHome, bobHome);
  record("each user registers on their own backend", true);

  // 2. The baseline: from her home backend, Alice cannot see or reach Bob.
  const reachableFromA = (await aliceHome.canMessage([bob.identity])).values().next().value;
  record("no federation: Bob is not reachable from host A", reachableFromA === false, `canMessage -> ${reachableFromA}`);
  const dmFromA = await attempt(() => aliceHome.conversations.createDm(bob.identity));
  record("no federation: a DM to Bob from host A is refused", Boolean(dmFromA.error), dmFromA.error ?? "it was accepted");

  // 3. The idea: Alice opens a second client, same key, on Bob's backend.
  const aliceOnB = await openClient(alice, HOST_B, "alice-on-b");
  clients.push(aliceOnB);
  record(
    "the same key gives the same inbox ID on both backends",
    aliceOnB.inboxId === aliceHome.inboxId,
    `A ${aliceHome.inboxId.slice(0, 16)}…  B ${aliceOnB.inboxId.slice(0, 16)}…`,
  );
  const reachableFromB = (await aliceOnB.canMessage([bob.identity])).values().next().value;
  record("Bob is reachable once Alice is on host B", reachableFromB === true, `canMessage -> ${reachableFromB}`);

  // 4. Alice sends to Bob, addressed by his Ethereum identity alone.
  const dm = await aliceOnB.conversations.createDm(bob.identity);
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
    "the sender resolves to Alice's identity",
    senderIdentity?.toLowerCase() === alice.identity.identifier.toLowerCase(),
    `sender identity -> ${senderIdentity}`,
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
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
