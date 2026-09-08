const $ = id => document.getElementById(id);
const send = message => chrome.runtime.sendMessage(message);
let state = null;

function show(text, bad = false) {
  $('message').textContent = text;
  $('statusDot').style.color = bad ? '#ff6f86' : '#65e19d';
}

function render() {
  const settings = state.settings;
  const select = $('project');
  const previous = select.value;
  select.textContent = '';
  for (const p of settings.projects) {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    option.selected = p.id === (previous || state.bridge?.projectId || settings.selectedProjectId);
    select.appendChild(option);
  }

  const current = settings.projects.find(p => p.id === select.value) || settings.projects[0];
  $('projectName').value = current?.name || '';
  $('projectPath').value = current?.path || '';
  $('prompt').value = state.draft?.prompt || '';
  $('meta').textContent = state.draft
    ? `${state.draft.status} · ${new Date(state.draft.capturedAt).toLocaleString()}`
    : 'ส่งข้อความจากปุ่ม SWAP บนหน้า AI Passport';

  const bridge = state.bridge && state.bridge.projectId === current?.id ? state.bridge : null;
  $('pairCode').textContent = bridge?.pairCode || 'NO PAIR';
  $('pairState').textContent = bridge?.matched ? 'MATCHED' : bridge ? 'WAITING' : 'ยังไม่เชื่อม';
  $('pairMeta').textContent = bridge
    ? `Project: ${current?.name || bridge.projectId} · AI tab ${bridge.aipassReady ? 'READY' : 'OFF'} · ChatGPT tab ${bridge.chatgptReady ? 'READY' : 'OFF'}`
    : 'ต้องเปิด AI Passport แล้วเชื่อม ChatGPT';
  $('connectChatGPT').textContent = bridge ? 'เปิด ChatGPT คู่เดิม' : 'เชื่อม ChatGPT';
  $('statusDot').style.color = bridge?.matched ? '#65e19d' : bridge ? '#ffb45a' : '#829fb4';
}

async function load() {
  const response = await send({ type: 'GET_STATE' });
  if (!response?.ok) throw new Error(response?.error || 'STATE_ERROR');
  state = response.value;
  render();
}

$('project').onchange = async () => {
  const response = await send({ type: 'SELECT_PROJECT', id: $('project').value });
  if (!response?.ok) return show(response?.error || 'PROJECT_ERROR', true);
  state = response.value;
  render();
  show('เลือก Project แล้ว');
};

$('saveProject').onclick = async () => {
  const current = state.settings.projects.find(p => p.id === $('project').value);
  const response = await send({
    type: 'UPSERT_PROJECT',
    project: { id: current?.id, name: $('projectName').value, path: $('projectPath').value }
  });
  if (!response?.ok) return show(response?.error || 'SAVE_ERROR', true);
  state = response.value;
  render();
  show('บันทึก Project แล้ว');
};

$('deleteProject').onclick = async () => {
  const response = await send({ type: 'REMOVE_PROJECT', id: $('project').value });
  if (!response?.ok) return show(response?.error || 'DELETE_ERROR', true);
  state = response.value;
  render();
  show('ลบ Project แล้ว');
};

$('connectChatGPT').onclick = async () => {
  $('connectChatGPT').disabled = true;
  show('กำลังเปิด/จับคู่ ChatGPT…');
  try {
    const response = await send({ type: 'CONNECT_CHATGPT', projectId: $('project').value });
    if (!response?.ok) throw new Error(response?.error || 'PAIR_ERROR');
    await load();
    show(`${response.value.bridge.pairCode} · รอทั้งสองแท็บ MATCH`);
  } catch (error) {
    show(String(error?.message || error), true);
  } finally {
    $('connectChatGPT').disabled = false;
  }
};

$('resetPair').onclick = async () => {
  const response = await send({ type: 'RESET_PAIR' });
  if (!response?.ok) return show(response?.error || 'RESET_ERROR', true);
  state = response.value;
  render();
  show('ยกเลิก Pair แล้ว');
};

load().catch(error => show(String(error?.message || error), true));
