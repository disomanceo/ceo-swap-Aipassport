(() => {
  if (document.getElementById('ceo-swap-chatgpt-host')) return;

  const send = message => chrome.runtime.sendMessage(message);
  const visible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 20 && r.height > 12 && s.display !== 'none' && s.visibility !== 'hidden';
  };
  const textOf = el => String(
    ('value' in el && typeof el.value === 'string') ? el.value : (el.innerText || el.textContent || '')
  ).trim();

  function composer() {
    const selectors = [
      '#prompt-textarea',
      'div[contenteditable="true"][data-placeholder]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea'
    ];
    return selectors.flatMap(sel => [...document.querySelectorAll(sel)]).find(visible) || null;
  }

  function setComposerText(text) {
    const el = composer();
    if (!el) throw new Error('COMPOSER_NOT_FOUND');
    el.focus();
    if ('value' in el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
      setter ? setter.call(el, text) : (el.value = text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    return el;
  }

  function captureReturnCandidate() {
    const selected = String(window.getSelection?.().toString() || '').trim();
    if (selected.length >= 8) return { text: selected, method: 'selection' };

    const assistants = [...document.querySelectorAll('[data-message-author-role="assistant"]')]
      .filter(visible)
      .map(el => textOf(el))
      .filter(text => text.length >= 8);
    if (assistants.length) return { text: assistants[assistants.length - 1], method: 'assistant-message' };

    const articles = [...document.querySelectorAll('article,.markdown,[data-testid*="message"]')]
      .filter(visible)
      .map(el => textOf(el))
      .filter(text => text.length >= 8);
    if (articles.length) return { text: articles[articles.length - 1], method: 'message' };

    return { text: '', method: 'none' };
  }

  const host = document.createElement('div');
  host.id = 'ceo-swap-chatgpt-host';
  host.style.cssText = 'position:fixed;right:16px;bottom:88px;z-index:2147483646;font-family:system-ui,"Noto Sans Thai",sans-serif';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box}.bar{width:350px;background:#0d1a25;color:#eef7ff;border:1px solid #34516a;border-radius:12px;padding:10px 11px;box-shadow:0 12px 34px #0008;font:11px/1.35 system-ui,"Noto Sans Thai",sans-serif}.head{display:flex;gap:7px;align-items:center}.brand{font-weight:900;color:#ffad50}.status{margin-left:auto;color:#8fb1c9}.project{margin-top:4px;color:#b9cfdf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pair{margin-top:5px;display:flex;gap:7px;align-items:center}.paircode{font-weight:900;color:#ffb45a}.matched{color:#75e3aa}.hint{margin-top:5px;color:#8ea9bd}.actions{display:flex;justify-content:flex-end;gap:6px;margin-top:8px;flex-wrap:wrap}.btn{height:29px;border:1px solid #3b566c;border-radius:7px;background:#152b3c;color:#eef7ff;padding:0 9px;cursor:pointer}.btn:disabled{opacity:.42;cursor:not-allowed}.primary{background:#f19a38;border-color:#ffba63;color:#271606;font-weight:900}.good{background:#15392b;border-color:#3d8f68;color:#a9f4cd}.hidden{display:none!important}
  </style>
  <div id="bar" class="bar hidden">
    <div class="head"><span class="brand">CEO SWAP</span><span id="status" class="status">กำลังตรวจ Pair</span></div>
    <div id="project" class="project"></div>
    <div class="pair"><span id="paircode" class="paircode">NO PAIR</span><span id="pairstate">ยังไม่เชื่อม</span></div>
    <div class="hint">Project ID + Pair ID + Tab ID ต้องตรงกันก่อนส่งทั้งสองทาง</div>
    <div class="actions"><button id="dismiss" class="btn">ซ่อน</button><button id="fill" class="btn" disabled>กรอกอีกครั้ง</button><button id="return" class="btn good" disabled>ส่งกลับ AI Passport</button></div>
  </div>`;
  document.documentElement.appendChild(host);

  const $ = id => root.getElementById(id);
  let state = null;
  let lastInbound = null;

  function render() {
    const bridge = state?.bridge;
    const matched = bridge?.matched === true;
    $('bar').classList.toggle('hidden', !bridge);
    $('paircode').textContent = bridge?.pairCode || 'NO PAIR';
    $('pairstate').textContent = matched ? 'MATCHED' : bridge ? 'WAITING' : 'ยังไม่เชื่อม';
    $('pairstate').classList.toggle('matched', matched);
    $('project').textContent = state?.project ? `${state.project.name} — ${state.project.path}` : '';
    $('return').disabled = !matched;
    $('fill').disabled = !matched || !lastInbound?.ceoPrompt;
    if (matched && !$('status').textContent.includes('กรอก')) $('status').textContent = 'พร้อมรับ/ส่ง';
  }

  async function loadState() {
    const response = await send({ type: 'GET_STATE' });
    if (!response?.ok) throw new Error(response?.error || 'STATE_ERROR');
    state = response.value;
    render();
    return state;
  }

  async function registerSelf() {
    const current = await loadState();
    if (!current.bridge) return;
    const response = await send({
      type: 'REGISTER_SIDE',
      side: 'chatgpt',
      pairId: current.bridge.pairId,
      projectId: current.bridge.projectId
    });
    if (!response?.ok) throw new Error(response?.error || 'PAIR_REGISTER_ERROR');
    await loadState();
    $('status').textContent = state.bridge?.matched ? 'Pair matched' : 'รอ AI Passport';
    render();
  }

  async function injectInbound(payload, force = false) {
    await loadState();
    if (!state.bridge?.matched) throw new Error('PAIR_NOT_MATCHED');
    if (payload.bridge?.pairId !== state.bridge.pairId || payload.bridge?.projectId !== state.bridge.projectId) {
      throw new Error('PAIR_INBOUND_MISMATCH');
    }
    lastInbound = payload;
    $('bar').classList.remove('hidden');
    $('status').textContent = 'กำลังกรอก…';
    const key = `ceo-swap-${payload.bridge.pairId}-${payload.draft.id}`;
    if (!force && sessionStorage.getItem(key)) {
      $('status').textContent = 'กรอกแล้ว';
      render();
      return;
    }
    let el = composer();
    for (let i = 0; !el && i < 40; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 250));
      el = composer();
    }
    if (!el) throw new Error('ไม่พบช่องพิมพ์ ChatGPT');
    setComposerText(payload.ceoPrompt);
    sessionStorage.setItem(key, '1');
    await send({ type: 'MARK_INJECTED' });
    $('status').textContent = 'กรอกแล้ว · ตรวจและกด Send เอง';
    render();
  }

  async function sendBack() {
    await loadState();
    if (!state.bridge?.matched) throw new Error('PAIR_NOT_MATCHED');
    const candidate = captureReturnCandidate();
    if (!candidate.text) throw new Error('ไม่พบข้อความที่จะส่งกลับ');
    $('return').disabled = true;
    $('status').textContent = 'กำลังส่งกลับ AI Passport…';
    try {
      const response = await send({
        type: 'SEND_TO_AIPASS',
        text: candidate.text,
        pairId: state.bridge.pairId,
        projectId: state.bridge.projectId,
        sourceUrl: location.href,
        sourceTitle: document.title
      });
      if (!response?.ok) throw new Error(response?.error || 'RETURN_ERROR');
      $('status').textContent = `ส่งกลับ ${response.value.bridge.pairCode} แล้ว`;
    } finally {
      render();
    }
  }

  $('fill').onclick = () => {
    if (!lastInbound) return;
    injectInbound(lastInbound, true).catch(error => { $('status').textContent = String(error?.message || error); });
  };
  $('return').onclick = () => {
    sendBack().catch(error => { $('status').textContent = String(error?.message || error); render(); });
  };
  $('dismiss').onclick = () => $('bar').classList.add('hidden');

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PAIR_CONNECT') {
      registerSelf().then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.type === 'PAIR_STATE_CHANGED') {
      loadState().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message?.type === 'SWAP_RECEIVE_FROM_AIPASS') {
      injectInbound(message, false).then(() => sendResponse({ ok: true })).catch(error => {
        $('bar').classList.remove('hidden');
        $('status').textContent = String(error?.message || error);
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
      return true;
    }
    return false;
  });

  void registerSelf().catch(() => {});
})();
