(() => {
  if (document.getElementById('ceo-swap-aipass-host')) return;

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

  function captureCandidate() {
    const selected = String(window.getSelection?.().toString() || '').trim();
    if (selected.length >= 8) return { text: selected, method: 'selection' };

    const active = document.activeElement;
    if (active?.matches?.('textarea,input,[contenteditable="true"]')) {
      const value = textOf(active);
      if (value.length >= 8) return { text: value, method: 'active-editor' };
    }

    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="assistant"]',
      '[data-testid*="message"]',
      'article',
      '.markdown',
      '[class*="message"]'
    ];
    const candidates = selectors
      .flatMap(sel => [...document.querySelectorAll(sel)])
      .filter(visible)
      .map(el => textOf(el))
      .filter(text => text.length >= 40 && text.length <= 100000);
    if (candidates.length) return { text: candidates[candidates.length - 1], method: 'message' };
    return { text: '', method: 'none' };
  }

  function aipassComposer() {
    const selectors = [
      'textarea:not([readonly])',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'input[type="text"]'
    ];
    return selectors.flatMap(sel => [...document.querySelectorAll(sel)]).find(visible) || null;
  }

  function setAipassComposerText(text) {
    const el = aipassComposer();
    if (!el) throw new Error('ไม่พบช่องพิมพ์ AI Passport');
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

  const host = document.createElement('div');
  host.id = 'ceo-swap-aipass-host';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483646;font-family:system-ui,"Noto Sans Thai",sans-serif';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    *{box-sizing:border-box}button,select,textarea{font:inherit}.dock{display:flex;align-items:center;gap:7px}.fab{border:0;border-radius:999px;background:#f19a38;color:#241506;font-weight:900;padding:11px 16px;box-shadow:0 8px 28px #0005;cursor:pointer}.pairpill{border:1px solid #344f64;border-radius:999px;background:#0d1b27;color:#9eb6c8;padding:8px 11px;font-size:10px;box-shadow:0 8px 22px #0004}.pairpill.matched{border-color:#3e8f68;color:#75e3aa}.modal{position:fixed;inset:0;background:#07101ac9;display:grid;place-items:center;padding:22px}.card{width:min(760px,92vw);max-height:86vh;overflow:auto;background:#0d1824;color:#eef7ff;border:1px solid #31475d;border-radius:16px;padding:16px;box-shadow:0 26px 70px #000a}.head{display:flex;align-items:center;gap:10px}.head b{font-size:18px;color:#ffb65f}.muted{color:#91a8bd;font-size:11px}.status{margin-left:auto;font-size:11px;color:#a8bed0}.pairbox{margin-top:10px;padding:9px 10px;border:1px solid #2d455a;border-radius:9px;background:#091521;display:flex;align-items:center;gap:8px}.paircode{font-weight:900;color:#ffb45a}.pairstate{font-size:10px;color:#8faabd}.label{display:block;margin:12px 0 5px;color:#afc4d5;font-size:11px}.prompt{width:100%;min-height:240px;resize:vertical;border:1px solid #334c63;border-radius:10px;padding:11px;background:#07121e;color:#eef7ff;outline:none}.prompt:focus{border-color:#f19a38}.row{display:flex;gap:8px}.row select{flex:1;height:36px;border:1px solid #334c63;border-radius:8px;background:#07121e;color:#eef7ff;padding:0 8px}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:13px;flex-wrap:wrap}.btn{height:36px;border:1px solid #3a5268;border-radius:9px;background:#14283a;color:#edf7ff;padding:0 12px;cursor:pointer}.btn:disabled{opacity:.42;cursor:not-allowed}.primary{background:#f19a38;border-color:#ffb75c;color:#261707;font-weight:900}.good{background:#15392b;border-color:#3d8f68;color:#a9f4cd}.hidden{display:none!important}
  </style>
  <div class="dock"><span id="pairpill" class="pairpill">ยังไม่เชื่อม</span><button id="swap" class="fab" title="เปิด CEO SWAP">SWAP</button></div>
  <div id="modal" class="modal hidden"><div class="card">
    <div class="head"><b>CEO SWAP</b><span class="muted">AI Passport ⇄ ChatGPT</span><span id="status" class="status"></span></div>
    <div class="pairbox"><span id="paircode" class="paircode">NO PAIR</span><span id="pairstate" class="pairstate">ต้องจับคู่กับ ChatGPT ก่อนส่ง</span></div>
    <label class="label">Project</label><div class="row"><select id="project"></select></div>
    <label id="promptlabel" class="label">Prompt ที่จะส่งไป ChatGPT</label><textarea id="prompt" class="prompt" spellcheck="false"></textarea>
    <div class="actions">
      <button id="reset" class="btn">ยกเลิก Pair</button>
      <button id="connect" class="btn good">เชื่อม ChatGPT</button>
      <button id="fillReturn" class="btn hidden">ใส่ใน AI Passport</button>
      <button id="sendChatgpt" class="btn primary" disabled>ส่งไป ChatGPT</button>
      <button id="cancel" class="btn">ปิด</button>
    </div>
  </div></div>`;
  document.documentElement.appendChild(host);

  const $ = id => root.getElementById(id);
  let state = null;
  let mode = 'outbound';

  function bridgeForSelected() {
    if (!state?.bridge) return null;
    const selected = $('project').value || state.settings.selectedProjectId;
    return state.bridge.projectId === selected ? state.bridge : null;
  }

  function renderPair() {
    const bridge = bridgeForSelected();
    const matched = bridge?.matched === true;
    const code = bridge?.pairCode || 'NO PAIR';
    $('paircode').textContent = code;
    $('pairstate').textContent = matched
      ? 'MATCHED · Project + Pair + Tabs ตรงกัน'
      : bridge ? 'WAITING · รออีกฝั่งยืนยัน Pair เดียวกัน' : 'ต้องจับคู่กับ ChatGPT ก่อนส่ง';
    $('pairpill').textContent = matched ? `${code} · MATCHED` : bridge ? `${code} · WAITING` : 'ยังไม่เชื่อม';
    $('pairpill').classList.toggle('matched', matched);
    $('sendChatgpt').disabled = !matched || mode !== 'outbound';
    $('connect').textContent = bridge ? 'เปิด ChatGPT คู่เดิม' : 'เชื่อม ChatGPT';
  }

  async function loadState() {
    const response = await send({ type: 'GET_STATE' });
    if (!response?.ok) throw new Error(response?.error || 'STATE_ERROR');
    state = response.value;
    const select = $('project');
    const previous = select.value;
    select.textContent = '';
    for (const p of state.settings.projects) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = `${p.name} — ${p.path}`;
      option.selected = p.id === (previous || state.bridge?.projectId || state.settings.selectedProjectId);
      select.appendChild(option);
    }
    renderPair();
  }

  async function registerSelf() {
    try {
      if (!state?.bridge) await loadState();
      if (!state?.bridge) return;
      const response = await send({
        type: 'REGISTER_SIDE',
        side: 'aipass',
        pairId: state.bridge.pairId,
        projectId: state.bridge.projectId
      });
      if (response?.ok) await loadState();
    } catch {}
  }

  async function openPreview() {
    mode = 'outbound';
    $('fillReturn').classList.add('hidden');
    $('promptlabel').textContent = 'Prompt ที่จะส่งไป ChatGPT';
    $('status').textContent = 'กำลังอ่าน prompt…';
    const candidate = captureCandidate();
    await loadState();
    if (candidate.text) {
      const saved = await send({
        type: 'CAPTURE_PROMPT',
        prompt: candidate.text,
        projectId: $('project').value,
        sourceUrl: location.href,
        sourceTitle: document.title
      });
      if (!saved?.ok) throw new Error(saved?.error || 'CAPTURE_ERROR');
      $('prompt').value = candidate.text;
      $('status').textContent = `จับจาก ${candidate.method}`;
      await loadState();
    } else {
      $('prompt').value = state?.draft?.prompt || '';
      $('status').textContent = $('prompt').value ? 'ใช้ Draft ล่าสุด' : 'ไม่พบข้อความอัตโนมัติ — วาง prompt ได้เลย';
    }
    renderPair();
    $('modal').classList.remove('hidden');
    setTimeout(() => $('prompt').focus(), 50);
  }

  function showReturn(returnDraft, bridge) {
    mode = 'return';
    if (bridge) state = { ...(state || {}), bridge };
    $('promptlabel').textContent = 'ข้อความที่ส่งกลับมาจาก ChatGPT';
    $('prompt').value = returnDraft?.text || '';
    $('fillReturn').classList.remove('hidden');
    $('sendChatgpt').disabled = true;
    $('status').textContent = 'รับกลับจาก ChatGPT แล้ว · ตรวจข้อความก่อนใช้ต่อ';
    renderPair();
    $('modal').classList.remove('hidden');
  }

  $('swap').onclick = () => openPreview().catch(error => {
    $('status').textContent = String(error?.message || error);
    $('modal').classList.remove('hidden');
  });
  $('cancel').onclick = () => $('modal').classList.add('hidden');
  $('modal').onclick = event => { if (event.target === $('modal')) $('modal').classList.add('hidden'); };
  $('project').onchange = async () => {
    const response = await send({ type: 'SELECT_PROJECT', id: $('project').value });
    if (!response?.ok) { $('status').textContent = response?.error || 'PROJECT_ERROR'; return; }
    state = response.value;
    renderPair();
  };
  $('connect').onclick = async () => {
    $('connect').disabled = true;
    $('status').textContent = 'กำลังสร้าง/ตรวจ Pair…';
    try {
      const response = await send({ type: 'CONNECT_CHATGPT', projectId: $('project').value });
      if (!response?.ok) throw new Error(response?.error || 'PAIR_ERROR');
      state = { ...(state || {}), bridge: response.value.bridge };
      renderPair();
      $('status').textContent = `${response.value.bridge.pairCode} · รอ ChatGPT ยืนยัน`;
    } catch (error) {
      $('status').textContent = String(error?.message || error);
    } finally {
      $('connect').disabled = false;
    }
  };
  $('reset').onclick = async () => {
    const response = await send({ type: 'RESET_PAIR' });
    if (response?.ok) state = response.value;
    mode = 'outbound';
    $('fillReturn').classList.add('hidden');
    renderPair();
    $('status').textContent = 'ยกเลิก Pair แล้ว';
  };
  $('sendChatgpt').onclick = async () => {
    const prompt = $('prompt').value.trim();
    if (!prompt) { $('status').textContent = 'Prompt ว่าง'; return; }
    const bridge = bridgeForSelected();
    if (!bridge?.matched) { $('status').textContent = 'Pair ยังไม่ MATCH'; return; }
    $('sendChatgpt').disabled = true;
    $('status').textContent = 'กำลังส่งไป ChatGPT คู่ที่แมตช์…';
    try {
      const response = await send({
        type: 'SEND_TO_CHATGPT',
        prompt,
        pairId: bridge.pairId,
        projectId: bridge.projectId,
        sourceUrl: location.href,
        sourceTitle: document.title
      });
      if (!response?.ok) throw new Error(response?.error || 'SEND_ERROR');
      $('status').textContent = `ส่งไป ${response.value.bridge.pairCode} แล้ว · ไปตรวจและกด Send ที่ ChatGPT`;
    } catch (error) {
      $('status').textContent = String(error?.message || error);
    } finally {
      renderPair();
    }
  };
  $('fillReturn').onclick = () => {
    try {
      setAipassComposerText($('prompt').value);
      $('status').textContent = 'ใส่ข้อความกลับใน AI Passport แล้ว · ยังไม่ได้กดส่ง';
    } catch (error) {
      $('status').textContent = String(error?.message || error);
    }
  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'PAIR_CONNECT_AIPASS') {
      void loadState().then(registerSelf).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    if (message?.type === 'PAIR_STATE_CHANGED') {
      void loadState().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
    if (message?.type === 'SWAP_RECEIVE_FROM_CHATGPT') {
      void loadState().then(() => {
        if (!message.bridge?.matched || message.bridge.pairId !== state.bridge?.pairId || message.bridge.projectId !== state.bridge?.projectId) {
          throw new Error('PAIR_RETURN_MISMATCH');
        }
        showReturn(message.returnDraft, message.bridge);
        sendResponse({ ok: true });
      }).catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
    return false;
  });

  void loadState().then(registerSelf).catch(() => {});
})();
