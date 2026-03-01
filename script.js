// ============================================================
//  TrMinh Security Camera — AI Detection + Telegram Bot API
//  URL: ?token=BOT_TOKEN&to=CHAT_ID&cooldown=30
// ============================================================

// -------- URL PARAMS --------
const urlParams = new URLSearchParams(window.location.search);
const TG_TOKEN = urlParams.get('token') || '8507504703:AAFWMyZLYF-AQNBMjAbJGiXtrySeceNKEuM';
const TG_CHAT_ID = urlParams.get('to') || 'TG_CHAT_ID';
const COOLDOWN_SEC = parseInt(urlParams.get('cooldown') || '30', 10);
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;

// -------- ELEMENTS --------
const videoEl = document.getElementById('cameras');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const personCountEl = document.getElementById('personCount');
const gestureTextEl = document.getElementById('gestureText');
const fpsEl = document.getElementById('fpsDisplay');
const timeEl = document.getElementById('timeDisplay');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const alertBanner = document.getElementById('alertBanner');
const alertMessage = document.getElementById('alertMessage');
const cameraFrame = document.getElementById('cameraFrame');
const personCard = document.getElementById('personCard');
const gestureCard = document.getElementById('gestureCard');

// Telegram UI
const tgStatus = document.getElementById('tgStatus');
const displayToken = document.getElementById('displayToken');
const displayUser = document.getElementById('displayUser');
const displayCooldown = document.getElementById('displayCooldown');
const sentCountEl = document.getElementById('sentCount');
const tgLog = document.getElementById('tgLog');

// -------- STATE --------
let cocoModel = null;
let handModel = null;
let lastTime = 0;
let alertTimeout = null;
let prevPersonCount = 0;
let lastSent = 0;
let sentCount = 0;
let isTgReady = false;

// -------- LOADING SCREEN --------
const loadingScreen = document.createElement('div');
loadingScreen.className = 'loading-screen';
loadingScreen.innerHTML = `
    <div class="loading-label">ĐANG TẢI MÔ HÌNH AI...</div>
    <div class="loading-bar"><div class="loading-fill"></div></div>
    <div class="loading-step" id="loadStep">Khởi tạo...</div>
`;
document.body.appendChild(loadingScreen);

// -------- INIT TELEGRAM UI --------
function initTgUI() {
    if (TG_TOKEN && TG_CHAT_ID) {
        const masked = TG_TOKEN.length > 12
            ? TG_TOKEN.slice(0, 8) + '••••••' + TG_TOKEN.slice(-4)
            : '••••••••';
        displayToken.textContent = masked;
        displayUser.textContent = TG_CHAT_ID;
        displayCooldown.textContent = `${COOLDOWN_SEC}s`;

        tgStatus.textContent = 'ĐÃ CẤU HÌNH';
        tgStatus.classList.add('active');
        isTgReady = true;
        addLog('Telegram Bot đã sẵn sàng ✓', 'success');
    } else {
        displayToken.textContent = '— thêm ?token=BOT_TOKEN vào URL';
        displayUser.textContent = '— thêm &to=CHAT_ID vào URL';
        tgStatus.textContent = 'CHƯA CẤU HÌNH';
        addLog('Thiếu token hoặc chat_id trong URL', 'error');
    }
}

// -------- LOG --------
function addLog(msg, type = '') {
    const now = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.innerHTML = `<span class="ts">${now}</span><span class="msg">» ${msg}</span>`;
    const dim = tgLog.querySelector('.dim');
    if (dim) dim.remove();
    tgLog.appendChild(line);
    tgLog.scrollTop = tgLog.scrollHeight;
}

// -------- SEND TELEGRAM MESSAGE --------
async function sendTelegramAlert(personCount, gesture) {
    if (!isTgReady) return;

    const now = Date.now();
    if (now - lastSent < COOLDOWN_SEC * 1000) {
        const remaining = Math.ceil((COOLDOWN_SEC * 1000 - (now - lastSent)) / 1000);
        addLog(`Cooldown: còn ${remaining}s`);
        return;
    }

    const time = new Date().toLocaleString('vi-VN');
    const gestureInfo = gesture !== '—' ? `\n✋ Cử chỉ: ${gesture}` : '';
    const text =
        `🚨 *CẢNH BÁO AN NINH*\n` +
        `📷 TrMinh Camera\n` +
        `👤 Phát hiện *${personCount} người*\n` +
        `🕐 ${time}` +
        gestureInfo;

    addLog(`Đang gửi cảnh báo (${personCount} người)...`);

    try {
        const res = await fetch(TG_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TG_CHAT_ID,
                text: text,
                parse_mode: 'Markdown'
            })
        });

        const data = await res.json();

        if (data.ok) {
            sentCount++;
            lastSent = Date.now();
            sentCountEl.textContent = `${sentCount} tin`;
            addLog(`✔ Gửi thành công (id: ${data.result?.message_id})`, 'success');
        } else {
            addLog(`✖ Lỗi ${data.error_code}: ${data.description}`, 'error');
            tgStatus.textContent = 'LỖI API';
            tgStatus.className = 'tg-badge error';
        }
    } catch (err) {
        addLog(`✖ Lỗi mạng: ${err.message}`, 'error');
        tgStatus.textContent = 'LỖI MẠNG';
        tgStatus.className = 'tg-badge error';
    }
}

// -------- CLOCK --------
setInterval(() => {
    timeEl.textContent = new Date().toLocaleTimeString('vi-VN', { hour12: false });
}, 1000);

// -------- CAMERA --------
async function showContextError() {
    const screen = document.querySelector('.loading-screen');
    if (!screen) return;
    screen.innerHTML = `
        <div style="max-width:520px;text-align:center;padding:0 20px">
            <div style="font-size:40px;margin-bottom:16px">🔒</div>
            <div class="loading-label" style="color:#ff3355;font-size:14px;margin-bottom:20px">
                TRÌNH DUYỆT CHẶN TRUY CẬP CAMERA
            </div>
            <div style="color:rgba(255,100,100,0.7);font-size:11px;letter-spacing:1px;line-height:1.9;margin-bottom:24px">
                Camera chỉ hoạt động trên <b style="color:#ff8">HTTPS</b> hoặc <b style="color:#ff8">localhost</b>.<br>
                Bạn đang mở file trực tiếp <code style="color:#ff8">file://</code> nên bị chặn.
            </div>
            <div style="background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.2);border-radius:6px;padding:16px;text-align:left">
                <div style="color:rgba(0,255,136,0.6);font-size:9px;letter-spacing:2px;margin-bottom:10px">▸ CÁCH CHẠY ĐÚNG</div>
                <div style="color:#00ff88;font-size:11px;line-height:2.2">
                    <b>1. VS Code:</b> Cài <span style="color:#ff8">Live Server</span> → Chuột phải file → <span style="color:#ff8">Open with Live Server</span><br>
                    <b>2. Python:</b> <code style="color:#ff8">python -m http.server 8080</code> → mở <span style="color:#ff8">localhost:8080</span><br>
                    <b>3. Node.js:</b> <code style="color:#ff8">npx serve .</code><br>
                    <b>4. XAMPP:</b> Bỏ vào <span style="color:#ff8">htdocs</span> → mở <span style="color:#ff8">localhost/tên-thư-mục</span>
                </div>
            </div>
        </div>
    `;
}

async function startCamera() {
    const isSecure = location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';

    if (!isSecure || !navigator.mediaDevices) {
        showContextError();
        throw new Error('Cần chạy trên HTTPS hoặc localhost');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
    });
    videoEl.srcObject = stream;
    await new Promise(r => videoEl.onloadedmetadata = r);
    videoEl.play();
}

function resizeCanvas() {
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
}

// -------- GESTURE --------
function detectGesture(lm) {
    const tips = [4, 8, 12, 16, 20];
    const mids = [3, 6, 10, 14, 18];
    const up = tips.map((tip, i) =>
        i === 0 ? lm[tip][0] > lm[mids[i]][0] : lm[tip][1] < lm[mids[i]][1]
    );
    const [thumb, index, middle, ring, pinky] = up;
    const ext = up.slice(1).filter(Boolean).length;

    if (!up.some(Boolean)) return '✊ NẮM TAY';
    if (thumb && !index && !middle && !ring && !pinky) return '👍 TỐT';
    if (!thumb && index && !middle && !ring && !pinky) return '☝️ 1 NGÓN';
    if (!thumb && index && middle && !ring && !pinky) return '✌️ VICTORY';
    if (thumb && index && !middle && !ring && pinky) return '🤙 GỌI TÔI';
    if (up.slice(1).every(Boolean)) return '🖐️ XIN CHÀO';
    return `✋ ${ext} NGÓN`;
}

// -------- DRAW --------
function drawPerson(p) {
    const [x, y, w, h] = p.bbox;
    const conf = Math.round(p.score * 100);

    ctx.strokeStyle = '#ff3355';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ff3355';
    ctx.shadowBlur = 14;
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,51,85,0.05)';
    ctx.fillRect(x, y, w, h);

    const cs = 18;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([cx, cy, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx + dx * cs, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * cs);
        ctx.stroke();
    });

    const label = `NGƯỜI  ${conf}%`;
    ctx.font = 'bold 12px "Share Tech Mono"';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = '#ff3355';
    ctx.fillRect(x, y - 22, tw + 12, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 6, y - 7);
}

function drawHand(lm) {
    const conn = [
        [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]
    ];
    ctx.strokeStyle = 'rgba(0,255,136,0.7)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 6;
    conn.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(lm[a][0], lm[a][1]);
        ctx.lineTo(lm[b][0], lm[b][1]);
        ctx.stroke();
    });
    lm.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x, y, i === 0 ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#fff' : '#00ff88';
        ctx.fill();
    });
    ctx.shadowBlur = 0;
}

// -------- MAIN LOOP --------
async function detectLoop(ts) {
    if (!videoEl.videoWidth) { requestAnimationFrame(detectLoop); return; }

    fpsEl.textContent = Math.round(1000 / (ts - lastTime));
    lastTime = ts;

    if (canvas.width !== videoEl.videoWidth) resizeCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let personCount = 0;
    if (cocoModel) {
        try {
            const preds = await cocoModel.detect(videoEl);
            const persons = preds.filter(p => p.class === 'person');
            personCount = persons.length;
            persons.forEach(drawPerson);
            preds.filter(p => p.class !== 'person' && p.score > 0.65).forEach(p => {
                const [x, y, w, h] = p.bbox;
                ctx.strokeStyle = '#00d4aa'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
                ctx.font = '11px "Share Tech Mono"';
                const tw = ctx.measureText(p.class).width;
                ctx.fillStyle = '#00d4aa'; ctx.fillRect(x, y - 16, tw + 10, 14);
                ctx.fillStyle = '#000'; ctx.fillText(p.class, x + 5, y - 4);
            });
        } catch (e) { }
    }

    let gesture = '—';
    if (handModel) {
        try {
            const hands = await handModel.estimateHands(videoEl);
            if (hands.length > 0) {
                drawHand(hands[0].landmarks);
                gesture = detectGesture(hands[0].landmarks);
            }
        } catch (e) { }
    }

    personCountEl.textContent = personCount;
    gestureTextEl.textContent = gesture !== '—' ? gesture : '—';
    personCard.classList.toggle('active', personCount > 0);
    gestureCard.classList.toggle('active', gesture !== '—');
    cameraFrame.classList.toggle('detecting', personCount > 0);

    if (personCount > prevPersonCount) {
        showAlert(`⚠ PHÁT HIỆN ${personCount} NGƯỜI TRONG KHUNG HÌNH`);
        statusDot.classList.replace('pulse', 'alert');
        sendTelegramAlert(personCount, gesture);
    } else if (personCount === 0 && prevPersonCount > 0) {
        statusDot.classList.replace('alert', 'pulse');
    }
    prevPersonCount = personCount;

    requestAnimationFrame(detectLoop);
}

// -------- ALERT --------
function showAlert(msg) {
    alertMessage.textContent = msg;
    alertBanner.classList.add('show');
    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => alertBanner.classList.remove('show'), 4000);
}

// -------- STATUS --------
function setStatus(msg) {
    statusText.textContent = msg;
    const el = document.getElementById('loadStep');
    if (el) el.textContent = msg;
}

// -------- INIT --------
async function init() {
    initTgUI();
    setStatus('Khởi động camera...');
    try {
        await startCamera();
        setStatus('Đang tải COCO-SSD...');
        cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        setStatus('Đang tải HandPose...');
        handModel = await handpose.load();
        setStatus('🟢 HỆ THỐNG HOẠT ĐỘNG');
        loadingScreen.classList.add('hidden');
        setTimeout(() => loadingScreen.remove(), 600);
        resizeCanvas();
        requestAnimationFrame(detectLoop);
    } catch (err) {
        console.error(err);
        const lbl = loadingScreen.querySelector('.loading-label');
        if (lbl) { lbl.textContent = '❌ ' + err.message; lbl.style.color = '#ff3355'; }
    }
}

init();