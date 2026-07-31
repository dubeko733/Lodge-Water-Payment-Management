/*
  script.js
  Vanilla JS for Lodge Water Payment Management
  - Generates room cards automatically
  - Updates dashboard live as the user types
  - Persists data to localStorage and restores on load
  - Beginner-friendly comments explain each section
*/

// --- Configuration ---
const ROOMS = [
  'A1','A2','A3','A4','A5','A6',
  'B1','B2','B3','B4','B5','B6'
];
const PRICE = 2700; // monthly fee per room in Naira
const STORAGE_KEY = 'lodge_water_payments_v1';

// --- Helper: format currency in Naira ---
function formatCurrency(amount){
  // Ensure a number and format with commas
  const n = Number(amount) || 0;
  // Use toLocaleString for grouping; prefix with the Naira symbol
  return '₦' + n.toLocaleString('en-NG');
}

// --- State: load from localStorage or initialize ---
let state = {}; // { room: { tenant: string, amount: number } }
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      // Ensure every room exists in parsed state
      ROOMS.forEach(r => {
        state[r] = parsed[r] || { tenant: '', amount: 0 };
      });
    } else {
      // First time: create empty records
      ROOMS.forEach(r => state[r] = { tenant: '', amount: 0 });
    }
  } catch(e){
    // If parsing fails, reinitialize cleanly
    ROOMS.forEach(r => state[r] = { tenant: '', amount: 0 });
    console.error('Failed to load state, resetting.', e);
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch(e){
    console.error('Failed to save state', e);
  }
}

// --- DOM references ---
const roomsContainer = document.getElementById('rooms');
const searchInput = document.getElementById('search');
const resetBtn = document.getElementById('resetBtn');
const adminIndicatorEl = document.getElementById('adminIndicator');
const adminBtn = document.getElementById('adminBtn');
const totalExpectedEl = document.getElementById('totalExpected');
const totalCollectedEl = document.getElementById('totalCollected');
const outstandingEl = document.getElementById('outstanding');
const paidCountEl = document.getElementById('paidCount');

// Set static total expected
totalExpectedEl.textContent = formatCurrency(PRICE * ROOMS.length);

// --- Admin/Lock configuration ---
const ADMIN_HASH_KEY = 'lodge_water_admin_hash_v1';
const ADMIN_SESSION_KEY = 'lodge_water_admin_session_v1';
let isAdmin = false; // current session admin flag

// Hash a password using SHA-256 and return hex string
async function hashPassword(password){
  const enc = new TextEncoder();
  const data = enc.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
  return hashHex;
}

// Update admin UI (indicator and button text)
function updateAdminUI(){
  if(isAdmin){
    adminIndicatorEl.textContent = '🔓 Admin';
    adminIndicatorEl.style.color = 'var(--paid)';
    adminBtn.textContent = 'Lock';
    adminBtn.classList.remove('btn-danger');
  } else {
    adminIndicatorEl.textContent = '🔒 Locked';
    adminIndicatorEl.style.color = '';
    adminBtn.textContent = 'Enter Admin';
    adminBtn.classList.add('btn');
  }
}

// Enable or disable editing depending on admin status
function applyEditLock(){
  const tenantInputs = Array.from(document.querySelectorAll('.tenant-input'));
  const amountInputs = Array.from(document.querySelectorAll('.amount-input'));
  tenantInputs.forEach(i => i.disabled = !isAdmin);
  amountInputs.forEach(i => i.disabled = !isAdmin);
  // Reset button should be admin-only
  resetBtn.disabled = !isAdmin;
  // Visual cue: reduce opacity when not admin
  tenantInputs.concat(amountInputs).forEach(i => i.style.opacity = isAdmin ? '1' : '0.9');
}

// Prompt to set a new admin password (used if none exists)
async function promptSetPassword(){
  const p1 = prompt('No admin password set. Create a new admin password:');
  if(!p1) return false;
  const p2 = prompt('Confirm new admin password:');
  if(p1 !== p2){ alert('Passwords do not match.'); return false; }
  const hash = await hashPassword(p1);
  localStorage.setItem(ADMIN_HASH_KEY, hash);
  return true;
}

// Prompt for admin login; if success, set session
async function promptAdminLogin(){
  try{
    let existingHash = localStorage.getItem(ADMIN_HASH_KEY);
    if(!existingHash){
      const created = await promptSetPassword();
      if(!created) return false;
      existingHash = localStorage.getItem(ADMIN_HASH_KEY);
    }
    const attempt = prompt('Enter admin password:');
    if(!attempt) return false;
    const attemptHash = await hashPassword(attempt);
    if(attemptHash === existingHash){
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      isAdmin = true;
      updateAdminUI();
      applyEditLock();
      return true;
    } else {
      alert('Incorrect password');
      return false;
    }
  } catch(e){
    console.error('Admin login failed', e);
    return false;
  }
}

// Lock admin (end session)
function lockAdmin(){
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  isAdmin = false;
  updateAdminUI();
  applyEditLock();
}

// Toggle admin on button click
adminBtn.addEventListener('click', async () => {
  if(isAdmin){
    // lock
    const ok = confirm('Lock admin mode?');
    if(ok) lockAdmin();
    return;
  }
  await promptAdminLogin();
});

// --- Create a single room card element ---
function createRoomCard(room){
  const data = state[room] || { tenant: '', amount: 0 };

  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.room = room;

  // Build inner HTML for structure. Keeping it simple and readable.
  card.innerHTML = `
    <div class="room-row">
      <div>
        <div class="room-number">${room}</div>
        <div class="room-amount helper">Monthly: ${formatCurrency(PRICE)}</div>
      </div>
      <div class="row">
        <div class="status" aria-hidden="true"></div>
      </div>
    </div>

    <div>
      <label class="helper">Tenant name</label>
      <input type="text" class="tenant-input" placeholder="Enter tenant name" value="${escapeHtml(data.tenant)}" />
    </div>

    <div>
      <label class="helper">Amount paid</label>
      <input type="number" min="0" step="1" class="amount-input" value="${Number(data.amount) || 0}" />
    </div>

    <div class="room-row">
      <div class="helper">Remaining</div>
      <div class="balance">${formatCurrency(Math.max(0, PRICE - (Number(data.amount) || 0)))}</div>
    </div>
  `;

  // Attach event listeners to inputs
  const tenantInput = card.querySelector('.tenant-input');
  const amountInput = card.querySelector('.amount-input');
  const statusEl = card.querySelector('.status');
  const balanceEl = card.querySelector('.balance');

  // Update UI function for this card
  function refreshCard(){
    const tenant = tenantInput.value.trim();
    let amount = Number(amountInput.value);
    if(Number.isNaN(amount) || amount < 0) amount = 0;

    // Update state and save
    state[room] = { tenant, amount };
    saveState();

    // Update balance and status display
    const remaining = Math.max(0, PRICE - amount);
    balanceEl.textContent = formatCurrency(remaining);

    if(amount >= PRICE){
      statusEl.textContent = '✅ PAID';
      statusEl.classList.remove('pending');
      statusEl.classList.add('paid');
      statusEl.setAttribute('aria-label', 'Paid');
    } else {
      statusEl.textContent = 'Pending';
      statusEl.classList.remove('paid');
      statusEl.classList.add('pending');
      statusEl.setAttribute('aria-label', 'Pending payment');
    }

    // Update dashboard totals live
    updateDashboard();
  }

  // Save tenant name on input (instant)
  tenantInput.addEventListener('input', () => {
    refreshCard();
    // Also re-apply search so filtering updates while typing tenant name
    applySearch();
  });

  // Save amount on input (instant)
  amountInput.addEventListener('input', () => {
    refreshCard();
  });

  // Initial render of status and balance
  refreshCard();

  return card;
}

// --- Escape HTML for safe value insertion into inputs ---
function escapeHtml(str){
  if(!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Render all room cards into the DOM ---
function renderRooms(){
  roomsContainer.innerHTML = '';
  ROOMS.forEach(room => {
    const card = createRoomCard(room);
    roomsContainer.appendChild(card);
  });
  // Apply current search filter (in case user typed before rendering)
  applySearch();
  // Enforce edit lock state after rendering cards
  applyEditLock();
}

// --- Update dashboard numbers ---
function updateDashboard(){
  const totalExpected = PRICE * ROOMS.length;
  let collected = 0;
  let paidCount = 0;
  ROOMS.forEach(r => {
    const amt = Number((state[r] && state[r].amount) || 0);
    collected += Math.max(0, amt);
    if(amt >= PRICE) paidCount += 1;
  });
  const outstanding = Math.max(0, totalExpected - collected);

  totalCollectedEl.textContent = formatCurrency(collected);
  outstandingEl.textContent = formatCurrency(outstanding);
  paidCountEl.textContent = `${paidCount} / ${ROOMS.length}`;
}

// --- Search/filter logic ---
function applySearch(){
  const q = (searchInput.value || '').trim().toLowerCase();
  const cards = Array.from(roomsContainer.querySelectorAll('.card'));
  if(!q){
    cards.forEach(c => c.style.display = 'block');
    return;
  }

  cards.forEach(card => {
    const room = (card.dataset.room || '').toLowerCase();
    const tenantInput = card.querySelector('.tenant-input');
    const tenant = (tenantInput && tenantInput.value || '').toLowerCase();

    // Match if query is substring of room or tenant
    const matches = room.includes(q) || tenant.includes(q);
    card.style.display = matches ? 'block' : 'none';
  });
}

// --- Reset new month: clears storage after confirmation ---
function resetNewMonth(){
  // Only admin can reset; prompt to login if not admin
  if(!isAdmin){
    const tryLogin = confirm('Only admin can reset data. Log in as admin now?');
    if(tryLogin){
      promptAdminLogin().then(ok => { if(ok) resetNewMonth(); });
    }
    return;
  }
  const ok = confirm('Reset all tenant names and payments for a new month? This will clear saved data.');
  if(!ok) return;

  // Clear storage and reinitialize state
  localStorage.removeItem(STORAGE_KEY);
  loadState();
  renderRooms();
  updateDashboard();
}

// --- Wire up global event listeners ---
searchInput.addEventListener('input', applySearch);
resetBtn.addEventListener('click', resetNewMonth);

// --- Initialize app ---
function init(){
  loadState();
  renderRooms();
  updateDashboard();

  // Accessibility: focus search on load for quick keyboard use
  if(searchInput) searchInput.setAttribute('placeholder', 'Search by room or tenant name');

  // Restore admin session if present
  if(sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'){
    isAdmin = true;
  } else {
    isAdmin = false;
  }
  updateAdminUI();
  applyEditLock();
}

// Start the app when DOM is ready (script is loaded with defer so DOM exists)
init();
