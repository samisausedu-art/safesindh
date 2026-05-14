/* ═══════════════════════════════════════
   USER STORAGE (localStorage-based)
═══════════════════════════════════════ */
function getUsers() { return JSON.parse(localStorage.getItem('sg_users') || '{}'); }
function saveUsers(u) { localStorage.setItem('sg_users', JSON.stringify(u)); }
function getPoliceUsers() { return JSON.parse(localStorage.getItem('sg_police_users') || '{}'); }
function savePoliceUsers(u) { localStorage.setItem('sg_police_users', JSON.stringify(u)); }

/* Seed default police accounts */
(function seedDefaults() {
  let pu = getPoliceUsers();
  const defaults = {
    'admin@safeguard.pk':    { pass:'SG-Admin#2025', name:'Super Admin', fname:'Super', lname:'Admin', role:'Super Admin', badge:'SGD-001', rank:'Super Admin', av:'SA' },
    'operator@safeguard.pk': { pass:'Police@123',    name:'Farrukh Naz', fname:'Farrukh', lname:'Naz', role:'Police Operator', badge:'SGD-055', rank:'SI (Sub-Inspector)', av:'FN' },
    'dispatch@safeguard.pk': { pass:'Dispatch#786',  name:'Sara Kamran', fname:'Sara', lname:'Kamran', role:'Dispatch Officer', badge:'SGD-090', rank:'Dispatch Officer', av:'SK' }
  };
  let changed = false;
  for(const [k,v] of Object.entries(defaults)) { if(!pu[k]) { pu[k]=v; changed=true; } }
  if(changed) savePoliceUsers(pu);
})();

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let alerts = JSON.parse(localStorage.getItem('sg_alerts') || '[]');
let logEntries = JSON.parse(localStorage.getItem('sg_logs') || '[]');
let alertCounter = parseInt(localStorage.getItem('sg_counter') || '2040');
let unreadCount = 0;
let currentPoliceUser = null;
let currentCitizenUser = null;
let filterStatus = null;
let logFilterType = 'all';

const DEMO_LOGS = [
  { id:'ALT-2039', date:'14 Mar 2025 08:14', citizen:'Fatima Ali', phone:'+92 311 2223333', location:'Gulshan-e-Iqbal, Karachi', priority:'HIGH', officer:'SI Ahmed Khan', response:'3.2 min', status:'Resolved' },
  { id:'ALT-2038', date:'14 Mar 2025 07:42', citizen:'Muhammad Imran', phone:'+92 333 4445555', location:'PECHS, Karachi', priority:'MEDIUM', officer:'ASI Bilal Raza', response:'5.8 min', status:'Resolved' },
  { id:'ALT-2037', date:'13 Mar 2025 22:11', citizen:'Zainab Siddiqui', phone:'+92 300 9998877', location:'Clifton Block 4, Karachi', priority:'HIGH', officer:'SI Farrukh Naz', response:'4.1 min', status:'Resolved' },
  { id:'ALT-2036', date:'13 Mar 2025 18:30', citizen:'Ali Hassan', phone:'+92 321 7776655', location:'Saddar, Karachi', priority:'LOW', officer:'Cst. Kamran Ali', response:'8.3 min', status:'Resolved' },
  { id:'ALT-2035', date:'13 Mar 2025 14:55', citizen:'Hira Khan', phone:'+92 345 1112233', location:'DHA Phase 5, Karachi', priority:'HIGH', officer:'SI Ahmed Khan', response:'2.9 min', status:'Resolved' },
];
const CITIZEN_NAMES = ['Ahmed Raza','Fatima Malik','Muhammad Ali','Sara Hussain','Bilal Khan','Zara Sheikh','Kamran Mirza','Ayesha Siddiqui','Omar Farooq','Nadia Baig'];
const LOCATIONS = ['Saddar, Karachi','Gulshan-e-Iqbal, Karachi','Clifton, Karachi','DHA Phase 5, Karachi','PECHS, Karachi','SITE Area, Karachi','Korangi, Karachi','Landhi, Karachi','North Nazimabad, Karachi','Orangi Town, Karachi'];
const ALERT_TYPES = ['Emergency SOS','Physical Threat','Road Accident','Medical Emergency','Fire Emergency','Robbery/Theft','Harassment'];
const MAP_POSITIONS = [{top:'30%',left:'40%'},{top:'55%',left:'30%'},{top:'20%',left:'60%'},{top:'70%',left:'55%'},{top:'45%',left:'70%'},{top:'60%',left:'20%'}];

/* ═══════════════════════════════════════
   SHARED UTILS
═══════════════════════════════════════ */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goLanding() {
  closeCitizenAuth();
  showView('view-landing');
}
function enterPoliceLogin() { showView('view-police-login'); }
function savePersist() {
  localStorage.setItem('sg_alerts', JSON.stringify(alerts));
  localStorage.setItem('sg_logs', JSON.stringify(logEntries));
  localStorage.setItem('sg_counter', alertCounter);
}
function toggleEye(id, btn) {
  const inp = document.getElementById(id);
  if(!inp) return;
  inp.type = inp.type==='password' ? 'text' : 'password';
  btn.textContent = inp.type==='password' ? '👁️' : '🙈';
}
function fmtCNIC(el) {
  let v = el.value.replace(/[^0-9]/g,'');
  if(v.length>5 && v.length<=12) v = v.slice(0,5)+'-'+v.slice(5);
  else if(v.length>12) v = v.slice(0,5)+'-'+v.slice(5,12)+'-'+v.slice(12,13);
  el.value = v;
}
function checkStrength(inp, id) {
  const v = inp.value;
  const fill = document.getElementById(id+'-fill');
  const text = document.getElementById(id+'-text');
  if(!fill||!text) return;
  let score = 0;
  if(v.length>=8) score++;
  if(/[A-Z]/.test(v)) score++;
  if(/[0-9]/.test(v)) score++;
  if(/[^A-Za-z0-9]/.test(v)) score++;
  const levels = ['','Weak','Fair','Strong','Very Strong'];
  const colors = ['','#e8192c','#f5c842','#3a80d0','#1fd45a'];
  const widths = ['0%','25%','50%','75%','100%'];
  fill.style.width = widths[score]||'0%';
  fill.style.background = colors[score]||'transparent';
  text.textContent = v ? (levels[score]||'Weak') : 'Enter a password';
  text.style.color = colors[score]||'var(--gray2)';
}
function showAlert(elId, msg) {
  const el = document.getElementById(elId);
  if(!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(()=>{ el.style.display='none'; }, 4000);
}
function cShowMsg(elId, msg) { showAlert(elId, msg); }

/* ═══════════════════════════════════════
   CITIZEN AUTH
═══════════════════════════════════════ */
function openCitizenAuth() {
  document.getElementById('citizen-auth-modal').classList.add('open');
}
function closeCitizenAuth() {
  document.getElementById('citizen-auth-modal').classList.remove('open');
}
function cSwitchAuthTab(t) {
  document.getElementById('c-tab-login').classList.toggle('active', t==='login');
  document.getElementById('c-tab-register').classList.toggle('active', t==='register');
  document.getElementById('c-auth-login').classList.toggle('active', t==='login');
  document.getElementById('c-auth-register').classList.toggle('active', t==='register');
}
function doCitizenLogin() {
  const phone = document.getElementById('c-li-phone').value.trim();
  const pass  = document.getElementById('c-li-pass').value;
  if(!phone || !pass) { showAlert('c-login-err','❌ Please fill in all fields.'); return; }
  const users = getUsers();
  const user = Object.values(users).find(u => u.phone===phone || u.phone===phone.replace(/\s/g,''));
  if(!user) { showAlert('c-login-err','❌ No account found for this phone number. Please register first.'); return; }
  if(user.pass !== pass) { showAlert('c-login-err','❌ Incorrect password. Please try again.'); return; }
  currentCitizenUser = user;
  sessionStorage.setItem('sg_citizen', JSON.stringify(user));
  closeCitizenAuth();
  enterCitizenApp(user);
}
function doCitizenRegister() {
  const fname = document.getElementById('c-reg-fname').value.trim();
  const lname = document.getElementById('c-reg-lname').value.trim();
  const cnic  = document.getElementById('c-reg-cnic').value.trim();
  const phone = document.getElementById('c-reg-phone').value.trim();
  const pass  = document.getElementById('c-reg-pass').value;
  const pass2 = document.getElementById('c-reg-pass2').value;
  if(!fname||!lname||!cnic||!phone||!pass||!pass2) { showAlert('c-reg-err','❌ Please fill in all fields.'); return; }
  if(cnic.replace(/[^0-9]/g,'').length < 13) { showAlert('c-reg-err','❌ CNIC must be 13 digits (XXXXX-XXXXXXX-X).'); return; }
  const phoneClean = phone.replace(/\s/g,'');
  if(!/^\+92[0-9]{10}$/.test(phoneClean) && !/^0[0-9]{10}$/.test(phoneClean)) { showAlert('c-reg-err','❌ Enter a valid Pakistani phone number.'); return; }
  if(pass.length < 8) { showAlert('c-reg-err','❌ Password must be at least 8 characters.'); return; }
  if(pass !== pass2) { showAlert('c-reg-err','❌ Passwords do not match.'); return; }
  const users = getUsers();
  const exists = Object.values(users).find(u => u.phone===phoneClean || u.cnic===cnic);
  if(exists) { showAlert('c-reg-err','❌ An account with this phone or CNIC already exists.'); return; }
  const uid = 'CIT-'+Date.now();
  const user = { uid, fname, lname, name:fname+' '+lname, cnic, phone:phoneClean, pass, role:'citizen', createdAt:new Date().toISOString() };
  users[uid] = user;
  saveUsers(users);
  showAlert('c-reg-ok','✅ Account created! You can now sign in.');
  setTimeout(() => cSwitchAuthTab('login'), 2000);
}
function enterCitizenApp(user) {
  showView('view-citizen');
  document.getElementById('c-bottom-nav').style.display = 'flex';
  const name = user.name || user.fname+' '+user.lname;
  document.getElementById('c-user-display').textContent = name;
  document.getElementById('c-prof-name').textContent = name;
  document.getElementById('c-prof-cnic').textContent = user.cnic || '—';
  document.getElementById('c-prof-phone').textContent = user.phone || '—';
  document.getElementById('c-prof-pic').textContent = ((user.fname||name)[0]+(user.lname||name.split(' ')[1]||'')[0]).toUpperCase();
  cCurrentScreen = 'cs-splash';
  document.querySelectorAll('.cscreen').forEach(s=>{ s.classList.remove('active'); });
  document.getElementById('cs-splash').classList.add('active');
  setTimeout(() => cGoScreen('cs-home'), 2200);
}

/* ═══════════════════════════════════════
   CITIZEN APP LOGIC
═══════════════════════════════════════ */
let cCurrentScreen = 'cs-splash';
let cSosTimer = null, cEtaTimer = null, cAlertCb = null, cToastTimer = null;

function cGoScreen(id) {
  document.getElementById(cCurrentScreen)?.classList.remove('active');
  cCurrentScreen = id;
  document.getElementById(id)?.classList.add('active');
}
function cNavTo(t) {
  ['home','nearby','contacts','profile'].forEach(x => document.getElementById('c-nav-'+x)?.classList.remove('active'));
  document.getElementById('c-nav-'+t)?.classList.add('active');
  const map={home:'cs-home',nearby:'cs-nearby',contacts:'cs-contacts',profile:'cs-profile'};
  cGoScreen(map[t]);
}
function cStartSOS() {
  if(cSosTimer) return;
  let elapsed = 0;
  const btn = document.getElementById('c-sos-btn');
  btn.style.transform = 'scale(.94)';
  cSosTimer = setInterval(() => {
    elapsed += 100;
    if(elapsed >= 3000) { clearInterval(cSosTimer); cSosTimer=null; btn.style.transform=''; cTriggerSOS(); }
  }, 100);
}
function cCancelSOS() {
  if(cSosTimer) { clearInterval(cSosTimer); cSosTimer=null; }
  const btn = document.getElementById('c-sos-btn');
  if(btn) btn.style.transform='';
}
function cTriggerSOS() {
  const id = 'ALT-'+(++alertCounter);
  localStorage.setItem('sg_counter', alertCounter);
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit'});
  const dateStr = now.toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})+' '+timeStr;
  const citizenName = currentCitizenUser ? (currentCitizenUser.name||currentCitizenUser.fname+' '+currentCitizenUser.lname) : 'Anonymous';
  const citizenPhone = currentCitizenUser ? currentCitizenUser.phone : '+92 300 0000000';
  const alertObj = {
    id, citizen:citizenName, phone:citizenPhone,
    location: LOCATIONS[Math.floor(Math.random()*3)],
    type:'Emergency SOS', priority:'HIGH',
    status:'Pending', timestamp:dateStr, new:true, responseStart:Date.now()
  };
  alerts.unshift(alertObj);
  logEntries.unshift({ id, date:dateStr, citizen:alertObj.citizen, phone:alertObj.phone, location:alertObj.location, priority:'HIGH', officer:'Pending', response:'—', status:'Pending' });
  savePersist();
  document.getElementById('c-bottom-nav').style.display='flex';
  cGoScreen('cs-panic');
  cStartEta();
  cToast('🚨 Emergency alert sent! Police notified.');
  if(document.getElementById('view-police-dashboard').classList.contains('active')) {
    renderAlerts();
    renderLogs();
    pdShowNotif(alertObj);
    flashAlert();
    playBeep();
    unreadCount++;
    updateStats();
  }
}
function cStartEta() {
  let v = 4;
  if(cEtaTimer) clearInterval(cEtaTimer);
  const etaEl = document.getElementById('c-eta');
  if(etaEl) etaEl.textContent = v;
  cEtaTimer = setInterval(() => {
    v = Math.max(0,v-1);
    const el = document.getElementById('c-eta');
    if(el) el.textContent = v;
    if(v===0) { clearInterval(cEtaTimer); cToast('🚓 Police unit SGD-041 has arrived!'); }
  }, 8000);
}
function cCancelAlert() {
  cShowAlert('❓','Cancel Alert?','This will notify police the situation is resolved.','Yes, Cancel', () => {
    if(alerts[0]) { alerts[0].status='Resolved'; if(logEntries[0]) logEntries[0].status='Resolved'; savePersist(); }
    cGoScreen('cs-home');
    cNavTo('home');
  });
}
function cDoLogout() {
  cShowAlert('🚪','Sign Out?','Are you sure you want to sign out?','Yes, Sign Out', () => {
    sessionStorage.removeItem('sg_citizen');
    currentCitizenUser = null;
    document.getElementById('c-bottom-nav').style.display='none';
    goLanding();
  });
}
function cFlipToggle(el) {
  el.classList.toggle('on'); el.classList.toggle('off');
  const t = el.closest('.sett-item')?.querySelector('.si-title')?.textContent||'';
  cToast((el.classList.contains('on')?'✅':'🔇')+' '+t+' '+(el.classList.contains('on')?'enabled':'disabled'));
}
function cShowAlert(icon,title,msg,btn,cb) {
  document.getElementById('cao-icon').textContent = icon;
  document.getElementById('cao-title').textContent = title;
  document.getElementById('cao-sub').textContent = msg;
  document.getElementById('cao-btn').textContent = btn||'OK';
  document.getElementById('cao-btn-sec').style.display = cb?'block':'none';
  cAlertCb = cb||null;
  document.getElementById('c-alert-overlay').classList.add('show');
}
function cCloseAlert() {
  document.getElementById('c-alert-overlay').classList.remove('show');
  if(cAlertCb) { cAlertCb(); cAlertCb=null; }
}
function cToast(msg) {
  const t = document.getElementById('c-toast');
  document.getElementById('c-toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(cToastTimer);
  cToastTimer = setTimeout(()=>t.classList.remove('show'), 3200);
}
function updateCClock() {
  const d = new Date();
  const el = document.getElementById('c-clock');
  if(el) el.textContent = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
}
setInterval(updateCClock, 10000); updateCClock();

/* ═══════════════════════════════════════
   POLICE AUTH
═══════════════════════════════════════ */
function pSwitchTab(t) {
  document.getElementById('p-tab-login').classList.toggle('active', t==='login');
  document.getElementById('p-tab-register').classList.toggle('active', t==='register');
  document.getElementById('p-form-login').classList.toggle('active', t==='login');
  document.getElementById('p-form-register').classList.toggle('active', t==='register');
}
function fillCreds(user, pass) {
  document.getElementById('plc-user').value = user;
  document.getElementById('plc-pass').value = pass;
  document.getElementById('p-login-err').style.display='none';
}
function doPoliceLogin() {
  const email = document.getElementById('plc-user').value.trim().toLowerCase();
  const pass  = document.getElementById('plc-pass').value;
  if(!email||!pass) { showAlert('p-login-err','❌ Please enter email and password.'); return; }
  const pu = getPoliceUsers();
  const acct = pu[email];
  if(!acct) { showAlert('p-login-err','❌ No officer account found. Please register first.'); return; }
  if(acct.pass !== pass) { showAlert('p-login-err','❌ Incorrect password. Please try again.'); return; }
  currentPoliceUser = { ...acct, email };
  sessionStorage.setItem('sg_police', JSON.stringify(currentPoliceUser));
  initPoliceDashboard();
  showView('view-police-dashboard');
  resetSession();
}
function doPoliceRegister() {
  const fname = document.getElementById('p-reg-fname').value.trim();
  const lname = document.getElementById('p-reg-lname').value.trim();
  const badge = document.getElementById('p-reg-badge').value.trim();
  const rank  = document.getElementById('p-reg-rank').value;
  const email = document.getElementById('p-reg-email').value.trim().toLowerCase();
  const pass  = document.getElementById('p-reg-pass').value;
  const pass2 = document.getElementById('p-reg-pass2').value;
  if(!fname||!lname||!badge||!rank||!email||!pass||!pass2) { showAlert('p-reg-err','❌ Please fill all fields.'); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('p-reg-err','❌ Enter a valid email address.'); return; }
  if(pass.length<8) { showAlert('p-reg-err','❌ Password must be at least 8 characters.'); return; }
  if(!/[A-Z]/.test(pass)) { showAlert('p-reg-err','❌ Password must contain at least one uppercase letter.'); return; }
  if(!/[0-9]/.test(pass)) { showAlert('p-reg-err','❌ Password must contain at least one number.'); return; }
  if(pass!==pass2) { showAlert('p-reg-err','❌ Passwords do not match.'); return; }
  const pu = getPoliceUsers();
  if(pu[email]) { showAlert('p-reg-err','❌ An account with this email already exists.'); return; }
  const av = (fname[0]+(lname[0]||'')).toUpperCase();
  pu[email] = { fname, lname, name:fname+' '+lname, badge, rank, role:rank, pass, av, email, createdAt:new Date().toISOString() };
  savePoliceUsers(pu);
  showAlert('p-reg-ok','✅ Officer account created! You can now sign in.');
  setTimeout(()=>pSwitchTab('login'), 2000);
}
function doPoliceLogout() {
  sessionStorage.removeItem('sg_police');
  currentPoliceUser = null;
  if(sessionTimer) clearInterval(sessionTimer);
  showView('view-landing');
}

/* ═══════════════════════════════════════
   POLICE DASHBOARD
═══════════════════════════════════════ */
function initPoliceDashboard() {
  document.getElementById('ptb-av').textContent = currentPoliceUser.av||'P';
  document.getElementById('ptb-name').textContent = currentPoliceUser.name||currentPoliceUser.fname+' '+currentPoliceUser.lname;
  document.getElementById('ptb-role').textContent = currentPoliceUser.role||currentPoliceUser.rank;
  if(!logEntries.length) logEntries = [...DEMO_LOGS];
  renderAlerts();
  renderLogs();
  renderOfficers();
  updateStats();
}

function updatePdClock() {
  const d = new Date();
  const el = document.getElementById('pd-clock');
  if(el) el.textContent = d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0');
}
setInterval(updatePdClock, 1000); updatePdClock();

function pdSection(name) {
  document.querySelectorAll('.pds-btn').forEach(b=>b.classList.remove('active'));
  const sb = document.getElementById('sb-'+name);
  if(sb) sb.classList.add('active');
  document.querySelectorAll('.pd-section').forEach(s=>s.classList.remove('active'));
  const sec = document.getElementById('pds-'+name);
  if(sec) sec.classList.add('active');
  const titles = {overview:'OVERVIEW',map:'LIVE MAP',logs:'INCIDENT LOGS',officers:'OFFICERS'};
  document.getElementById('pd-section-title').textContent = titles[name]||name.toUpperCase();
  if(name==='logs') renderLogs();
  if(name==='officers') renderOfficers();
}

function renderAlerts(filter) {
  if(filter !== undefined) filterStatus = filter;
  const list = document.getElementById('alerts-list');
  if(!list) return;

  let data = [...alerts];
  if(filterStatus) data = data.filter(a => a.status === filterStatus);

  if(!data.length) {
    list.innerHTML = `<div class="alerts-empty"><div>📡</div><div>No alerts${filterStatus?' with status: '+filterStatus:''}. Send SOS from Citizen app or click Simulate SOS.</div></div>`;
    renderMapPins();
    return;
  }

  list.innerHTML = data.map(a => alertCardHTML(a)).join('');
  renderMapPins();
  updateStats();
}

function alertCardHTML(a) {
  const priClass = a.priority==='HIGH'?'priority-high':a.priority==='MEDIUM'?'priority-med':'priority-low';
  const priColor = a.priority==='HIGH'?'var(--red)':a.priority==='MEDIUM'?'var(--gold)':'var(--green)';
  const sClass   = a.status==='Pending'?'badge-pending':a.status==='Dispatched'?'badge-dispatched':'badge-resolved';
  const newClass = a.new?'new-alert':'';
  const elapsed  = a.responseStart ? Math.floor((Date.now()-a.responseStart)/1000) : 0;
  const elapsedStr = elapsed < 60 ? elapsed+'s ago' : Math.floor(elapsed/60)+'m ago';
  return `<div class="alert-card ${priClass} ${newClass}" id="ac-${a.id}">
    <div class="ac-top">
      <div class="ac-info">
        <div class="ac-name">👤 ${a.citizen}</div>
        <div class="ac-phone">${a.phone}</div>
        <div class="ac-id">${a.id} · ${elapsedStr}</div>
      </div>
      <span class="ac-badge ${sClass}">${a.status.toUpperCase()}</span>
    </div>
    <div class="ac-meta">
      <div class="ac-meta-item">📍 <strong>${a.location}</strong></div>
      <div class="ac-meta-item">⏱️ ${a.timestamp}</div>
      <div class="ac-meta-item">⚡ <strong style="color:${priColor}">${a.priority}</strong></div>
      <div class="ac-meta-item">📞 ${a.type}</div>
    </div>
    <div class="ac-actions">
      <button class="ac-btn assign" onclick="assignUnit('${a.id}')">🚓 Assign</button>
      <button class="ac-btn call" onclick="pdToast('📞 Calling ${a.citizen}...')">📞 Call</button>
      <button class="ac-btn resolve${a.status==='Resolved'?' done':''}" onclick="resolveAlert('${a.id}')">✅ Resolve</button>
      <button class="ac-btn track" onclick="pdToast('📍 Tracking ${a.citizen}...')">📍 Track</button>
      <button class="ac-btn incident" onclick="pdToast('📋 Incident ${a.id}')">📋 Log</button>
    </div>
  </div>`;
}

function assignUnit(id) {
  const a = alerts.find(x=>x.id===id);
  if(!a) return;
  a.status='Dispatched'; a.new=false;
  const log = logEntries.find(l=>l.id===id);
  if(log) { log.status='Dispatched'; log.officer='SI Ahmed Khan'; log.response='~4 min'; }
  savePersist(); renderAlerts(); renderLogs();
  pdToast('🚓 Unit SGD-041 assigned to '+a.citizen);
}
function resolveAlert(id) {
  const a = alerts.find(x=>x.id===id);
  if(!a) return;
  if(a.responseStart) {
    const mins = ((Date.now()-a.responseStart)/60000).toFixed(1);
    const log = logEntries.find(l=>l.id===id);
    if(log) { log.response = mins+' min'; log.status='Resolved'; log.officer=log.officer==='Pending'?'SI Ahmed Khan':log.officer; }
  }
  a.status='Resolved'; a.new=false;
  savePersist(); renderAlerts(); renderLogs(); updateStats();
  pdToast('✅ Alert '+id+' resolved');
}
function filterAlerts(status) { renderAlerts(status===filterStatus?null:status); }
function pdSearch(q) {
  if(!q) { renderAlerts(); return; }
  q = q.toLowerCase();
  const data = alerts.filter(a=>a.citizen.toLowerCase().includes(q)||a.location.toLowerCase().includes(q)||a.id.toLowerCase().includes(q)||a.phone.includes(q));
  const list = document.getElementById('alerts-list');
  if(!list) return;
  if(!data.length) { list.innerHTML='<div class="alerts-empty"><div>🔍</div><div>No results for "'+q+'"</div></div>'; return; }
  list.innerHTML = data.map(a=>alertCardHTML(a)).join('');
}

function updateStats() {
  const active = alerts.filter(a=>a.status!=='Resolved').length;
  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-active-ch').textContent = active?'↑ '+active+' live':'✅ Clear';
  document.getElementById('stat-resolved').textContent = 12+alerts.filter(a=>a.status==='Resolved').length;
  const resolved = logEntries.filter(l=>l.response&&l.response!=='—'&&l.response!=='~4 min');
  if(resolved.length) {
    const avg = resolved.reduce((s,l)=>s+parseFloat(l.response),0)/resolved.length;
    document.getElementById('stat-response').textContent = avg.toFixed(1)+'m';
  }
  const badge = document.getElementById('alert-badge');
  if(badge) {
    badge.textContent = unreadCount;
    badge.classList.toggle('show', unreadCount>0);
  }
  document.getElementById('pd-system-status').textContent = active?'⚡ '+active+' ACTIVE ALERT'+(active>1?'S':''):'SYSTEM ACTIVE';
}

function renderMapPins() {
  const mini = document.getElementById('map-alert-pins');
  const full = document.getElementById('fullmap-pins');
  if(!mini||!full) return;
  const active = alerts.filter(a=>a.status!=='Resolved');
  mini.innerHTML=''; full.innerHTML='';
  active.slice(0,6).forEach((a,i)=>{
    const p = MAP_POSITIONS[i];
    const color = a.priority==='HIGH'?'var(--red)':a.priority==='MEDIUM'?'var(--gold)':'var(--green)';
    mini.innerHTML+=`<div class="map-alert-pin" style="top:${p.top};left:${p.left}" onclick="pdToast('🚨 ${a.citizen} — ${a.location}')"><div class="map-alert-dot" style="background:${color}"></div></div>`;
    full.innerHTML+=`<div style="position:absolute;top:${p.top};left:${p.left};font-size:18px;cursor:pointer;z-index:3" onclick="pdToast('🚨 ${a.id}: ${a.citizen} @ ${a.location}')">🔴</div>`;
  });
}

function simulateNewAlert() {
  const id = 'ALT-'+(++alertCounter);
  localStorage.setItem('sg_counter', alertCounter);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})+' '+now.toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit'});
  const citizen = CITIZEN_NAMES[Math.floor(Math.random()*CITIZEN_NAMES.length)];
  const priority = ['HIGH','HIGH','HIGH','MEDIUM','LOW'][Math.floor(Math.random()*5)];
  const a = {
    id, citizen, phone:'+92 3'+Math.floor(10+Math.random()*89)+' '+Math.floor(1000000+Math.random()*9000000),
    location:LOCATIONS[Math.floor(Math.random()*LOCATIONS.length)],
    type:ALERT_TYPES[Math.floor(Math.random()*ALERT_TYPES.length)],
    priority, status:'Pending', timestamp:dateStr, new:true, responseStart:Date.now()
  };
  alerts.unshift(a);
  logEntries.unshift({ id, date:dateStr, citizen:a.citizen, phone:a.phone, location:a.location, priority, officer:'Pending', response:'—', status:'Pending' });
  savePersist();
  unreadCount++;
  renderAlerts();
  renderLogs();
  updateStats();
  pdShowNotif(a);
  flashAlert();
  playBeep();
}

function renderLogs(filter) {
  if(filter) logFilterType=filter;
  const tbody = document.getElementById('logs-tbody');
  if(!tbody) return;
  let all = [...logEntries,...DEMO_LOGS];
  const seen=new Set(); all=all.filter(l=>{if(seen.has(l.id))return false;seen.add(l.id);return true;});
  if(logFilterType==='high') all=all.filter(l=>l.priority==='HIGH');
  else if(logFilterType==='medium') all=all.filter(l=>l.priority==='MEDIUM');
  else if(logFilterType==='resolved') all=all.filter(l=>l.status==='Resolved');
  tbody.innerHTML=all.map(l=>{
    const pColor=l.priority==='HIGH'?'var(--red)':l.priority==='MEDIUM'?'var(--gold)':'var(--green)';
    const sClass=l.status==='Resolved'?'badge-resolved':l.status==='Dispatched'?'badge-dispatched':'badge-pending';
    return `<tr onclick="pdToast('📋 ${l.id}: ${l.citizen} @ ${l.location}')">
      <td class="bold mono">${l.id}</td>
      <td class="mono" style="font-size:10px;white-space:nowrap">${l.date}</td>
      <td class="bold">${l.citizen}</td>
      <td style="font-size:11px">${l.location}</td>
      <td><span class="td-priority" style="background:${pColor}18;color:${pColor};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">${l.priority}</span></td>
      <td style="font-size:11px">${l.officer}</td>
      <td class="mono">${l.response}</td>
      <td><span class="td-status ${sClass}">${l.status}</span></td>
    </tr>`;
  }).join('');
}
function logFilter(type,btn) {
  document.querySelectorAll('.lf-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderLogs(type);
}
function logSearch(q) {
  document.querySelectorAll('#logs-tbody tr').forEach(r=>{
    r.style.display=r.textContent.toLowerCase().includes(q.toLowerCase())?'':'none';
  });
}
function exportLogs() {
  const all=[...logEntries,...DEMO_LOGS];
  const seen=new Set(); const dedup=all.filter(l=>{if(seen.has(l.id))return false;seen.add(l.id);return true;});
  const csv='ID,Date,Citizen,Location,Priority,Officer,Response,Status\n'+dedup.map(l=>`${l.id},"${l.date}","${l.citizen}","${l.location}",${l.priority},"${l.officer}",${l.response},${l.status}`).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='safeguard_incident_log.csv';a.click();
  pdToast('📤 Incident log exported as CSV');
}

function renderOfficers() {
  const grid = document.getElementById('officers-grid');
  if(!grid) return;
  const pu = getPoliceUsers();
  const staticOfficers = [
    { fname:'Ahmed',lname:'Khan',rank:'SI (Sub-Inspector)',badge:'SGD-041',status:'Responding',statusColor:'var(--red)',av:'AK',avColor:'linear-gradient(135deg,#1a4a8a,#0a2050)',alerts:47,eta:'3.8m',resolved:'98%' },
    { fname:'Bilal',lname:'Raza',rank:'ASI (Asst. Sub-Inspector)',badge:'SGD-078',status:'Standby',statusColor:'var(--gold)',av:'BR',avColor:'linear-gradient(135deg,#2a6a1a,#143008)',alerts:32,eta:'4.2m',resolved:'95%' },
    { fname:'Kamran',lname:'Ali',rank:'Constable',badge:'SGD-023',status:'Available',statusColor:'var(--green)',av:'KA',avColor:'linear-gradient(135deg,#6a4a1a,#301808)',alerts:28,eta:'5.1m',resolved:'93%' },
  ];
  const registered = Object.values(pu).filter(u=>!['SGD-001'].includes(u.badge));
  let html = staticOfficers.map(o=>`
    <div class="officer-card">
      <div class="ofc-top">
        <div class="ofc-avatar" style="background:${o.avColor}">${o.av}</div>
        <div class="ofc-info">
          <div class="ofc-name">${o.rank.split(' ')[0]} ${o.fname} ${o.lname}</div>
          <div class="ofc-rank">${o.rank} · ${o.badge}</div>
          <div class="ofc-online" style="color:${o.statusColor}"><span style="width:7px;height:7px;border-radius:50%;background:${o.statusColor};display:inline-block${o.status==='Responding'?';animation:blink .8s infinite':''}"></span>&nbsp;${o.status}</div>
        </div>
      </div>
      <div class="ofc-stats">
        <div class="ofc-stat"><div class="ofc-stat-val">${o.alerts}</div><div class="ofc-stat-label">Alerts</div></div>
        <div class="ofc-stat"><div class="ofc-stat-val">${o.eta}</div><div class="ofc-stat-label">Avg ETA</div></div>
        <div class="ofc-stat"><div class="ofc-stat-val">${o.resolved}</div><div class="ofc-stat-label">Resolved</div></div>
      </div>
    </div>`).join('');
  html += registered.map(o=>`
    <div class="officer-card">
      <div class="ofc-top">
        <div class="ofc-avatar" style="background:linear-gradient(135deg,#1a3a6a,#0a1a40)">${o.av||((o.fname[0]||'')+(o.lname[0]||'')).toUpperCase()}</div>
        <div class="ofc-info">
          <div class="ofc-name">${o.fname} ${o.lname}</div>
          <div class="ofc-rank">${o.rank} · ${o.badge}</div>
          <div class="ofc-online text-green"><span style="width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block"></span>&nbsp;Online</div>
        </div>
      </div>
      <div class="ofc-stats">
        <div class="ofc-stat"><div class="ofc-stat-val">0</div><div class="ofc-stat-label">Alerts</div></div>
        <div class="ofc-stat"><div class="ofc-stat-val">—</div><div class="ofc-stat-label">Avg ETA</div></div>
        <div class="ofc-stat"><div class="ofc-stat-val">—</div><div class="ofc-stat-label">Resolved</div></div>
      </div>
    </div>`).join('');
  html += `<div class="officer-card" style="border-style:dashed;opacity:.5;cursor:pointer" onclick="pdToast('➕ Invite new officer via email...')"><div style="text-align:center;padding:20px 0;color:var(--gray2)"><div style="font-size:32px;margin-bottom:8px">➕</div><div style="font-size:13px">Add Officer</div><div style="font-size:10px;margin-top:4px">Register from Police Login</div></div></div>`;
  grid.innerHTML = html;
}

function pdShowNotif(alert) {
  const container = document.getElementById('police-notif');
  const card = document.createElement('div');
  card.className='pn-card';
  card.innerHTML=`<div class="pn-icon">🚨</div><div class="pn-text"><div class="pn-title">NEW SOS — ${alert.priority} PRIORITY</div><div class="pn-sub"><strong>${alert.citizen}</strong><br>${alert.location}</div><div class="pn-time">${alert.id} · ${alert.timestamp}</div></div><div class="pn-close" onclick="this.parentElement.remove()">✕</div>`;
  container.prepend(card);
  setTimeout(()=>{ if(card.parentElement) card.remove(); }, 8000);
}
function flashAlert() {
  const f=document.getElementById('alert-flash');
  f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash');
}
function playBeep() {
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    [880,660,880].forEach((freq,i)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=freq;osc.type='sine';
      gain.gain.setValueAtTime(.15,ctx.currentTime+i*.15);
      gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+i*.15+.14);
      osc.start(ctx.currentTime+i*.15);osc.stop(ctx.currentTime+i*.15+.15);
    });
  }catch(e){}
}
let pdToastTimer=null;
function pdToast(msg) {
  const t=document.getElementById('police-toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(pdToastTimer);
  pdToastTimer=setTimeout(()=>t.classList.remove('show'),3000);
}

let sessionTimer=null, sessionLeft=300;
function resetSession() {
  sessionLeft=300;
  document.getElementById('session-warning').classList.remove('show');
  if(sessionTimer) clearInterval(sessionTimer);
  sessionTimer=setInterval(()=>{
    sessionLeft--;
    if(sessionLeft<=60){
      const sw=document.getElementById('session-warning');
      sw.classList.add('show');
      const m=Math.floor(sessionLeft/60),s=sessionLeft%60;
      document.getElementById('session-countdown').textContent=m+':'+s.toString().padStart(2,'0');
    }
    if(sessionLeft<=0){ clearInterval(sessionTimer); doPoliceLogout(); }
  },1000);
}

(function restoreSessions() {
  const savedPolice = sessionStorage.getItem('sg_police');
  if(savedPolice) {
    currentPoliceUser = JSON.parse(savedPolice);
    initPoliceDashboard();
    showView('view-police-dashboard');
    resetSession();
    return;
  }
  const savedCitizen = sessionStorage.getItem('sg_citizen');
  if(savedCitizen) {
    currentCitizenUser = JSON.parse(savedCitizen);
    showView('view-citizen');
    enterCitizenApp(currentCitizenUser);
  }
})();

if(!logEntries.length) { logEntries=[...DEMO_LOGS]; savePersist(); }

setInterval(()=>{
  if(document.getElementById('view-police-dashboard').classList.contains('active')) {
    if(Math.random()<.12) simulateNewAlert();
  }
},25000);
