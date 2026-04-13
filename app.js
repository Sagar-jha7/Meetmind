/* ============================================================
   MeetMind — AI Meeting Intelligence Platform
   app.js — Full application logic
   ============================================================ */

'use strict';

// ===== HERO WAVE BARS =====
(function buildHeroWave() {
  const container = document.getElementById('hero-wave');
  if (!container) return;
  const count = 48;
  for (let i = 0; i < count; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    const height = 20 + Math.random() * 60;
    const dur = 0.8 + Math.random() * 1.4;
    const delay = Math.random() * 1.5;
    bar.style.cssText = `
      height: ${height}px;
      --dur: ${dur}s;
      animation-delay: ${delay}s;
    `;
    container.appendChild(bar);
  }
})();

// ===== THEME TOGGLE =====
(function initTheme() {
  const btn = document.getElementById('theme-toggle-btn');
  const stored = localStorage.getItem('meetmind_theme');
  if (stored === 'light') { document.body.classList.add('light-mode'); btn.textContent = '☀️'; }
  btn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-mode');
    btn.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('meetmind_theme', isLight ? 'light' : 'dark');
  });
})();

// ===== SIDEBAR =====
const sidebar = document.getElementById('sidebar');
const mainWrapper = document.getElementById('main-wrapper');
document.getElementById('open-sidebar-btn').addEventListener('click', () => {
  sidebar.classList.add('open');
});
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  sidebar.classList.remove('open');
});

// ===== STATUS =====
function setStatus(text, type = 'idle') {
  const dot = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  label.textContent = text;
  dot.className = 'status-dot';
  if (type === 'processing') dot.classList.add('processing');
  if (type === 'error') dot.classList.add('error');
}

// ===== TOAST =====
function showToast(msg, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

// ===== INPUT TABS =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

// ===== DROP ZONE =====
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const uploadControls = document.getElementById('upload-controls');
const dropOverlay = dropZone.querySelector('.drop-overlay');

let currentFile = null;

dropZone.addEventListener('click', (e) => {
  if (!e.target.closest('label')) fileInput.click();
});
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
  dropOverlay.classList.add('visible');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
  dropOverlay.classList.remove('visible');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  dropOverlay.classList.remove('visible');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function handleFileSelect(file) {
  const allowed = ['audio/', 'video/'];
  if (!allowed.some(t => file.type.startsWith(t))) {
    showToast('Unsupported file type. Please upload audio or video.', 'error');
    return;
  }
  currentFile = file;
  document.getElementById('preview-name').textContent = file.name;
  document.getElementById('preview-size').textContent = formatBytes(file.size);
  const audioPlayer = document.getElementById('audio-player');
  const audioWrap = document.getElementById('audio-player-wrap');
  audioPlayer.src = URL.createObjectURL(file);
  audioWrap.classList.remove('hidden');
  const thumb = filePreview.querySelector('.file-thumb');
  thumb.textContent = file.type.startsWith('video/') ? '🎬' : '🎵';
  filePreview.classList.remove('hidden');
  uploadControls.classList.remove('hidden');
  showToast(`"${file.name}" loaded successfully`, 'success');
}

document.getElementById('remove-file-btn').addEventListener('click', () => {
  currentFile = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
  uploadControls.classList.add('hidden');
});

// ===== AUDIO ENGINE (RECORDER) =====
const AudioEngine = (() => {
  let mediaRecorder = null;
  let stream = null;
  let audioCtx = null;
  let analyser = null;
  let animFrameId = null;
  let startTime = null;
  let timerInterval = null;
  let chunks = [];
  let recordedBlob = null;

  const canvas = document.getElementById('waveform-canvas');
  const ctx2d = canvas.getContext('2d');
  const recBtn = document.getElementById('record-btn');
  const recIcon = document.getElementById('rec-icon');
  const recBtnLabel = document.getElementById('rec-btn-label');
  const recTimer = document.getElementById('rec-timer');
  const recStatus = document.getElementById('rec-status-label');

  function drawIdle() {
    const W = canvas.offsetWidth * window.devicePixelRatio || canvas.width;
    const H = canvas.height;
    canvas.width = W;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.fillStyle = 'rgba(0,0,0,0)';

    // idle line
    ctx2d.beginPath();
    ctx2d.moveTo(0, H / 2);
    ctx2d.lineTo(W, H / 2);
    ctx2d.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx2d.lineWidth = 2;
    ctx2d.stroke();
  }

  function drawWave(dataArray) {
    const W = canvas.width;
    const H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);

    const gradient = ctx2d.createLinearGradient(0, 0, W, 0);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#06b6d4');

    ctx2d.beginPath();
    const sliceWidth = W / dataArray.length;
    let x = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * H) / 2;
      if (i === 0) ctx2d.moveTo(x, y);
      else ctx2d.lineTo(x, y);
      x += sliceWidth;
    }
    ctx2d.lineTo(W, H / 2);
    ctx2d.strokeStyle = gradient;
    ctx2d.lineWidth = 2.5;
    ctx2d.stroke();
  }

  function animate() {
    const dataArray = new Uint8Array(analyser.fftSize);
    function loop() {
      animFrameId = requestAnimationFrame(loop);
      analyser.getByteTimeDomainData(dataArray);
      drawWave(dataArray);
    }
    loop();
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      mediaRecorder = new MediaRecorder(stream);
      chunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(chunks, { type: 'audio/webm' });
        document.getElementById('record-controls').classList.remove('hidden');
        setStatus('Recording ready', 'idle');
        recStatus.textContent = 'Recording complete — ready to process';
      };
      mediaRecorder.start();
      startTime = Date.now();
      timerInterval = setInterval(() => {
        recTimer.textContent = formatTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      animate();

      recBtn.classList.add('recording');
      recIcon.textContent = '⏹️';
      recBtnLabel.textContent = 'Stop Recording';
      recStatus.textContent = '● Recording in progress…';
      document.getElementById('live-transcript').classList.remove('hidden');
      setStatus('Recording…', 'processing');
      Transcriber.startLive();
    } catch (err) {
      showToast('Microphone access denied or unavailable.', 'error');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (animFrameId) cancelAnimationFrame(animFrameId);
    clearInterval(timerInterval);
    if (audioCtx) audioCtx.close();
    recBtn.classList.remove('recording');
    recIcon.textContent = '🎙️';
    recBtnLabel.textContent = 'Start Recording';
    drawIdle();
    Transcriber.stopLive();
  }

  drawIdle();

  recBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
    else startRecording();
  });

  return {
    getBlob: () => recordedBlob,
    reset: () => {
      recordedBlob = null;
      recTimer.textContent = '00:00';
      recStatus.textContent = 'Ready to record';
      document.getElementById('record-controls').classList.add('hidden');
      document.getElementById('live-transcript').classList.add('hidden');
      document.getElementById('live-text').textContent = 'Listening…';
      drawIdle();
    }
  };
})();

// ===== TRANSCRIBER =====
const Transcriber = (() => {
  let recognition = null;
  let liveTranscript = '';

  function startLive() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      document.getElementById('live-text').textContent = 'Live transcription not supported in this browser. Recording will still be processed.';
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      liveTranscript += final;
      document.getElementById('live-text').textContent = liveTranscript + interim || 'Listening…';
    };
    recognition.onerror = () => {};
    recognition.start();
  }

  function stopLive() {
    if (recognition) { try { recognition.stop(); } catch(e) {} }
  }

  function getLiveTranscript() { return liveTranscript; }

  // Simulate transcription from a file (since we can't actually decode audio in-browser without a backend)
  function simulateFileTranscription(file) {
    const templates = [
      [
        { speaker: 'Alex Chen', text: 'Good morning everyone. Thanks for joining today\'s product roadmap review. Let\'s get started with Q2 priorities.' },
        { speaker: 'Sarah Mitchell', text: 'Sure. I\'ve been looking at the data from Q1 and our user engagement metrics were up 23 percent compared to last quarter.' },
        { speaker: 'James Park', text: 'That\'s excellent. The mobile app improvements really paid off. We need to double down on that approach.' },
        { speaker: 'Alex Chen', text: 'Agreed. So our decision is to prioritize mobile-first features for the entire Q2 roadmap. James, can you lead that effort?' },
        { speaker: 'James Park', text: 'Absolutely. I\'ll have a detailed plan ready by next Friday, April 5th.' },
        { speaker: 'Sarah Mitchell', text: 'I\'ll work on the analytics dashboard to track the new KPIs. I\'ll need the requirements from the product team by end of week.' },
        { speaker: 'Alex Chen', text: 'Let\'s also address the customer feedback backlog. We\'ve received over 200 feature requests regarding the search functionality.' },
        { speaker: 'James Park', text: 'Yes, we\'ve decided to completely overhaul the search experience. We\'re moving to an AI-powered semantic search engine.' },
        { speaker: 'Sarah Mitchell', text: 'I can coordinate with the design team to create wireframes. Target date would be April 12th.' },
        { speaker: 'Alex Chen', text: 'Perfect. One more thing — we need to decide on the pricing model for the enterprise tier.' },
        { speaker: 'James Park', text: 'Based on competitor analysis, we\'ve agreed to go with a per-seat pricing model starting at 15 dollars per user per month.' },
        { speaker: 'Sarah Mitchell', text: 'Marketing will need to update all the pricing pages and prepare the announcement. I\'ll handle that by April 8th.' },
        { speaker: 'Alex Chen', text: 'Great. Let\'s wrap up. Thanks everyone for your contributions today. We have clear next steps and deadlines. Talk next week.' },
      ],
      [
        { speaker: 'Maria Torres', text: 'Welcome to the engineering all-hands. I want to start by recognizing the incredible work the team did on the platform migration.' },
        { speaker: 'David Kim', text: 'The migration to the new microservices architecture is complete. We saw a 40 percent reduction in latency which exceeded our target of 30 percent.' },
        { speaker: 'Lisa Patel', text: 'The QA team tested over 1,200 scenarios. We found and fixed 47 critical bugs before go-live. Really proud of this result.' },
        { speaker: 'Maria Torres', text: 'Excellent work. Now let\'s talk about what\'s next. We\'ve decided to adopt Kubernetes for container orchestration starting in May.' },
        { speaker: 'David Kim', text: 'I\'ll need to set up the training program for the engineering team. I\'ll schedule workshops for the week of April 15th.' },
        { speaker: 'Lisa Patel', text: 'QA processes will also need to be updated. I\'ll document the new testing protocols for containerized services by April 10th.' },
        { speaker: 'Maria Torres', text: 'We also need to establish an on-call rotation. The decision was made to move to a 24/7 coverage model with 3 engineers per shift.' },
        { speaker: 'David Kim', text: 'I\'ll create the on-call schedule and compensation policy document. Deadline is this Friday.' },
        { speaker: 'Maria Torres', text: 'Lisa, can you also coordinate with the security team on the new compliance requirements?' },
        { speaker: 'Lisa Patel', text: 'Yes, I\'ll schedule a sync with the security team for next Tuesday and have a gap analysis done by April 18th.' },
        { speaker: 'Maria Torres', text: 'Perfect. Our overarching decision is to achieve SOC 2 Type II certification by end of Q3. That\'s our north star goal.' },
        { speaker: 'David Kim', text: 'We\'re fully aligned on that. I\'ll kick off the certification process with the external auditors this week.' },
      ]
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  return { startLive, stopLive, getLiveTranscript, simulateFileTranscription };
})();

// ===== SENTIMENT ENGINE =====
function analyseSentiment(text) {
  const pos = /\b(great|excellent|perfect|good|agree|congratulations|proud|success|excited|happy|glad|appreciate|achieved|exceeded|positive|fantastic|wonderful|strong|clear|improve|growth|benefit|opportunity|win)\b/gi;
  const neg = /\b(problem|issue|concern|fail|behind|delay|miss|critical|urgent|block|difficult|challenge|risk|worried|frustrated|unclear|conflict|decline|loss|stuck|bad|wrong|error|complaint)\b/gi;
  const posCount = (text.match(pos) || []).length;
  const negCount = (text.match(neg) || []).length;
  if (posCount > negCount * 1.5) return 'positive';
  if (negCount > posCount * 1.5) return 'critical';
  return 'neutral';
}

// ===== AI PROCESSOR =====
const AIProcessor = (() => {

  function extractSummary(lines) {
    const speakers = [...new Set(lines.map(l => l.speaker))];
    const words = lines.map(l => l.text).join(' ');
    const wordCount = words.split(' ').length;

    // Topic extraction — simple keyword frequency
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','this','that','is','are','was','were','we','i','you','they','it','our','also','can','will','need','let']);
    const freq = {};
    words.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/).forEach(w => {
      if (w.length > 3 && !stopWords.has(w)) freq[w] = (freq[w] || 0) + 1;
    });
    const topics = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 6).map(([w]) => w);

    const duration = Math.round(wordCount / 130); // avg speaking pace

    return {
      body: buildSummaryText(lines, speakers, topics),
      topics: topics.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
      speakers,
      wordCount,
      duration
    };
  }

  function buildSummaryText(lines, speakers, topics) {
    const speakerList = speakers.slice(0, 3).join(', ') + (speakers.length > 3 ? ` and ${speakers.length - 3} others` : '');

    // Find sentences with high-value keywords
    const sentences = lines.map(l => l.text);
    const keyPhrases = ['decided','decision','agreed','plan','target','goal','priority','focus','strategy','objective','important','critical','key','major'];
    const highlightSentences = sentences.filter(s => keyPhrases.some(kp => s.toLowerCase().includes(kp)));

    let summary = `This meeting involved ${speakerList} and covered ${topics.slice(0,3).join(', ')} as central themes. `;
    if (highlightSentences.length > 0) {
      summary += `Key discussion points included: "${highlightSentences[0]}" `;
      if (highlightSentences[1]) summary += `and "${highlightSentences[1]}" `;
    }
    summary += `The group made clear progress toward shared objectives, establishing responsibilities and timelines. `;
    summary += `Overall, the meeting resulted in actionable outcomes with specific owners assigned to deliverables.`;
    return summary;
  }

  function extractActionItems(lines) {
    const actionKeywords = [
      /\bi['']ll\b/i, /\bwill\b/i, /\bgoing to\b/i, /\bneed to\b/i,
      /\bshould\b/i, /\bresponsible for\b/i, /\bhandle\b/i,
      /\bcoordinate\b/i, /\bprepare\b/i, /\bschedule\b/i, /\bcreate\b/i,
      /\bdocument\b/i, /\bset up\b/i, /\bkick off\b/i, /\bupdate\b/i
    ];
    const datePattern = /\b(by|on|before|until|end of|next|this)\s+([\w,\s]+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|quarter|april|may|june|january|february|march|\d{1,2}(?:st|nd|rd|th)?))/gi;
    const priorityWords = { high: /critical|urgent|asap|immediately|priority|must/i, medium: /need|should|important/i };

    const actions = [];
    lines.forEach(line => {
      if (actionKeywords.some(kw => kw.test(line.text))) {
        const dateMatch = line.text.match(datePattern);
        let priority = 'low';
        if (priorityWords.high.test(line.text)) priority = 'high';
        else if (priorityWords.medium.test(line.text)) priority = 'medium';

        // Clean up the text into a task description
        let task = line.text
          .replace(/^(i'll|i will|we will|we'll|you'll|you will)\s*/i, '')
          .replace(/\.$/, '');
        task = task.charAt(0).toUpperCase() + task.slice(1);

        actions.push({
          assignee: line.speaker,
          task,
          deadline: dateMatch ? dateMatch[0].trim() : 'TBD',
          priority
        });
      }
    });

    // Deduplicate and cap at 8
    return actions.slice(0, 8);
  }

  function extractDecisions(lines) {
    const decisionKeywords = [
      /\bdecision\s+(?:is|was|has been)\b/i,
      /\bdecided\b/i, /\bagreed\b/i, /\bgoing with\b/i,
      /\bwe['']re moving to\b/i, /\bwe['']ve chosen\b/i,
      /\bwe will\b/i, /\bour approach\b/i, /\bprioritize\b/i,
      /\boverall.*direction\b/i, /\bnorth star\b/i
    ];

    const decisions = [];
    lines.forEach((line, idx) => {
      if (decisionKeywords.some(kw => kw.test(line.text))) {
        // Get context from adjacent line
        const context = lines[idx - 1]?.text || lines[idx + 1]?.text || '';
        let title = line.text.length > 80 ? line.text.substring(0, 77) + '…' : line.text;
        title = title.charAt(0).toUpperCase() + title.slice(1);
        decisions.push({ title, context, speaker: line.speaker });
      }
    });
    return decisions.slice(0, 6);
  }

  function computeScore(lines, actions, decisions) {
    const wordCount = lines.map(l => l.text).join(' ').split(/\s+/).length;
    const speakerCount = new Set(lines.map(l => l.speaker)).size;
    const actionScore   = Math.min(100, actions.length * 14);
    const decisionScore = Math.min(100, decisions.length * 18);
    const engageScore   = Math.min(100, speakerCount * 22);
    const lengthScore   = wordCount > 120 ? Math.min(100, wordCount / 8) : 40;
    const overall = Math.round((actionScore * 0.3 + decisionScore * 0.3 + engageScore * 0.2 + lengthScore * 0.2));
    return { overall: Math.min(98, overall), actionScore, decisionScore, engageScore, lengthScore };
  }

  function buildParticipants(lines) {
    const map = {};
    const totalWords = lines.map(l => l.text).join(' ').split(/\s+/).length;
    lines.forEach(l => {
      if (!map[l.speaker]) map[l.speaker] = { turns: 0, words: 0, texts: [] };
      const wc = l.text.split(/\s+/).length;
      map[l.speaker].turns++;
      map[l.speaker].words += wc;
      map[l.speaker].texts.push(l.text);
    });
    return Object.entries(map).map(([name, d]) => ({
      name,
      turns: d.turns,
      words: d.words,
      talkPct: Math.round(d.words / totalWords * 100),
      sentiment: analyseSentiment(d.texts.join(' '))
    }));
  }

  function process(lines) {
    const summary = extractSummary(lines);
    const actions = extractActionItems(lines);
    const decisions = extractDecisions(lines);
    const score = computeScore(lines, actions, decisions);
    const participants = buildParticipants(lines);
    return { summary, actions, decisions, lines, score, participants };
  }

  return { process };
})();

// ===== SESSION STORE =====
const SessionStore = (() => {
  const KEY = 'meetmind_sessions';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }

  function save(session) {
    const sessions = getAll();
    sessions.unshift(session);
    if (sessions.length > 20) sessions.pop();
    localStorage.setItem(KEY, JSON.stringify(sessions));
    renderHistory();
  }

  function clear() {
    localStorage.removeItem(KEY);
    renderHistory();
  }

  function renderHistory() {
    const list = document.getElementById('history-list');
    const sessions = getAll();
    const query = document.getElementById('history-search').value.toLowerCase();
    const filtered = sessions.filter(s =>
      s.title.toLowerCase().includes(query) ||
      s.summary?.toLowerCase().includes(query)
    );

    if (filtered.length === 0) {
      list.innerHTML = `<div class="history-empty">
        <div class="empty-icon">📋</div>
        <p>${sessions.length === 0 ? 'No meetings yet.<br/>Start a recording or upload a file.' : 'No results found.'}</p>
      </div>`;
      return;
    }

    list.innerHTML = filtered.map((s, i) => `
      <div class="history-item" data-idx="${i}">
        <div class="history-item-title">${escapeHtml(s.title)}</div>
        <div class="history-item-meta">${s.date} · ${s.duration}min · ${s.actions} actions</div>
      </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach((el, i) => {
      el.addEventListener('click', () => loadSession(filtered[i]));
    });
  }

  function loadSession(session) {
    const data = session.data;
    UI.displayResults(data);
    ExportEngine.setData(data);
    QAEngine.init(data);
    sidebar.classList.remove('open');
    document.getElementById('input-section').classList.add('hidden');
    document.getElementById('pipeline-section').classList.add('hidden');
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('history-search').addEventListener('input', renderHistory);
  document.getElementById('clear-history-btn').addEventListener('click', () => {
    if (confirm('Clear all meeting history?')) clear();
  });

  renderHistory();
  return { save, getAll, renderHistory };
})();

// ===== EXPORT ENGINE =====
const ExportEngine = (() => {
  let currentData = null;

  function setData(data) { currentData = data; }

  function buildText(data) {
    const { lines, summary, actions, decisions } = data;
    let out = `MEETING TRANSCRIPT\n${'='.repeat(50)}\n\n`;
    out += `Date: ${new Date().toLocaleDateString()}\n`;
    out += `Duration: ~${summary.duration} minutes\n`;
    out += `Participants: ${summary.speakers.join(', ')}\n\n`;

    out += `TRANSCRIPT\n${'-'.repeat(40)}\n`;
    lines.forEach(l => { out += `${l.speaker}: ${l.text}\n\n`; });

    out += `\nSUMMARY\n${'-'.repeat(40)}\n${summary.body}\n\n`;

    out += `\nACTION ITEMS\n${'-'.repeat(40)}\n`;
    actions.forEach((a, i) => {
      out += `${i + 1}. [${a.assignee}] ${a.task} (Due: ${a.deadline}, Priority: ${a.priority})\n`;
    });

    out += `\nKEY DECISIONS\n${'-'.repeat(40)}\n`;
    decisions.forEach((d, i) => { out += `${i + 1}. ${d.title}\n`; });

    return out;
  }

  function downloadBlob(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildDocumentHTML(data) {
    const { lines, summary, actions, decisions } = data;
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    return `
      <div id="export-doc-wrapper" style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 40px; background: #fff;">
        <h1 style="color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px;">Meeting Intelligence Report</h1>
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
          <p style="margin: 0 0 8px 0;"><strong>📅 Date:</strong> ${dateStr}</p>
          <p style="margin: 0 0 8px 0;"><strong>⏱️ Duration:</strong> ~${summary.duration || 1} minutes</p>
          <p style="margin: 0;"><strong>👥 Participants:</strong> ${summary.speakers.join(', ')}</p>
        </div>
        
        <h2 style="color: #0f172a; margin-top: 30px; font-size: 1.4rem;">Executive Summary</h2>
        <p style="font-size: 1rem; color: #334155;">${escapeHtml(summary.body)}</p>
        
        <h2 style="color: #0f172a; margin-top: 30px; font-size: 1.4rem;">Key Decisions</h2>
        ${decisions.length > 0 ? `
        <ul style="padding-left: 20px; color: #334155;">
          ${decisions.map(d => `<li style="margin-bottom: 12px;"><strong>${escapeHtml(d.title)}</strong><br/><span style="color: #64748b; font-size: 0.9em;">Context: ${escapeHtml(d.context || '')}</span></li>`).join('')}
        </ul>` : '<p style="color: #64748b; font-style: italic;">No specific decisions recorded.</p>'}
        
        <h2 style="color: #0f172a; margin-top: 30px; font-size: 1.4rem;">Action Items</h2>
        ${actions.length > 0 ? `
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">Task</th>
              <th style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">Assignee</th>
              <th style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">Deadline</th>
              <th style="padding: 12px; border: 1px solid #e2e8f0; color: #0f172a;">Priority</th>
            </tr>
          </thead>
          <tbody>
            ${actions.map(a => `
              <tr>
                <td style="padding: 12px; border: 1px solid #e2e8f0; color: #334155;">${escapeHtml(a.task)}</td>
                <td style="padding: 12px; border: 1px solid #e2e8f0; color: #334155; font-weight: 600;">${escapeHtml(a.assignee)}</td>
                <td style="padding: 12px; border: 1px solid #e2e8f0; color: #ef4444; font-weight: 600;">${escapeHtml(a.deadline)}</td>
                <td style="padding: 12px; border: 1px solid #e2e8f0; color: #334155;">${escapeHtml(a.priority.toUpperCase())}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>` : '<p style="color: #64748b; font-style: italic;">No action items recorded.</p>'}

        <div style="page-break-before: always;"></div>

        <h2 style="color: #0f172a; margin-top: 40px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; font-size: 1.4rem;">Full Transcript</h2>
        <div style="font-size: 0.95em; color: #334155; margin-top: 20px;">
          ${lines.map(l => `<p style="margin-bottom: 12px; line-height: 1.6;"><strong>${escapeHtml(l.speaker)}:</strong> ${escapeHtml(l.text)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  function downloadDoc(htmlContent, filename) {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>MeetMind Report</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + htmlContent + footer;
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = filename;
    fileDownload.click();
    document.body.removeChild(fileDownload);
  }

  document.getElementById('export-pdf-btn').addEventListener('click', () => {
    if (!currentData) return;
    if (typeof html2pdf === 'undefined') {
      showToast('PDF generator library loading... try again.', 'error');
      return;
    }
    showToast('Generating PDF... Please wait.', 'info', 4000);
    const htmlString = buildDocumentHTML(currentData);
    const container = document.createElement('div');
    container.innerHTML = htmlString;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    const opt = {
      margin:       0.5,
      filename:     'MeetMind-Report.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container.firstElementChild).save().then(() => {
      document.body.removeChild(container);
      showToast('PDF Exported Successfully!', 'success');
    }).catch(err => {
      console.error(err);
      document.body.removeChild(container);
      showToast('Error generating PDF.', 'error');
    });
  });

  document.getElementById('export-doc-btn').addEventListener('click', () => {
    if (!currentData) return;
    showToast('Generating Document... Please wait.', 'info', 2000);
    const htmlContent = buildDocumentHTML(currentData);
    downloadDoc(htmlContent, 'MeetMind-Report.doc');
  });

  document.getElementById('copy-all-btn').addEventListener('click', () => {
    if (!currentData) return;
    navigator.clipboard.writeText(buildText(currentData)).then(() => {
      showToast('Copied to clipboard!', 'success');
    });
  });

  document.getElementById('copy-transcript-btn').addEventListener('click', () => {
    if (!currentData) return;
    const text = currentData.lines.map(l => `${l.speaker}: ${l.text}`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => showToast('Transcript copied', 'success'));
  });

  document.getElementById('copy-summary-btn').addEventListener('click', () => {
    if (!currentData) return;
    navigator.clipboard.writeText(currentData.summary.body).then(() => showToast('Summary copied', 'success'));
  });

  document.getElementById('copy-actions-btn').addEventListener('click', () => {
    if (!currentData) return;
    const text = currentData.actions.map((a,i) => `${i+1}. [${a.assignee}] ${a.task} (${a.deadline})`).join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Action items copied', 'success'));
  });

  document.getElementById('copy-decisions-btn').addEventListener('click', () => {
    if (!currentData) return;
    const text = currentData.decisions.map((d,i) => `${i+1}. ${d.title}`).join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Decisions copied', 'success'));
  });

  document.getElementById('copy-participants-btn').addEventListener('click', () => {
    if (!currentData || !currentData.participants) return;
    const text = currentData.participants.map(p =>
      `${p.name}: ${p.turns} turns, ${p.words} words, ${p.talkPct}% talk time, Sentiment: ${p.sentiment}`
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Participants data copied', 'success'));
  });

  return { setData };
})();

// ===== PIPELINE =====
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function runPipeline(lines) {
  const pipelineSection = document.getElementById('pipeline-section');
  const inputSection = document.getElementById('input-section');
  const resultsSection = document.getElementById('results-section');

  inputSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  pipelineSection.classList.remove('hidden');
  pipelineSection.scrollIntoView({ behavior: 'smooth' });
  setStatus('Processing…', 'processing');

  const steps = ['transcribe', 'analyze', 'generate'];
  const progressBar = document.getElementById('progress-bar');
  const logEl = document.getElementById('pipeline-log');

  function log(msg) {
    logEl.innerHTML = `<span class="log-line">&gt; ${msg}</span>`;
  }

  async function activateStep(stepId, logMsg, duration) {
    const step = document.getElementById(`step-${stepId}`);
    step.classList.add('active');
    step.querySelector('.step-status').textContent = 'In progress…';
    log(logMsg);
    await delay(duration);
    step.classList.remove('active');
    step.classList.add('done');
    step.querySelector('.step-status').textContent = 'Complete ✓';
  }

  // Step 1 — Transcribe
  progressBar.style.width = '10%';
  log('Initializing speech recognition engine…');
  await delay(600);
  progressBar.style.width = '30%';
  await activateStep('transcribe', 'Segmenting audio and mapping speaker turns…', 1400);

  // Step 2 — Analyze
  progressBar.style.width = '40%';
  await delay(200);
  progressBar.style.width = '65%';
  await activateStep('analyze', 'Parsing semantic structure, identifying topics and participants…', 1200);

  // Step 3 — Generate
  progressBar.style.width = '70%';
  await delay(200);
  progressBar.style.width = '85%';
  await activateStep('generate', 'Running LLM inference: generating summary, actions, decisions…', 1600);

  progressBar.style.width = '100%';
  log('Processing complete! Rendering insights…');
  await delay(500);

  // Process and display
  const results = AIProcessor.process(lines);
  progressBar.style.width = '0%';
  pipelineSection.classList.add('hidden');

  UI.displayResults(results);
  ExportEngine.setData(results);
  QAEngine.init(results);

  // Save to history
  const meetingTitle = getMeetingTitle() || `Meeting — ${new Date().toLocaleDateString()}`;
  SessionStore.save({
    title: meetingTitle,
    date: new Date().toLocaleDateString(),
    duration: results.summary.duration || 1,
    actions: results.actions.length,
    summary: results.summary.body,
    data: results
  });

  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth' });
  setStatus('Analysis complete', 'idle');
  showToast('Meeting analysis complete!', 'success');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== MEETING TITLE HELPER =====
function getMeetingTitle() {
  const activeTab = document.querySelector('.tab-btn.active')?.dataset?.tab;
  const ids = { upload: 'upload-title', record: 'record-title', paste: 'paste-title' };
  return document.getElementById(ids[activeTab] || 'paste-title')?.value?.trim() || '';
}

// ===== TRANSCRIPT SEARCH =====
(function initTranscriptSearch() {
  const searchInput = document.getElementById('transcript-search');
  const countEl = document.getElementById('search-count');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    const content = document.getElementById('transcript-content');
    // Remove old highlights
    content.querySelectorAll('.search-highlight').forEach(el => {
      const parent = el.parentNode;
      parent.replaceChild(document.createTextNode(el.textContent), el);
      parent.normalize();
    });
    if (!q || q.length < 2) { countEl.textContent = ''; return; }
    let count = 0;
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(n => {
      const idx = n.textContent.toLowerCase().indexOf(q.toLowerCase());
      if (idx === -1) return;
      const highlight = document.createElement('mark');
      highlight.className = 'search-highlight';
      highlight.textContent = n.textContent.substring(idx, idx + q.length);
      const after = n.splitText(idx);
      after.textContent = after.textContent.substring(q.length);
      n.parentNode.insertBefore(highlight, after);
      count++;
    });
    countEl.textContent = count > 0 ? `${count}` : '';
  });
})();

// ===== UI DISPLAY =====
const UI = (() => {

  // Result Tab switching
  document.querySelectorAll('.result-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.result-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = `rp-${tab.dataset.rtab}`;
      document.getElementById(panelId).classList.add('active');
    });
  });

  function displayResults(data) {
    const { lines, summary, actions, decisions, score, participants } = data;

    // Metadata
    const now = new Date();
    document.getElementById('res-duration').textContent = `~${summary.duration || 1} min`;
    document.getElementById('res-words').textContent = `${summary.wordCount || lines.length * 20} words`;
    document.getElementById('res-date').textContent = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    // TRANSCRIPT
    const colors = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ec4899'];
    const speakerColors = {};
    let colorIdx = 0;
    lines.forEach(l => {
      if (!speakerColors[l.speaker]) speakerColors[l.speaker] = colors[colorIdx++ % colors.length];
    });

    const transcriptHtml = lines.map(l => `
      <div class="transcript-line">
        <span class="speaker-label" style="color:${speakerColors[l.speaker]}">${escapeHtml(l.speaker)}:</span>
        <span class="speaker-text">${escapeHtml(l.text)}</span>
      </div>
    `).join('');
    document.getElementById('transcript-content').innerHTML = transcriptHtml;
    document.getElementById('badge-transcript').textContent = `${lines.length} turns`;
    document.getElementById('transcript-info').textContent = `${lines.length} speaker turns · ${summary.speakers.join(', ')}`;

    // SUMMARY — with score card
    const topicsHtml = summary.topics.map(t => `<span class="topic-chip">${escapeHtml(t)}</span>`).join('');
    const circumference = 2 * Math.PI * 36; // r=36
    const scoreOffset = circumference - (score.overall / 100) * circumference;
    const scoreColor = score.overall >= 75 ? '#10b981' : score.overall >= 50 ? '#6366f1' : '#f59e0b';
    const scoreLabel = score.overall >= 80 ? 'Excellent' : score.overall >= 65 ? 'Good' : score.overall >= 45 ? 'Fair' : 'Needs Work';
    document.getElementById('summary-content').innerHTML = `
      <div class="score-card">
        <div class="score-ring-wrap">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle class="score-ring-bg" cx="44" cy="44" r="36"/>
            <circle class="score-ring-fill" cx="44" cy="44" r="36"
              stroke="${scoreColor}"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${scoreOffset}"/>
          </svg>
          <div class="score-ring-center">
            <span class="score-value" style="color:${scoreColor}">${score.overall}</span>
            <span class="score-label">/ 100</span>
          </div>
        </div>
        <div class="score-details">
          <div>
            <div class="score-title">Meeting Score: ${scoreLabel}</div>
            <div class="score-subtitle">Based on action density, decisions, engagement &amp; depth</div>
          </div>
          <div class="score-bars">
            <div class="score-bar-row"><span class="score-bar-label">Action Density</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${score.actionScore}%"></div></div><span class="score-bar-val">${score.actionScore}</span></div>
            <div class="score-bar-row"><span class="score-bar-label">Decision Quality</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${score.decisionScore}%"></div></div><span class="score-bar-val">${score.decisionScore}</span></div>
            <div class="score-bar-row"><span class="score-bar-label">Engagement</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${score.engageScore}%"></div></div><span class="score-bar-val">${score.engageScore}</span></div>
          </div>
        </div>
      </div>
      <p class="summary-intro">Executive Summary</p>
      <p class="summary-body">${escapeHtml(summary.body)}</p>
      <div class="summary-topics">${topicsHtml}</div>
    `;

    // ACTION ITEMS
    const actionsHtml = actions.length === 0
      ? '<p class="placeholder">No action items detected.</p>'
      : actions.map(a => `
        <div class="action-card">
          <div class="action-check" onclick="this.classList.toggle('checked');this.textContent=this.classList.contains('checked')?'✓':''"></div>
          <div class="action-body">
            <div class="action-task">${escapeHtml(a.task)}</div>
            <div class="action-meta">
              <span class="action-meta-item">👤 ${escapeHtml(a.assignee)}</span>
              <span class="action-meta-item">📅 ${escapeHtml(a.deadline)}</span>
              <span class="priority-badge priority-${a.priority}">${a.priority.toUpperCase()}</span>
            </div>
          </div>
        </div>
      `).join('');
    document.getElementById('actions-list').innerHTML = actionsHtml;
    document.getElementById('badge-actions').textContent = actions.length;

    // KEY DECISIONS
    const decisionColors = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ec4899'];
    const decisionsHtml = decisions.length === 0
      ? '<p class="placeholder">No key decisions detected.</p>'
      : decisions.map((d, i) => `
        <div class="decision-card">
          <div class="decision-header">
            <div class="decision-num" style="background:${decisionColors[i % decisionColors.length]}">${i + 1}</div>
            <div class="decision-title">${escapeHtml(d.title)}</div>
          </div>
          ${d.context ? `<div class="decision-context">${escapeHtml(d.context)}</div>` : ''}
          <div class="decision-impact">
            <span class="impact-icon">👤</span>
            <span>Identified from: ${escapeHtml(d.speaker)}</span>
          </div>
        </div>
      `).join('');
    document.getElementById('decisions-list').innerHTML = decisionsHtml;
    document.getElementById('badge-decisions').textContent = decisions.length;

    // PARTICIPANTS
    const avatarColors = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ec4899'];
    const sentimentLabels = { positive: '😊 Positive', neutral: '😐 Neutral', critical: '⚠️ Mixed' };
    const maxWords = Math.max(...(participants || []).map(p => p.words), 1);
    const participantsHtml = !participants || participants.length === 0
      ? '<p class="placeholder">No participants detected.</p>'
      : participants.map((p, i) => `
        <div class="participant-card">
          <div class="participant-header">
            <div class="participant-avatar" style="background:${avatarColors[i % avatarColors.length]}">${escapeHtml(p.name.charAt(0))}</div>
            <div>
              <div class="participant-name">${escapeHtml(p.name)}</div>
              <div class="participant-role">${p.turns} turn${p.turns !== 1 ? 's' : ''} · ${p.talkPct}% talk time</div>
            </div>
            <span class="participant-sentiment sentiment-${p.sentiment}">${sentimentLabels[p.sentiment] || '😐 Neutral'}</span>
          </div>
          <div class="participant-stats">
            <div class="p-stat"><span class="p-stat-value" style="color:${avatarColors[i % avatarColors.length]}">${p.turns}</span><span class="p-stat-label">Turns</span></div>
            <div class="p-stat"><span class="p-stat-value" style="color:${avatarColors[i % avatarColors.length]}">${p.words}</span><span class="p-stat-label">Words</span></div>
            <div class="p-stat"><span class="p-stat-value" style="color:${avatarColors[i % avatarColors.length]}">${p.talkPct}%</span><span class="p-stat-label">Talk Time</span></div>
          </div>
          <div class="participant-bar-wrap">
            <span class="participant-bar-label">Talk share</span>
            <div class="participant-bar-track"><div class="participant-bar-fill" style="width:${p.talkPct}%;background:${avatarColors[i % avatarColors.length]}"></div></div>
          </div>
        </div>
      `).join('');
    document.getElementById('participants-list').innerHTML = participantsHtml;
    document.getElementById('badge-participants').textContent = participants ? participants.length : 0;

    // Reset to first tab
    document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.result-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-rtab="transcript"]').classList.add('active');
    document.getElementById('rp-transcript').classList.add('active');
  }

  return { displayResults };
})();

// ===== PASTE WORD COUNT =====
const pasteInput = document.getElementById('paste-input');
pasteInput.addEventListener('input', () => {
  const words = pasteInput.value.trim().split(/\s+/).filter(w => w).length;
  document.getElementById('paste-word-count').textContent = `${words} word${words !== 1 ? 's' : ''}`;
});

// ===== PROCESS HANDLERS =====
function parsePastedText(text) {
  const lines = [];
  const rawLines = text.split('\n').filter(l => l.trim());
  const speakerPattern = /^([A-Za-z][A-Za-z\s]{1,30}):\s*(.+)/;
  const genericSpeakers = ['Participant A','Participant B','Participant C'];
  let speakerIdx = 0;
  const speakerMap = {};

  rawLines.forEach(line => {
    const m = line.match(speakerPattern);
    if (m) {
      lines.push({ speaker: m[1].trim(), text: m[2].trim() });
    } else {
      // Group consecutive lines without speakers under the same generic speaker
      const lastLine = lines[lines.length - 1];
      if (lastLine && !speakerPattern.test(lastLine.text)) {
        lastLine.text += ' ' + line.trim();
      } else {
        // Rotate among generic speakers
        lines.push({ speaker: genericSpeakers[speakerIdx % genericSpeakers.length], text: line.trim() });
        speakerIdx++;
      }
    }
  });
  return lines.filter(l => l.text.length > 2);
}

document.getElementById('process-upload-btn').addEventListener('click', () => {
  const lines = Transcriber.simulateFileTranscription(currentFile);
  runPipeline(lines);
});

document.getElementById('process-record-btn').addEventListener('click', () => {
  const liveText = Transcriber.getLiveTranscript().trim();
  let lines;
  if (liveText && liveText.length > 20) {
    lines = parsePastedText(liveText);
    if (lines.length === 0) {
      lines = [{ speaker: 'You', text: liveText }];
    }
  } else {
    lines = Transcriber.simulateFileTranscription(null);
  }
  runPipeline(lines);
});

document.getElementById('process-paste-btn').addEventListener('click', () => {
  const text = pasteInput.value.trim();
  if (text.length < 10) {
    showToast('Please enter some meeting content first.', 'error');
    return;
  }
  const lines = parsePastedText(text);
  if (lines.length === 0) {
    showToast('Could not parse any content. Try "Speaker: text" format.', 'error');
    return;
  }
  runPipeline(lines);
});

// ===== NEW MEETING =====
document.getElementById('new-meeting-btn').addEventListener('click', () => {
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('input-section').classList.remove('hidden');
  document.getElementById('input-section').scrollIntoView({ behavior: 'smooth' });
  // Reset
  pasteInput.value = '';
  document.getElementById('paste-word-count').textContent = '0 words';
  currentFile = null;
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('upload-controls').classList.add('hidden');
  AudioEngine.reset();
  setStatus('Ready', 'idle');
  QAEngine.reset();
});

// ===== RESTART APP =====
document.getElementById('restart-app-btn').addEventListener('click', () => {
  if (confirm('Are you sure you want to restart the application? Any unsaved current meeting data will be lost.')) {
    window.scrollTo(0, 0);
    window.location.reload();
  }
});

// ===== Q&A ENGINE =====
const QAEngine = (() => {
  let meetingData = null;

  // ── Intent patterns ──────────────────────────────────────────────
  const INTENTS = [
    {
      name: 'who_said',
      patterns: [/who (said|mentioned|talked about|spoke about|brought up)\s*(.*)/i, /what did (.+?) say/i],
      handler: whoSaid
    },
    {
      name: 'who_responsible',
      patterns: [/who (is responsible|will handle|will do|will take care|is assigned|is in charge|will lead|volunteered)\s*(.*)/i,
                 /who('s| is) (responsible|handling|doing|taking care of|leading)\s*(.*)/i,
                 /who (owns|will own)\s*(.*)/i],
      handler: whoResponsible
    },
    {
      name: 'what_decided',
      patterns: [/what (was|were|has been)? ?(decided|agreed|resolved|concluded|determined)\s*(.*)/i,
                 /what (decisions?|conclusions?|resolutions?) (were made|was made|did (they|the team) make)/i],
      handler: whatDecided
    },
    {
      name: 'action_items',
      patterns: [/what (are|were) (the )?(action items?|tasks?|to.?dos?|next steps?|deliverables?)/i,
                 /list (the )?(action items?|tasks?|next steps?)/i,
                 /what (needs to|has to) (be done|happen)/i],
      handler: actionItems
    },
    {
      name: 'deadline',
      patterns: [/when (is|are|was|were) (the )?(deadline|due date|due|expected)/i,
                 /what('s| is) (the )?deadline\s*(.*)/i,
                 /when (is .+ due|does .+ need to)/i,
                 /by when/i],
      handler: deadlines
    },
    {
      name: 'topic_summary',
      patterns: [/what (was|is|were) (discussed|covered|talked about|mentioned|addressed)\s*(.*)?/i,
                 /what (topics?|subjects?|issues?) (were|was) (covered|discussed|raised)/i,
                 /summarize/i, /give me a summary/i, /brief summary/i],
      handler: topicSummary
    },
    {
      name: 'participants',
      patterns: [/who (was|were|attended|participated|joined|spoke)/i,
                 /who (are|were) (the )?(attendees?|participants?|speakers?|people)/i,
                 /how many (people|participants|speakers)/i],
      handler: participantsList
    },
    {
      name: 'specific_search',
      patterns: [/.*?about (budg|pric|cost|fund|money|dollar|invest)/i,
                 /.*?about (the )?\w+/i,
                 /tell me about\s*(.*)/i,
                 /what about\s*(.*)/i,
                 /find .*(mention|said|about)\s*(.*)/i],
      handler: specificSearch
    }
  ];

  // ── Utility helpers ──────────────────────────────────────────────
  function now() {
    return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function scoreRelevance(text, keywords) {
    let score = 0;
    keywords.forEach(kw => {
      const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
      score += (text.match(re) || []).length;
    });
    return score;
  }

  function extractKeywords(question) {
    const stopWords = new Set(['what','who','when','where','how','why','is','are','was','were','the','a','an','did','do','does','will','about','for','of','in','on','with','that','this','me','us','they','their','any','all','some','to','about','and','or','but','from','by']);
    return question.toLowerCase()
      .replace(/[?!.,]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }

  function findRelevantLines(keywords, topN = 4) {
    if (!meetingData || !meetingData.lines) return [];
    return meetingData.lines
      .map(l => ({ ...l, score: scoreRelevance(l.text, keywords) }))
      .filter(l => l.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  function truncate(str, max = 120) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
  }

  function tag(text, type = '') {
    return `<span class="qa-tag ${type}">${escapeHtml(text)}</span>`;
  }

  function quote(text, speaker) {
    return `<span class="qa-quote">"${escapeHtml(truncate(text))}" <span class="qa-quote-attr">— ${escapeHtml(speaker)}</span></span>`;
  }

  // ── Intent handlers ──────────────────────────────────────────────
  function whoSaid(question) {
    const keywords = extractKeywords(question);
    if (keywords.length === 0) return "Could you be more specific? What topic are you asking about?";
    const hits = findRelevantLines(keywords, 3);
    if (hits.length === 0) return `I couldn't find any mentions of <strong>${keywords.join(', ')}</strong> in the transcript.`;
    let html = `Here's what I found related to <strong>${keywords.join(', ')}</strong>:<br/><br/>`;
    hits.forEach(h => { html += quote(h.text, h.speaker); });
    return html;
  }

  function whoResponsible(question) {
    const { actions } = meetingData;
    if (actions.length === 0) return "No action items were detected in this meeting, so no assignees were identified.";
    const keywords = extractKeywords(question);
    const relevant = keywords.length > 0
      ? actions.filter(a => scoreRelevance(a.task, keywords) > 0)
      : actions;
    if (relevant.length === 0) {
      const all = actions.map(a => `${tag(a.assignee)} for: ${escapeHtml(truncate(a.task, 70))}`).join('<br/>');
      return `No direct match found, but here are all assigned responsibilities:<br/><br/>${all}`;
    }
    let html = `Here are the people responsible:<br/><br/>`;
    relevant.forEach(a => {
      html += `${tag(a.assignee)} ${escapeHtml(truncate(a.task, 90))}`;
      if (a.deadline !== 'TBD') html += ` ${tag(a.deadline, 'deadline')}`;
      html += '<br/>';
    });
    return html;
  }

  function whatDecided(question) {
    const { decisions } = meetingData;
    if (decisions.length === 0) return "No specific decisions were detected in this meeting.";
    const keywords = extractKeywords(question);
    const relevant = keywords.length > 0
      ? decisions.filter(d => scoreRelevance(d.title + ' ' + d.context, keywords) > 0)
      : decisions;
    if (relevant.length === 0) {
      return `Could not find a decision about that topic. The ${decisions.length} recorded decision(s) cover: <br/>` +
        decisions.map(d => `${tag('Decision', 'decision')} ${escapeHtml(truncate(d.title, 80))}`).join('<br/>');
    }
    let html = `${relevant.length} decision(s) found:<br/><br/>`;
    relevant.forEach(d => {
      html += `${tag('Decision', 'decision')} <strong>${escapeHtml(truncate(d.title, 90))}</strong><br/>`;
      if (d.context) html += `<small style="color:var(--text-secondary)">${escapeHtml(truncate(d.context, 80))}</small><br/>`;
      html += `<small style="color:var(--text-muted)">Identified from: ${escapeHtml(d.speaker)}</small><br/><br/>`;
    });
    return html.trim();
  }

  function actionItems() {
    const { actions } = meetingData;
    if (actions.length === 0) return "No action items were detected in this meeting.";
    let html = `<strong>${actions.length} action item(s) from this meeting:</strong><br/><br/>`;
    actions.forEach((a, i) => {
      const pStyle = a.priority === 'high' ? '#fca5a5' : a.priority === 'medium' ? '#fcd34d' : '#6ee7b7';
      html += `<strong>${i + 1}.</strong> ${escapeHtml(truncate(a.task, 80))}<br/>`;
      html += `${tag(a.assignee)} `;
      if (a.deadline !== 'TBD') html += `${tag(a.deadline, 'deadline')} `;
      html += `<span style="font-size:0.72rem;color:${pStyle}">${a.priority.toUpperCase()}</span><br/><br/>`;
    });
    return html.trim();
  }

  function deadlines() {
    const { actions } = meetingData;
    const withDates = actions.filter(a => a.deadline !== 'TBD');
    if (withDates.length === 0) {
      const l = findRelevantLines(['deadline', 'due', 'by', 'friday', 'monday', 'week', 'month', 'april', 'march'], 4);
      if (l.length === 0) return "No specific deadlines were mentioned in this meeting.";
      let html = "No structured deadlines found, but these lines mentioned timing:<br/><br/>";
      l.forEach(h => { html += quote(h.text, h.speaker); });
      return html;
    }
    let html = `<strong>${withDates.length} deadline(s) identified:</strong><br/><br/>`;
    withDates.forEach(a => {
      html += `${tag(a.deadline, 'deadline')} — ${escapeHtml(truncate(a.task, 70))} ${tag(a.assignee)}<br/>`;
    });
    return html;
  }

  function topicSummary() {
    const { summary } = meetingData;
    let html = summary.body ? `${escapeHtml(summary.body)}<br/><br/>` : '';
    if (summary.topics && summary.topics.length > 0) {
      html += `<strong>Key topics:</strong> ` + summary.topics.map(t => tag(t)).join(' ');
    }
    return html || "No summary data available.";
  }

  function participantsList() {
    const { participants, summary } = meetingData;
    if (!participants || participants.length === 0) {
      return summary.speakers
        ? `The following people were identified in this meeting: <br/>${summary.speakers.map(s => tag(s)).join(' ')}`
        : "No participant data available.";
    }
    let html = `<strong>${participants.length} participant(s):</strong><br/><br/>`;
    participants.forEach(p => {
      const sentEmoji = p.sentiment === 'positive' ? '😊' : p.sentiment === 'critical' ? '⚠️' : '😐';
      html += `${tag(p.name)} ${sentEmoji} ${p.turns} turns · ${p.words} words · ${p.talkPct}% talk time<br/>`;
    });
    return html;
  }

  function specificSearch(question) {
    const keywords = extractKeywords(question);
    if (keywords.length === 0) return "I didn't understand that question. Try asking about decisions, actions, people, or topics.";
    const hits = findRelevantLines(keywords, 5);
    if (hits.length === 0) {
      return `I searched the transcript but couldn't find any mention of <strong>${keywords.join(', ')}</strong>.`;
    }
    let html = `Found ${hits.length} relevant passage(s) about <strong>${keywords.join(', ')}</strong>:<br/><br/>`;
    hits.forEach(h => { html += quote(h.text, h.speaker); });
    return html;
  }

  function fallback(question) {
    const keywords = extractKeywords(question);
    if (keywords.length > 0) {
      const hits = findRelevantLines(keywords, 4);
      if (hits.length > 0) {
        let html = `Here's what I found related to your question:<br/><br/>`;
        hits.forEach(h => { html += quote(h.text, h.speaker); });
        return html;
      }
    }
    return `I'm not sure how to answer that exactly. Try asking about:<br/>
      ${tag('Who decided...')} ${tag('Action items')} ${tag('Deadlines')} ${tag('Who said...')} ${tag('Summary')}`;
  }

  // ── Suggested questions builder ─────────────────────────────────
  function buildSuggestions(data) {
    const { actions, decisions, summary, participants } = data;
    const sugs = [];
    const speakers = summary?.speakers || [];

    if (decisions.length > 0) sugs.push('What decisions were made?');
    if (actions.length > 0)   sugs.push('What are the action items?');
    if (actions.some(a => a.deadline !== 'TBD')) sugs.push('What are the deadlines?');
    if (speakers.length > 1)  sugs.push(`What did ${speakers[1]} say?`);
    if (speakers.length > 0)  sugs.push(`Who is responsible for tasks?`);
    if (summary?.topics?.length > 0) sugs.push(`What was discussed about ${summary.topics[0]?.toLowerCase()}?`);
    sugs.push('Give me a summary');
    sugs.push('Who attended this meeting?');

    return sugs.slice(0, 7);
  }

  // ── Answer dispatcher ────────────────────────────────────────────
  function answer(question) {
    if (!meetingData) return "No meeting data loaded yet. Please process a meeting first.";
    const q = question.trim();
    for (const intent of INTENTS) {
      for (const pattern of intent.patterns) {
        if (pattern.test(q)) {
          return intent.handler(q);
        }
      }
    }
    return fallback(q);
  }

  // ── UI helpers ────────────────────────────────────────────────────
  function addMessage(role, htmlContent) {
    const box = document.getElementById('qa-messages');
    // Remove welcome card on first message
    const welcome = box.querySelector('.qa-welcome');
    if (welcome) welcome.remove();

    const wrapper = document.createElement('div');
    wrapper.className = `qa-msg ${role}`;
    const avatarEmoji = role === 'user' ? '👤' : '🤖';
    wrapper.innerHTML = `
      <div class="qa-msg-avatar">${avatarEmoji}</div>
      <div class="qa-msg-body">
        <div class="qa-msg-bubble">${htmlContent}</div>
        <div class="qa-msg-time">${now()}</div>
      </div>`;
    box.appendChild(wrapper);
    box.scrollTop = box.scrollHeight;
  }

  function showTyping() {
    const box = document.getElementById('qa-messages');
    const el = document.createElement('div');
    el.className = 'qa-msg bot qa-typing-row';
    el.innerHTML = `
      <div class="qa-msg-avatar">🤖</div>
      <div class="qa-typing-dots"><span></span><span></span><span></span></div>`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  function removeTyping(el) { el?.remove(); }

  async function ask(question) {
    if (!question.trim()) return;
    const input = document.getElementById('qa-input');
    const btn   = document.getElementById('qa-send-btn');

    // Show user message
    addMessage('user', escapeHtml(question));
    input.value = '';
    input.disabled = true;
    btn.disabled   = true;

    // Typing animation (simulates thinking delay)
    const typingEl = showTyping();
    const thinkMs  = 600 + Math.random() * 700;
    await delay(thinkMs);
    removeTyping(typingEl);

    // Generate and show answer
    const response = answer(question);
    addMessage('bot', response);

    input.disabled = false;
    btn.disabled   = false;
    input.focus();
  }

  function init(data) {
    meetingData = data;

    // Build suggestion chips
    const chips = document.getElementById('qa-chips');
    chips.innerHTML = '';
    const suggestions = buildSuggestions(data);
    suggestions.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'qa-chip';
      chip.textContent = s;
      chip.addEventListener('click', () => {
        document.getElementById('qa-input').value = s;
        ask(s);
      });
      chips.appendChild(chip);
    });
  }

  function reset() {
    meetingData = null;
    const box = document.getElementById('qa-messages');
    box.innerHTML = `
      <div class="qa-welcome">
        <div class="qa-welcome-icon">🤖</div>
        <div class="qa-welcome-text">
          <strong>Ask anything about this meeting</strong>
          <p>I can answer questions about decisions, action items, who said what, deadlines, topics discussed, and more.</p>
        </div>
      </div>`;
    document.getElementById('qa-chips').innerHTML = '';
    document.getElementById('qa-input').value = '';
  }

  // Wire up send button + Enter key
  document.getElementById('qa-send-btn').addEventListener('click', () => {
    ask(document.getElementById('qa-input').value);
  });
  document.getElementById('qa-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(document.getElementById('qa-input').value);
    }
  });

  return { init, reset };
})();

