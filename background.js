const DEFAULT_PROJECT = {
  id: 'ceo-swap-aipassport',
  name: 'ceo-swap-Aipassport',
  path: 'D:\\AI-Workspace\\ceo-swap-Aipassport'
};

const CHATGPT_URL = 'https://chatgpt.com/';
const CHATGPT_RE = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i;
const AIPASS_RE = /^https:\/\/(www\.)?aipass\.go\.th\//i;

async function getStored() {
  return chrome.storage.local.get(['settings', 'draft', 'returnDraft', 'bridge', 'lastInjected']);
}

async function getState() {
  const stored = await getStored();
  const current = stored.settings || {};
  const projects = Array.isArray(current.projects) && current.projects.length
    ? current.projects
    : [DEFAULT_PROJECT];
  const selectedProjectId = projects.some(p => p.id === current.selectedProjectId)
    ? current.selectedProjectId
    : projects[0].id;
  const settings = {
    projects,
    selectedProjectId,
    requireManualSend: true,
    autoFillChatGPT: current.autoFillChatGPT !== false
  };
  await chrome.storage.local.set({ settings });
  return {
    settings,
    draft: stored.draft || null,
    returnDraft: stored.returnDraft || null,
    bridge: stored.bridge || null,
    lastInjected: stored.lastInjected || null
  };
}

function projectFor(state, id = '') {
  return state.settings.projects.find(p => p.id === id)
    || state.settings.projects.find(p => p.id === state.settings.selectedProjectId)
    || state.settings.projects[0];
}

function pairCode(pairId = '') {
  return pairId ? `SWP-${String(pairId).replace(/-/g, '').slice(0, 8).toUpperCase()}` : '';
}

function bridgeMatched(bridge) {
  return Boolean(
    bridge
    && bridge.projectId
    && bridge.pairId
    && Number.isInteger(bridge.aipassTabId)
    && Number.isInteger(bridge.chatgptTabId)
    && bridge.aipassReady === true
    && bridge.chatgptReady === true
    && bridge.status === 'matched'
  );
}

function safeBridge(bridge) {
  if (!bridge) return null;
  return {
    ...bridge,
    pairCode: pairCode(bridge.pairId),
    matched: bridgeMatched(bridge)
  };
}

function ceoPrompt(draft, project, bridge) {
  return `@Ceo3

Project: ${project.name}
Project ID: ${project.id}
Workspace: ${project.path}
SWAP Pair: ${pairCode(bridge?.pairId)}
Source: TH-AI Passport (${draft.sourceUrl || 'https://aipass.go.th/'})

ข้อความนี้มาจาก CEO SWAP คู่ที่แมตช์ Project ID + Pair ID + Tab ID แล้ว กรุณาทำงานในบริบทโปรเจ็คนี้ ตรวจไฟล์และสถานะ Git ก่อนแก้ไข รักษางานเดิม และอย่า commit/push จนกว่าจะได้รับคำสั่ง

[SWAP PROMPT]
${draft.prompt}
[/SWAP PROMPT]

ดำเนินการตาม prompt ให้ครบ ทดสอบสิ่งที่แก้ และรายงานไฟล์ที่เปลี่ยน ผลการทดสอบ และสิ่งที่ยังเหลืออยู่`;
}

async function stateView() {
  const state = await getState();
  const project = projectFor(state, state.bridge?.projectId || state.draft?.projectId);
  return {
    ...state,
    bridge: safeBridge(state.bridge),
    project,
    ceoPrompt: state.draft && state.bridge ? ceoPrompt(state.draft, project, state.bridge) : ''
  };
}

async function notifyPair(bridge) {
  if (!bridge) return;
  const payload = { type: 'PAIR_STATE_CHANGED', bridge: safeBridge(bridge) };
  for (const tabId of [bridge.aipassTabId, bridge.chatgptTabId]) {
    if (!Number.isInteger(tabId)) continue;
    try { await chrome.tabs.sendMessage(tabId, payload); } catch {}
  }
}

function senderTabId(sender) {
  return Number.isInteger(sender?.tab?.id) ? sender.tab.id : null;
}

async function selectProject(id) {
  const state = await getState();
  if (!state.settings.projects.some(p => p.id === id)) throw new Error('PROJECT_NOT_FOUND');
  const settings = { ...state.settings, selectedProjectId: id };
  const draft = state.draft ? { ...state.draft, projectId: id } : null;
  const bridgeChanged = state.bridge && state.bridge.projectId !== id;
  await chrome.storage.local.set({
    settings,
    ...(draft ? { draft } : {}),
    ...(bridgeChanged ? { bridge: null, returnDraft: null } : {})
  });
  if (bridgeChanged) await notifyPair({ ...state.bridge, status: 'disconnected', aipassReady: false, chatgptReady: false });
  return stateView();
}

async function upsertProject(project) {
  const state = await getState();
  const name = String(project?.name || '').trim().slice(0, 80);
  const path = String(project?.path || '').trim().slice(0, 500);
  if (!name || !path) throw new Error('PROJECT_FIELDS_REQUIRED');
  const item = {
    id: String(project?.id || '').trim() || `project-${Date.now()}`,
    name,
    path
  };
  const projects = [...state.settings.projects];
  const index = projects.findIndex(p => p.id === item.id);
  if (index >= 0) projects[index] = item; else projects.push(item);
  const settings = { ...state.settings, projects, selectedProjectId: item.id };
  await chrome.storage.local.set({ settings });
  return stateView();
}

async function removeProject(id) {
  const state = await getState();
  let projects = state.settings.projects.filter(p => p.id !== id);
  if (!projects.length) projects = [DEFAULT_PROJECT];
  const settings = { ...state.settings, projects, selectedProjectId: projects[0].id };
  const draft = state.draft ? { ...state.draft, projectId: projects[0].id } : null;
  const clearBridge = state.bridge?.projectId === id;
  await chrome.storage.local.set({
    settings,
    ...(draft ? { draft } : {}),
    ...(clearBridge ? { bridge: null, returnDraft: null } : {})
  });
  return stateView();
}

async function capture(message) {
  const state = await getState();
  const prompt = String(message.prompt || '').trim();
  if (!prompt) throw new Error('PROMPT_EMPTY');
  const project = projectFor(state, String(message.projectId || ''));
  const draft = {
    id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: prompt.slice(0, 100000),
    sourceUrl: String(message.sourceUrl || '').slice(0, 2000),
    sourceTitle: String(message.sourceTitle || '').slice(0, 300),
    capturedAt: new Date().toISOString(),
    projectId: project.id,
    status: 'captured'
  };
  await chrome.storage.local.set({ draft });
  return { draft, project };
}

async function findAipassTab(preferredId = null) {
  const tabs = await chrome.tabs.query({});
  if (Number.isInteger(preferredId)) {
    const exact = tabs.find(tab => tab.id === preferredId && AIPASS_RE.test(String(tab.url || '')));
    if (exact) return exact;
  }
  return tabs.find(tab => AIPASS_RE.test(String(tab.url || ''))) || null;
}

async function findPairedChatgptTab(bridge) {
  const tabs = await chrome.tabs.query({});
  if (Number.isInteger(bridge?.chatgptTabId)) {
    const exact = tabs.find(tab => tab.id === bridge.chatgptTabId && CHATGPT_RE.test(String(tab.url || '')));
    if (exact) return exact;
  }
  return null;
}

async function connectChatgpt(message, sender) {
  const state = await getState();
  const project = projectFor(state, String(message.projectId || ''));
  const aipassTab = await findAipassTab(senderTabId(sender));
  if (!aipassTab) throw new Error('AIPASS_TAB_NOT_FOUND');
  const initiatedFromAipass = senderTabId(sender) === aipassTab.id && AIPASS_RE.test(String(sender?.tab?.url || ''));

  let bridge = state.bridge;
  const reusable = bridge
    && bridge.projectId === project.id
    && bridge.aipassTabId === aipassTab.id;

  if (!reusable) {
    bridge = {
      pairId: crypto.randomUUID(),
      projectId: project.id,
      aipassTabId: aipassTab.id,
      chatgptTabId: null,
      aipassReady: initiatedFromAipass,
      chatgptReady: false,
      status: 'waiting-chatgpt',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  let chatgptTab = await findPairedChatgptTab(bridge);
  if (chatgptTab) {
    chatgptTab = await chrome.tabs.update(chatgptTab.id, { active: true });
  } else {
    chatgptTab = await chrome.tabs.create({ url: CHATGPT_URL, active: true });
  }

  bridge = {
    ...bridge,
    projectId: project.id,
    aipassTabId: aipassTab.id,
    chatgptTabId: chatgptTab.id,
    aipassReady: initiatedFromAipass ? true : (reusable && bridge.aipassTabId === aipassTab.id ? bridge.aipassReady === true : false),
    chatgptReady: reusable && bridge.chatgptTabId === chatgptTab.id ? bridge.chatgptReady === true : false,
    status: 'waiting-peer',
    updatedAt: new Date().toISOString()
  };
  bridge.status = bridge.aipassReady && bridge.chatgptReady ? 'matched' : 'waiting-peer';
  await chrome.storage.local.set({
    bridge,
    settings: { ...state.settings, selectedProjectId: project.id }
  });
  await notifyPair(bridge);
  if (!bridge.aipassReady) {
    setTimeout(() => chrome.tabs.sendMessage(aipassTab.id, { type: 'PAIR_CONNECT_AIPASS', bridge: safeBridge(bridge) }).catch(() => {}), 100);
  }
  setTimeout(() => chrome.tabs.sendMessage(chatgptTab.id, { type: 'PAIR_CONNECT', bridge: safeBridge(bridge) }).catch(() => {}), 800);
  return { bridge: safeBridge(bridge), project, tabId: chatgptTab.id };
}

async function registerSide(message, sender) {
  const state = await getState();
  if (!state.bridge) return { bridge: null };
  const tabId = senderTabId(sender);
  const side = String(message.side || '');
  const bridge = { ...state.bridge };
  if (String(message.pairId || '') !== bridge.pairId) throw new Error('PAIR_ID_MISMATCH');
  if (String(message.projectId || '') !== bridge.projectId) throw new Error('PAIR_PROJECT_MISMATCH');

  if (side === 'aipass') {
    if (tabId !== bridge.aipassTabId) throw new Error('PAIR_AIPASS_TAB_MISMATCH');
    bridge.aipassReady = true;
  } else if (side === 'chatgpt') {
    if (tabId !== bridge.chatgptTabId) throw new Error('PAIR_CHATGPT_TAB_MISMATCH');
    bridge.chatgptReady = true;
  } else {
    throw new Error('PAIR_SIDE_INVALID');
  }

  bridge.status = bridge.aipassReady && bridge.chatgptReady ? 'matched' : 'waiting-peer';
  bridge.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ bridge });
  await notifyPair(bridge);
  return { bridge: safeBridge(bridge), project: projectFor(state, bridge.projectId) };
}

function assertMatchedSender(state, sender, side, message) {
  const bridge = state.bridge;
  if (!bridgeMatched(bridge)) throw new Error('PAIR_NOT_MATCHED');
  const tabId = senderTabId(sender);
  if (side === 'aipass' && tabId !== bridge.aipassTabId) throw new Error('PAIR_SENDER_MISMATCH');
  if (side === 'chatgpt' && tabId !== bridge.chatgptTabId) throw new Error('PAIR_SENDER_MISMATCH');
  if (String(message?.pairId || '') !== bridge.pairId) throw new Error('PAIR_ID_MISMATCH');
  if (String(message?.projectId || '') !== bridge.projectId) throw new Error('PAIR_PROJECT_MISMATCH');
  if (bridge.projectId !== state.settings.selectedProjectId) throw new Error('PAIR_PROJECT_MISMATCH');
  return bridge;
}

async function sendToChatgpt(message, sender) {
  let state = await getState();
  const bridge = assertMatchedSender(state, sender, 'aipass', message);
  const project = projectFor(state, bridge.projectId);
  const prompt = String(message.prompt || state.draft?.prompt || '').trim();
  if (!prompt) throw new Error('PROMPT_EMPTY');

  const draft = {
    ...(state.draft || {}),
    id: state.draft?.id || `swap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt: prompt.slice(0, 100000),
    sourceUrl: String(message.sourceUrl || state.draft?.sourceUrl || '').slice(0, 2000),
    sourceTitle: String(message.sourceTitle || state.draft?.sourceTitle || '').slice(0, 300),
    capturedAt: state.draft?.capturedAt || new Date().toISOString(),
    projectId: project.id,
    pairId: bridge.pairId,
    status: 'sent-to-chatgpt',
    sentAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ draft });
  const payload = {
    type: 'SWAP_RECEIVE_FROM_AIPASS',
    bridge: safeBridge(bridge),
    project,
    draft,
    ceoPrompt: ceoPrompt(draft, project, bridge)
  };
  await chrome.tabs.sendMessage(bridge.chatgptTabId, payload);
  await chrome.tabs.update(bridge.chatgptTabId, { active: true });
  return { bridge: safeBridge(bridge), project, draft };
}

async function sendToAipass(message, sender) {
  const state = await getState();
  const bridge = assertMatchedSender(state, sender, 'chatgpt', message);
  const project = projectFor(state, bridge.projectId);
  const text = String(message.text || '').trim();
  if (!text) throw new Error('RETURN_TEXT_EMPTY');
  const returnDraft = {
    id: `return-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: text.slice(0, 100000),
    projectId: project.id,
    pairId: bridge.pairId,
    sourceUrl: String(message.sourceUrl || '').slice(0, 2000),
    sourceTitle: String(message.sourceTitle || '').slice(0, 300),
    createdAt: new Date().toISOString(),
    status: 'sent-to-aipass'
  };
  await chrome.storage.local.set({ returnDraft });
  await chrome.tabs.sendMessage(bridge.aipassTabId, {
    type: 'SWAP_RECEIVE_FROM_CHATGPT',
    bridge: safeBridge(bridge),
    project,
    returnDraft
  });
  await chrome.tabs.update(bridge.aipassTabId, { active: true });
  return { bridge: safeBridge(bridge), project, returnDraft };
}

async function resetPair() {
  const state = await getState();
  if (state.bridge) {
    await notifyPair({ ...state.bridge, status: 'disconnected', aipassReady: false, chatgptReady: false });
  }
  await chrome.storage.local.remove(['bridge', 'returnDraft']);
  return stateView();
}

chrome.runtime.onInstalled.addListener(() => { void getState(); });

chrome.tabs.onRemoved.addListener(tabId => {
  void (async () => {
    const state = await getState();
    if (!state.bridge) return;
    const bridge = { ...state.bridge };
    let changed = false;
    if (tabId === bridge.aipassTabId) { bridge.aipassReady = false; changed = true; }
    if (tabId === bridge.chatgptTabId) { bridge.chatgptReady = false; changed = true; }
    if (!changed) return;
    bridge.status = 'disconnected';
    bridge.updatedAt = new Date().toISOString();
    await chrome.storage.local.set({ bridge });
    await notifyPair(bridge);
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'GET_STATE': return stateView();
      case 'REGISTER_SIDE': return registerSide(message, sender);
      case 'CAPTURE_PROMPT': return capture(message);
      case 'SELECT_PROJECT': return selectProject(String(message.id || ''));
      case 'UPSERT_PROJECT': return upsertProject(message.project);
      case 'REMOVE_PROJECT': return removeProject(String(message.id || ''));
      case 'CONNECT_CHATGPT': return connectChatgpt(message, sender);
      case 'SEND_TO_CHATGPT': return sendToChatgpt(message, sender);
      case 'SEND_TO_AIPASS': return sendToAipass(message, sender);
      case 'RESET_PAIR': return resetPair();
      case 'CLEAR_DRAFT':
        await chrome.storage.local.remove(['draft', 'returnDraft']);
        return stateView();
      case 'MARK_INJECTED': {
        const state = await getState();
        if (!state.draft) return stateView();
        const at = new Date().toISOString();
        const draft = { ...state.draft, status: 'injected-chatgpt', injectedAt: at };
        await chrome.storage.local.set({ draft, lastInjected: { draftId: draft.id, tabId: senderTabId(sender), at } });
        return stateView();
      }
      default: throw new Error('UNKNOWN_MESSAGE');
    }
  })().then(value => sendResponse({ ok: true, value }))
    .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
