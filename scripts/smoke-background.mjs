const memory = {};
let messageListener = null;
let removedListener = null;
const sentMessages = [];
const tabs = [
  { id: 10, url: 'https://de.aipass.net/chat', active: true }
];
let nextTabId = 42;

globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter(key => key in memory).map(key => [key, memory[key]]));
      },
      async set(values) { Object.assign(memory, values); },
      async remove(keys) {
        for (const key of (Array.isArray(keys) ? keys : [keys])) delete memory[key];
      }
    }
  },
  tabs: {
    async query() { return tabs.map(tab => ({ ...tab })); },
    async update(id, props) {
      const tab = tabs.find(item => item.id === id);
      if (!tab) throw new Error(`TAB_NOT_FOUND_${id}`);
      Object.assign(tab, props);
      return { ...tab };
    },
    async create(props) {
      const tab = { id: nextTabId++, ...props };
      tabs.push(tab);
      return { ...tab };
    },
    async sendMessage(id, message) {
      sentMessages.push({ id, message });
      return { ok: true };
    },
    onRemoved: { addListener(fn) { removedListener = fn; } }
  },
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(fn) { messageListener = fn; } }
  }
};

await import(new URL('../background.js', import.meta.url).href + `?smoke=${Date.now()}`);
if (!messageListener) throw new Error('background listener was not registered');
if (!removedListener) throw new Error('tab removal listener was not registered');

function sender(tabId) {
  const tab = tabs.find(item => item.id === tabId) || { id: tabId, url: 'https://example.invalid/' };
  return { tab };
}

function send(message, fromTabId = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${message.type}`)), 10000);
    messageListener(message, fromTabId == null ? {} : sender(fromTabId), response => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

const initial = await send({ type: 'GET_STATE' });
if (!initial.ok || initial.value.bridge) throw new Error('Initial bridge state invalid');

const connected = await send({
  type: 'CONNECT_CHATGPT',
  projectId: 'ceo-swap-aipassport'
}, 10);
if (!connected.ok) throw new Error(connected.error);
const bridge = connected.value.bridge;
if (bridge.matched) throw new Error('Bridge must wait for ChatGPT registration');
if (bridge.aipassTabId !== 10 || bridge.chatgptTabId !== 42) throw new Error('Pair tab binding invalid');
if (!bridge.pairId || !bridge.pairCode) throw new Error('Pair ID was not created');

const wrongPair = await send({
  type: 'REGISTER_SIDE',
  side: 'chatgpt',
  pairId: 'wrong-pair',
  projectId: bridge.projectId
}, 42);
if (wrongPair.ok || wrongPair.error !== 'PAIR_ID_MISMATCH') throw new Error('Wrong Pair ID was not blocked');

const registered = await send({
  type: 'REGISTER_SIDE',
  side: 'chatgpt',
  pairId: bridge.pairId,
  projectId: bridge.projectId
}, 42);
if (!registered.ok || !registered.value.bridge.matched) throw new Error('Pair did not reach MATCHED state');

const wrongTabSend = await send({
  type: 'SEND_TO_CHATGPT',
  prompt: 'must not pass',
  pairId: bridge.pairId,
  projectId: bridge.projectId
}, 99);
if (wrongTabSend.ok || wrongTabSend.error !== 'PAIR_SENDER_MISMATCH') throw new Error('Wrong sender tab was not blocked');

const wrongProjectSend = await send({
  type: 'SEND_TO_CHATGPT',
  prompt: 'must not pass',
  pairId: bridge.pairId,
  projectId: 'other-project'
}, 10);
if (wrongProjectSend.ok || wrongProjectSend.error !== 'PAIR_PROJECT_MISMATCH') throw new Error('Wrong Project ID was not blocked');

const outbound = await send({
  type: 'SEND_TO_CHATGPT',
  prompt: 'Smoke test prompt from AI Passport',
  pairId: bridge.pairId,
  projectId: bridge.projectId,
  sourceUrl: 'https://de.aipass.net/chat'
}, 10);
if (!outbound.ok) throw new Error(outbound.error);
const deliveredToChatgpt = sentMessages.some(row => row.id === 42 && row.message?.type === 'SWAP_RECEIVE_FROM_AIPASS');
if (!deliveredToChatgpt) throw new Error('Outbound payload was not delivered to paired ChatGPT tab');

const returned = await send({
  type: 'SEND_TO_AIPASS',
  text: 'Smoke test result from ChatGPT',
  pairId: bridge.pairId,
  projectId: bridge.projectId,
  sourceUrl: 'https://chatgpt.com/c/test'
}, 42);
if (!returned.ok) throw new Error(returned.error);
const deliveredToAipass = sentMessages.some(row => row.id === 10 && row.message?.type === 'SWAP_RECEIVE_FROM_CHATGPT');
if (!deliveredToAipass) throw new Error('Return payload was not delivered to paired AI Passport tab');

const finalState = await send({ type: 'GET_STATE' });
if (!finalState.ok || !finalState.value.bridge?.matched) throw new Error('Final bridge state is not matched');

console.log(JSON.stringify({
  ok: true,
  projectId: bridge.projectId,
  pairCode: bridge.pairCode,
  aipassTabId: bridge.aipassTabId,
  chatgptTabId: bridge.chatgptTabId,
  matched: finalState.value.bridge.matched,
  wrongPairBlocked: true,
  wrongProjectBlocked: true,
  wrongTabBlocked: true,
  outboundDelivered: deliveredToChatgpt,
  returnDelivered: deliveredToAipass
}, null, 2));
