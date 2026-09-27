/* ==========================================================================
   BIZNES HISOBCHI — HIGH-PERFORMANCE ZERO-LAG JAVASCRIPT ENGINE (120 FPS)
   Optimized DOM manipulation, batched writes, debounced inputs, resilient storage
   ========================================================================== */

// --- STATE MANAGEMENT WITH MULTI-KEY SYNCHRONIZED STORAGE ---
const ALL_PRODUCT_STORAGE_KEYS = [
  'biznes_hisob_products_v12',
  'biznes_hisob_products_v11',
  'biznes_hisob_products_v10',
  'biznes_hisob_products_v9',
  'biznes_hisob_products_v8',
  'biznes_hisob_products_v7',
  'biznes_hisob_products_v6',
  'biznes_hisob_products'
];

const STORAGE_PRODUCTS_KEY = 'biznes_hisob_products_v12';
const STORAGE_SETTINGS_KEY = 'biznes_hisob_settings_v12';
const STORAGE_CURRENT_USER_KEY = 'biznes_current_user_v12';
const STORAGE_GOAL_KEY = 'biznes_monthly_goal_v12';

function getStoredProductsWithFallback() {
  for (const k of ALL_PRODUCT_STORAGE_KEYS) {
    const val = localStorage.getItem(k);
    if (val) {
      try {
        const arr = JSON.parse(val);
        if (Array.isArray(arr) && arr.length > 0) {
          return arr;
        }
      } catch (e) {}
    }
  }
  return [];
}

function getStoredGoalWithFallback() {
  const keys = [
    'biznes_monthly_goal_v12',
    'biznes_monthly_goal_v11',
    'biznes_monthly_goal_v10',
    'biznes_monthly_goal_v9',
    'biznes_monthly_goal_v8'
  ];
  for (const k of keys) {
    const val = localStorage.getItem(k);
    if (val) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return 10000000;
}

let products = getStoredProductsWithFallback();
let settings = JSON.parse(localStorage.getItem(STORAGE_SETTINGS_KEY)) || {
  currency: 'UZS',
  ownerName: 'Oydinoy'
};

let monthlyGoal = getStoredGoalWithFallback();

// REGISTERED USERS DATABASE (LOCALSTORAGE)
const STORAGE_USERS_KEY = 'biznes_registered_users_v14';
const DEFAULT_USERS = [
  {
    id: 'oydinoy',
    name: 'Oydinoy',
    email: 'oydinoy@gmail.com',
    password: 'oydinoy1234',
    role: 'admin',
    roleLabel: '⭐ Oydinoy (Maxsus)'
  }
];

function getRegisteredUsers() {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY) || localStorage.getItem('biznes_registered_users_v13');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        const oydinUser = list.find(u => (u.email || '').toLowerCase() === 'oydinoy@gmail.com');
        if (oydinUser) {
          oydinUser.password = 'oydinoy1234';
        } else {
          list.unshift(DEFAULT_USERS[0]);
        }
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(list));
        return list;
      }
    }
  } catch (e) {}
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_USERS));
  return [...DEFAULT_USERS];
}

function saveRegisteredUser(newUser) {
  const list = getRegisteredUsers();
  const existingIdx = list.findIndex(u => (u.email || '').toLowerCase() === (newUser.email || '').toLowerCase());
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...newUser };
  } else {
    list.push(newUser);
  }
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(list));
}

let currentUser = JSON.parse(localStorage.getItem(STORAGE_CURRENT_USER_KEY)) || null;

let currentImageData = '';
let activeFilter = 'all';
let activeMonthFilter = 'all';
let searchQuery = '';
let editingProductId = null;

// --- INDEXEDDB BULLETPROOF PERSISTENT STORAGE ENGINE ---
const IDB_NAME = 'BiznesHisobDB_v2';
const IDB_STORE = 'products_store';

function openIDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

let idbSaveTimer = null;
function saveProductsToIDB(productsList) {
  // Asynchronous debounced background write (never blocks main thread)
  clearTimeout(idbSaveTimer);
  idbSaveTimer = setTimeout(async () => {
    try {
      const db = await openIDB();
      if (!db) return;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      productsList.forEach(p => {
        try { store.put(p); } catch (e) {}
      });
    } catch (err) {
      console.warn("IDB warning:", err);
    }
  }, 100);
}

async function loadProductsFromIDB() {
  try {
    const db = await openIDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    return [];
  }
}

// --- FAST IMAGE COMPRESSOR (Mobile Optimized) ---
function compressImage(file, maxWidth = 350, maxHeight = 350, quality = 0.6, callback) {
  if (!file) {
    callback('');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      callback(compressedDataUrl);
    };
    img.onerror = function() {
      callback(e.target.result || '');
    };
    img.src = e.target.result;
  };
  reader.onerror = function() {
    callback('');
  };
  reader.readAsDataURL(file);
}

// --- DOM ELEMENTS CACHE ---
const appContent = document.getElementById('appContent');
const productForm = document.getElementById('productForm');
const formTitle = document.getElementById('formTitle');
const submitBtnText = document.getElementById('submitBtnText');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const editingProductIdInput = document.getElementById('editingProductId');

const dropzone = document.getElementById('dropzone');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');

const buyPriceInput = document.getElementById('buyPrice');
const cargoPriceInput = document.getElementById('cargoPrice');
const sellPriceInput = document.getElementById('sellPrice');
const quantityInput = document.getElementById('quantity');
const productNameInput = document.getElementById('productName');
const productDateInput = document.getElementById('productDate');
const submitProductBtn = document.getElementById('submitProductBtn');

// Live preview DOMs
const previewSingleCost = document.getElementById('previewSingleCost');
const previewTotalCost = document.getElementById('previewTotalCost');
const previewProfit = document.getElementById('previewProfit');

// Stats DOMs
const statTotalRevenue = document.getElementById('statTotalRevenue');
const statTotalCost = document.getElementById('statTotalCost');
const statTotalProfit = document.getElementById('statTotalProfit');

// Goal Tracker DOMs
const goalTargetVal = document.getElementById('goalTargetVal');
const editGoalBtn = document.getElementById('editGoalBtn');
const goalProgressBar = document.getElementById('goalProgressBar');
const goalProgressText = document.getElementById('goalProgressText');
const goalMetricTarget = document.getElementById('goalMetricTarget');
const goalMetricAchieved = document.getElementById('goalMetricAchieved');
const goalMetricRemaining = document.getElementById('goalMetricRemaining');

// Goal Edit Modal DOMs
const goalModal = document.getElementById('goalModal');
const closeGoalModalBtn = document.getElementById('closeGoalModalBtn');
const goalForm = document.getElementById('goalForm');
const goalInputAmount = document.getElementById('goalInputAmount');

// Mobile Sticky Summary DOMs
const stickyRevenue = document.getElementById('stickyRevenue');
const stickyCost = document.getElementById('stickyCost');
const stickyProfit = document.getElementById('stickyProfit');

// Table & Controls
const productTableBody = document.getElementById('productTableBody');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const filterBtns = document.querySelectorAll('.filter-btn');
const monthSelectFilter = document.getElementById('monthSelectFilter');

// Mobile Tabs
const tabFormBtn = document.getElementById('tabFormBtn');
const tabTableBtn = document.getElementById('tabTableBtn');
const mainLayout = document.getElementById('mainLayout');
const mobileCountBadge = document.getElementById('mobileCountBadge');

// Action Buttons
const exportCsvBtn = document.getElementById('exportCsvBtn');
const printBtn = document.getElementById('printBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

// Settings Modal DOMs
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingCurrency = document.getElementById('settingCurrency');

// AUTH DOMs
const authContainer = document.getElementById('authContainer');
const authModal = document.getElementById('authModal');
const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
const tabAuthRegisterBtn = document.getElementById('tabAuthRegisterBtn');
const tabAuthLoginBtn = document.getElementById('tabAuthLoginBtn');
const authModalTitle = document.getElementById('authModalTitle');
const authModalSubtitle = document.getElementById('authModalSubtitle');
const googleAuthActionBtn = document.getElementById('googleAuthActionBtn');
const googleAuthBtnText = document.getElementById('googleAuthBtnText');
const authMainForm = document.getElementById('authMainForm');
const authNameGroup = document.getElementById('authNameGroup');
const authNameInput = document.getElementById('authNameInput');
const authEmailInput = document.getElementById('authEmailInput');
const authPasswordInput = document.getElementById('authPasswordInput');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authSwitchPrompt = document.getElementById('authSwitchPrompt');
const authSwitchLink = document.getElementById('authSwitchLink');
const settingsLogoutBtn = document.getElementById('settingsLogoutBtn');

// --- SMART NUMBER PARSER ---
function parseSmartNumber(val) {
  if (val === null || val === undefined) return 0;
  let s = String(val).trim();
  if (!s) return 0;

  s = s.replace(/\s+/g, '');

  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    s = s.replace(/[.,]/g, '');
  } else {
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function formatCurrency(amount) {
  const rounded = Math.round((amount || 0) * 100) / 100;
  const formatted = rounded.toLocaleString('ru-RU');

  if (settings.currency === 'USD') return `$${formatted}`;
  if (settings.currency === 'RUB') return `${formatted} ₽`;
  return `${formatted} so'm`;
}

function showToast(message) {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span style="font-size: 1.1rem; line-height: 1;">✅</span> <span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

// --- BULLETPROOF STORAGE SAVER ---
function saveProducts() {
  saveProductsToIDB(products);

  try {
    const serialized = JSON.stringify(products);
    ALL_PRODUCT_STORAGE_KEYS.forEach(k => {
      try { localStorage.setItem(k, serialized); } catch (e) {}
    });
  } catch (err) {
    // Quota fallback: lighten older entries
    const lightProducts = products.map((p, idx) => (idx >= 3 ? { ...p, image: '' } : p));
    const lightSerialized = JSON.stringify(lightProducts);
    ALL_PRODUCT_STORAGE_KEYS.forEach(k => {
      try { localStorage.setItem(k, lightSerialized); } catch (e) {}
    });
  }
}

function saveSettingsToStorage() {
  localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
}

function saveCurrentUserSession() {
  localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(currentUser));
}

function saveMonthlyGoal() {
  localStorage.setItem(STORAGE_GOAL_KEY, monthlyGoal.toString());
}

// --- AUTHENTICATION & TIER IDENTIFICATION ---
function isOydinoyUser() {
  if (!currentUser) return false;
  const email = (currentUser.email || '').toLowerCase().trim();
  const name = (currentUser.name || '').toLowerCase().trim();
  return email === 'oydinoy@gmail.com' || email.includes('oydinoy') || name === 'oydinoy';
}

function getUserProductLimit() {
  if (userPlan === 'monthly_pro' || userPlan === 'yearly_vip' || userPlan === 'lifetime') {
    return Infinity;
  }
  if (userPlan === 'monthly_start') {
    return 100;
  }
  if (isOydinoyUser()) {
    return 500;
  }
  return 10;
}

let authRendered = false;
let authMode = 'login'; // 'login' or 'register'

const authPhoneGroup = document.getElementById('authPhoneGroup');
const authPhoneInput = document.getElementById('authPhoneInput');

function setAuthMode(mode) {
  authMode = mode;
  if (authMode === 'register') {
    if (tabAuthRegisterBtn) {
      tabAuthRegisterBtn.style.background = 'var(--gradient-primary)';
      tabAuthRegisterBtn.style.color = '#fff';
      tabAuthRegisterBtn.style.boxShadow = '0 4px 12px var(--primary-glow)';
    }
    if (tabAuthLoginBtn) {
      tabAuthLoginBtn.style.background = 'transparent';
      tabAuthLoginBtn.style.color = 'var(--text-muted)';
      tabAuthLoginBtn.style.boxShadow = 'none';
    }
    if (authModalTitle) authModalTitle.textContent = "Ro'yxatdan o'tish";
    if (authModalSubtitle) authModalSubtitle.textContent = "Yangi akkaunt yarating va hisob-kitobni boshlang";
    if (googleAuthBtnText) googleAuthBtnText.textContent = "Google orqali ro'yxatdan o'tish";
    if (authNameGroup) authNameGroup.style.display = 'block';
    if (authPhoneGroup) authPhoneGroup.style.display = 'block';
    if (authSubmitBtn) authSubmitBtn.innerHTML = "📝 Ro'yxatdan o'tish";
    if (authSwitchPrompt) {
      authSwitchPrompt.innerHTML = `Akkauntingiz bormi? <a href="#" id="authSwitchLink" style="color: var(--primary-light); font-weight: 700; text-decoration: underline;">Kirish</a>`;
      const link = document.getElementById('authSwitchLink');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); setAuthMode('login'); });
    }
  } else {
    if (tabAuthLoginBtn) {
      tabAuthLoginBtn.style.background = 'var(--gradient-primary)';
      tabAuthLoginBtn.style.color = '#fff';
      tabAuthLoginBtn.style.boxShadow = '0 4px 12px var(--primary-glow)';
    }
    if (tabAuthRegisterBtn) {
      tabAuthRegisterBtn.style.background = 'transparent';
      tabAuthRegisterBtn.style.color = 'var(--text-muted)';
      tabAuthRegisterBtn.style.boxShadow = 'none';
    }
    if (authModalTitle) authModalTitle.textContent = "Tizimga Kirish";
    if (authModalSubtitle) authModalSubtitle.textContent = "Google yoki Email orqali kiring";
    if (googleAuthBtnText) googleAuthBtnText.textContent = "Google orqali kirish";
    if (authNameGroup) authNameGroup.style.display = 'none';
    if (authPhoneGroup) authPhoneGroup.style.display = 'none';
    if (authSubmitBtn) authSubmitBtn.innerHTML = "🔑 Tizimga Kirish";
    if (authSwitchPrompt) {
      authSwitchPrompt.innerHTML = `Akkauntingiz yo'qmi? <a href="#" id="authSwitchLink" style="color: var(--primary-light); font-weight: 700; text-decoration: underline;">Ro'yxatdan o'ting</a>`;
      const link = document.getElementById('authSwitchLink');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); setAuthMode('register'); });
    }
  }
}

if (tabAuthRegisterBtn) {
  tabAuthRegisterBtn.addEventListener('click', () => setAuthMode('register'));
}
if (tabAuthLoginBtn) {
  tabAuthLoginBtn.addEventListener('click', () => setAuthMode('login'));
}
if (authSwitchLink) {
  authSwitchLink.addEventListener('click', (e) => {
    e.preventDefault();
    setAuthMode(authMode === 'login' ? 'register' : 'login');
  });
}

function checkAuthAndRender() {
  // Safeguard: Ensure no password hint elements ever exist in the DOM
  document.querySelectorAll('span, small, p, div, label').forEach(el => {
    if (el.children.length === 0 && el.textContent && (el.textContent.includes('Oydinoy uchun') || el.textContent.includes('Parol: 123') || el.textContent.includes('123 (Oydinoy'))) {
      el.remove();
    }
  });

  if (!currentUser) {
    if (appContent) appContent.classList.add('blurred');
    if (authModal) {
      authModal.classList.add('active');
    }
    if (closeAuthModalBtn) {
      closeAuthModalBtn.style.display = 'none';
    }
    if (authContainer) {
      authContainer.innerHTML = `
        <button class="btn btn-primary btn-sm" id="directHeaderLoginBtn" style="font-weight: 700; border-radius: 20px; padding: 6px 14px; font-size: 0.82rem; background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff;">
          🔐 Kirish / Ro'yxatdan o'tish
        </button>
      `;
      const btn = document.getElementById('directHeaderLoginBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          if (authModal) authModal.classList.add('active');
        });
      }
    }
    authRendered = true;
  } else {
    if (appContent) appContent.classList.remove('blurred');
    if (authModal) authModal.classList.remove('active');
    if (closeAuthModalBtn) {
      closeAuthModalBtn.style.display = '';
    }

    if (authContainer) {
      const isOydin = isOydinoyUser();
      const limit = getUserProductLimit();
      const limitBadge = limit === Infinity ? '👑 Cheksiz' : (isOydin ? '⭐ 500 ta' : `🌱 ${limit} ta`);

      authContainer.innerHTML = `
        <div class="user-profile-badge" style="display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: 20px; border: 1px solid var(--border);">
          <span style="font-size: 1.05rem;">${isOydin ? '⭐' : '👤'}</span>
          <span style="font-weight: 700; color: #fff;">${currentUser.name || 'Foydalanuvchi'}</span>
          <span style="font-size: 0.74rem; background: ${isOydin ? 'rgba(245,158,11,0.22)' : 'rgba(16,185,129,0.22)'}; color: ${isOydin ? '#f59e0b' : 'var(--success)'}; padding: 2px 8px; border-radius: 6px; font-weight: 800;">
            ${limitBadge}
          </span>
          <button class="btn btn-danger btn-sm" id="directHeaderLogoutBtn" title="Chiqish" style="margin-left: 4px; padding: 3px 8px; font-size: 0.75rem;">
            Chiqish
          </button>
        </div>
      `;
      const btn = document.getElementById('directHeaderLogoutBtn');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          logoutUser();
        });
      }
      authRendered = true;
    }
  }
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
  authRendered = false;
  checkAuthAndRender();
  renderPricingCards();
  updatePlanBadgeUI();
  renderUI();
  showToast("Tizimdan chiqildi!");
}

if (settingsLogoutBtn) {
  settingsLogoutBtn.addEventListener('click', () => {
    logoutUser();
    if (settingsModal) settingsModal.classList.remove('active');
  });
}

if (closeAuthModalBtn) {
  closeAuthModalBtn.addEventListener('click', () => {
    if (!currentUser) {
      alert("Tizimdan foydalanish uchun iltimos ro'yxatdan o'ting yoki tizimga kiring!");
      return;
    }
    if (authModal) authModal.classList.remove('active');
  });
}

if (authModal) {
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) {
      if (!currentUser) return; // Disallow closing if not authenticated
      authModal.classList.remove('active');
    }
  });
}

// ==========================================================================
// UZBEK PHONE NUMBER AUTO-FORMATTER & STRICT VALIDATOR (+998...)
// ==========================================================================
const VALID_UZ_OPERATORS = ['90', '91', '93', '94', '95', '97', '98', '99', '33', '88', '77', '50', '20'];

function formatUzbekPhone(value) {
  if (!value) return '';
  let raw = value.replace(/\D/g, '');
  if (raw.startsWith('998')) {
    raw = raw.slice(3);
  }
  raw = raw.slice(0, 9);

  if (raw.length === 0) return '+998 ';
  if (raw.length <= 2) return '+998 (' + raw;
  if (raw.length <= 5) return '+998 (' + raw.slice(0, 2) + ') ' + raw.slice(2);
  if (raw.length <= 7) return '+998 (' + raw.slice(0, 2) + ') ' + raw.slice(2, 5) + '-' + raw.slice(5);
  return '+998 (' + raw.slice(0, 2) + ') ' + raw.slice(2, 5) + '-' + raw.slice(5, 7) + '-' + raw.slice(7, 9);
}

function isValidUzbekPhone(phoneStr) {
  if (!phoneStr) return false;
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length !== 12 || !digits.startsWith('998')) {
    return false;
  }
  const local = digits.slice(3); // 9 digits
  const op = local.slice(0, 2);
  if (!VALID_UZ_OPERATORS.includes(op)) {
    return false;
  }
  const sub = local.slice(2); // 7 digits
  // Reject repetitive numbers like 0000000, 1111111, 7777777, etc.
  if (/^(\d)\1{6}$/.test(sub)) {
    return false;
  }
  if (sub === '1234567' || sub === '7654321' || sub === '0123456') {
    return false;
  }
  return true;
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) return false;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1];
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;

  if (['example.com', 'test.com', 'test.uz', 'sample.com'].includes(domain)) return false;
  return true;
}

// Bind auto-formatter to phone inputs
const googleCustomPhoneInput = document.getElementById('googleCustomPhoneInput');
const googlePhoneGroup = document.getElementById('googlePhoneGroup');

[authPhoneInput, googleCustomPhoneInput].forEach(inp => {
  if (inp) {
    inp.addEventListener('focus', () => {
      if (!inp.value || inp.value.trim() === '') {
        inp.value = '+998 ';
      }
    });
    inp.addEventListener('input', () => {
      inp.value = formatUzbekPhone(inp.value);
    });
  }
});

// ==========================================================================
// DEVICE KNOWN ACCOUNTS ENGINE (Only remember accounts used on THIS device)
// ==========================================================================
const STORAGE_DEVICE_ACCOUNTS_KEY = 'biznes_device_known_accounts_v3';

function getDeviceKnownAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_DEVICE_ACCOUNTS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return list.filter(u => (u && u.email || '').toLowerCase() !== 'oydinoy@gmail.com');
      }
    }
  } catch (e) {}
  return [];
}

function addAccountToDeviceHistory(userObj) {
  if (!userObj || !userObj.email) return;
  // Oydinoy (Admin) hisobi hech qachon ommaviy qurilma ro'yxatiga yozilmaydi
  if ((userObj.email || '').toLowerCase() === 'oydinoy@gmail.com') return;
  const list = getDeviceKnownAccounts();
  const filtered = list.filter(a => (a.email || '').toLowerCase() !== (userObj.email || '').toLowerCase());
  filtered.unshift({
    name: userObj.name,
    email: userObj.email,
    phone: userObj.phone || '',
    role: userObj.role || 'user'
  });
  localStorage.setItem(STORAGE_DEVICE_ACCOUNTS_KEY, JSON.stringify(filtered.slice(0, 5)));
}

// ==========================================================================
// GOOGLE ACCOUNT CHOOSER ENGINE (SECURE & ROLE-PROTECTED)
// ==========================================================================
const googleChooserModal = document.getElementById('googleChooserModal');
const closeGoogleChooserBtn = document.getElementById('closeGoogleChooserBtn');
const googleAccountsList = document.getElementById('googleAccountsList');
const googleAddAnotherBox = document.getElementById('googleAddAnotherBox');
const googleCustomEmailInput = document.getElementById('googleCustomEmailInput');
const googleCustomSubmitBtn = document.getElementById('googleCustomSubmitBtn');

function openGoogleChooser() {
  const isRegister = authMode === 'register';
  const chooserHeader = document.querySelector('#googleChooserModal span[style*="font-weight: 700"]');
  if (chooserHeader) {
    chooserHeader.textContent = isRegister ? "Google orqali ro'yxatdan o'tish" : "Google hisobingizni tanlang";
  }

  if (googlePhoneGroup) {
    googlePhoneGroup.style.display = isRegister ? 'block' : 'none';
  }
  if (googleCustomSubmitBtn) {
    googleCustomSubmitBtn.textContent = isRegister ? "Ro'yxatdan o'tish" : "Kirish";
  }

  renderGoogleAccountsList();

  const accounts = getAvailableGoogleAccounts();
  if (accounts.length === 0 || isRegister) {
    if (googleAddAnotherBox) googleAddAnotherBox.style.display = 'block';
  } else {
    if (googleAddAnotherBox) googleAddAnotherBox.style.display = 'none';
  }

  if (googleCustomEmailInput) googleCustomEmailInput.value = '';
  if (googleCustomPhoneInput) googleCustomPhoneInput.value = '';
  if (googleChooserModal) googleChooserModal.classList.add('active');
}

function closeGoogleChooser() {
  if (googleChooserModal) googleChooserModal.classList.remove('active');
}

if (closeGoogleChooserBtn) {
  closeGoogleChooserBtn.addEventListener('click', closeGoogleChooser);
}

if (googleChooserModal) {
  googleChooserModal.addEventListener('click', (e) => {
    if (e.target === googleChooserModal) closeGoogleChooser();
  });
}

function getAvailableGoogleAccounts() {
  const regUsers = getRegisteredUsers();
  const devAccounts = getDeviceKnownAccounts();
  const map = new Map();

  // Oydinoy (Admin) hisobi QAT'IYAN bu ommaviy ro'yxatga kiritilmaydi!
  devAccounts.forEach(u => {
    if (u && u.email && u.email.toLowerCase() !== 'oydinoy@gmail.com') {
      map.set(u.email.toLowerCase(), u);
    }
  });

  // Tizimda ro'yxatdan o'tgan foydalanuvchilar (Oydinoy chiqarib tashlanadi)
  regUsers.forEach(u => {
    if (u && u.email && u.email.toLowerCase() !== 'oydinoy@gmail.com') {
      const emailLower = u.email.toLowerCase();
      if (!map.has(emailLower)) {
        map.set(emailLower, {
          name: u.name || emailLower.split('@')[0],
          email: u.email,
          phone: u.phone || '',
          role: u.role || 'user'
        });
      }
    }
  });

  return Array.from(map.values());
}

function renderGoogleAccountsList() {
  if (!googleAccountsList) return;
  const accounts = getAvailableGoogleAccounts();
  const avatarColors = ['#1a73e8', '#ea4335', '#fbbc05', '#34a853', '#9334e8', '#e91e63'];
  const chooserSub = document.querySelector('#googleChooserModal p');

  let html = '';

  if (accounts.length === 0) {
    html = '';
    if (chooserSub) {
      chooserSub.innerHTML = "Google hisobingiz bilan tizimga kirish uchun emailingizni kiriting:";
    }
    if (googleAddAnotherBox) {
      googleAddAnotherBox.style.display = 'block';
    }
  } else {
    if (chooserSub) {
      chooserSub.innerHTML = "<strong>Biznes Hisobchi</strong> tizimiga kirish uchun hisobingiz ustiga bosing:";
    }
    accounts.forEach((u, idx) => {
      const email = u.email || '';
      const name = u.name || email.split('@')[0] || 'Foydalanuvchi';
      const initial = (name.charAt(0) || 'G').toUpperCase();
      const color = avatarColors[idx % avatarColors.length];

      html += `
        <div class="google-account-item" data-email="${email}">
          <div class="google-avatar" style="background: ${color};">
            ${initial}
          </div>
          <div class="google-account-details">
            <div class="google-account-name">
              ${name}
            </div>
            <div class="google-account-email">${email}</div>
          </div>
          <div class="google-account-arrow">›</div>
        </div>
      `;
    });

    html += `
      <div class="google-account-item" id="googleAddAnotherBtn" style="border-style: dashed; background: #fbfcfe;">
        <div class="google-avatar" style="background: #e8f0fe; color: #1a73e8; font-size: 1.15rem; font-weight: 700;">
          ➕
        </div>
        <div class="google-account-details">
          <div class="google-account-name" style="color: #1a73e8;">Boshqa hisobdan foydalanish</div>
          <div class="google-account-email">Yangi Google hisob kiritish</div>
        </div>
        <div class="google-account-arrow" style="color: #1a73e8;">›</div>
      </div>
    `;
  }

  googleAccountsList.innerHTML = html;

  googleAccountsList.querySelectorAll('.google-account-item[data-email]').forEach(item => {
    item.addEventListener('click', () => {
      const email = item.getAttribute('data-email');
      const users = getRegisteredUsers();
      const targetUser = users.find(u => (u.email || '').toLowerCase() === (email || '').toLowerCase());

      if (!targetUser) {
        alert("❌ Ushbu hisob hali ro'yxatdan o'tmagan!\n\nIltimos, avval ro'yxatdan o'ting.");
        closeGoogleChooser();
        setAuthMode('register');
        if (authEmailInput) authEmailInput.value = email;
        return;
      }

      openGooglePasswordModal(targetUser);
    });
  });

  const addBtn = document.getElementById('googleAddAnotherBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (googleAddAnotherBox) {
        googleAddAnotherBox.style.display = googleAddAnotherBox.style.display === 'none' ? 'block' : 'none';
        if (googleCustomEmailInput && googleAddAnotherBox.style.display === 'block') {
          googleCustomEmailInput.focus();
        }
      }
    });
  }
}

// ==========================================================================
// GOOGLE HISOBI PAROLINI SO'RASH MODALI
// ==========================================================================
const googlePasswordModal = document.getElementById('googlePasswordModal');
const closeGooglePasswordModalBtn = document.getElementById('closeGooglePasswordModalBtn');
const googlePasswordAvatar = document.getElementById('googlePasswordAvatar');
const googlePasswordName = document.getElementById('googlePasswordName');
const googlePasswordEmail = document.getElementById('googlePasswordEmail');
const googleAccountPasswordInput = document.getElementById('googleAccountPasswordInput');
const googlePasswordSubmitBtn = document.getElementById('googlePasswordSubmitBtn');
const googleForgotPasswordLink = document.getElementById('googleForgotPasswordLink');

let selectedGoogleTargetUser = null;

function openGooglePasswordModal(targetUser) {
  selectedGoogleTargetUser = targetUser;
  if (!selectedGoogleTargetUser) return;

  if (googlePasswordName) googlePasswordName.textContent = targetUser.name || 'Foydalanuvchi';
  if (googlePasswordEmail) googlePasswordEmail.textContent = targetUser.email;
  if (googlePasswordAvatar) {
    const isOydin = (targetUser.email || '').toLowerCase() === 'oydinoy@gmail.com';
    googlePasswordAvatar.textContent = isOydin ? '⭐' : ((targetUser.name || 'G').charAt(0).toUpperCase());
    googlePasswordAvatar.style.background = isOydin ? 'linear-gradient(135deg, #f59e0b, #d97706)' : '#1a73e8';
  }
  if (googleAccountPasswordInput) {
    googleAccountPasswordInput.value = '';
  }

  closeGoogleChooser();
  if (googlePasswordModal) googlePasswordModal.classList.add('active');
  setTimeout(() => {
    if (googleAccountPasswordInput) googleAccountPasswordInput.focus();
  }, 100);
}

function closeGooglePasswordModal() {
  if (googlePasswordModal) googlePasswordModal.classList.remove('active');
  selectedGoogleTargetUser = null;
}

if (closeGooglePasswordModalBtn) {
  closeGooglePasswordModalBtn.addEventListener('click', closeGooglePasswordModal);
}
if (googlePasswordModal) {
  googlePasswordModal.addEventListener('click', (e) => {
    if (e.target === googlePasswordModal) closeGooglePasswordModal();
  });
}

function submitGoogleAccountPassword() {
  if (!selectedGoogleTargetUser) return;
  const inputPass = googleAccountPasswordInput ? googleAccountPasswordInput.value.trim() : '';
  const emailLower = (selectedGoogleTargetUser.email || '').toLowerCase();
  const isOydin = emailLower === 'oydinoy@gmail.com';
  const expectedPass = isOydin ? 'oydinoy1234' : (selectedGoogleTargetUser.password || '123');

  if (!inputPass) {
    alert("Iltimos, parolingizni kiriting!");
    if (googleAccountPasswordInput) googleAccountPasswordInput.focus();
    return;
  }

  if (inputPass !== expectedPass) {
    alert("❌ Parol noto'g'ri!\n\nIltimos, ushbu hisobga tegishli to'g'ri parolni kiriting yoki 'Parolni unutdingizmi?' orqali yangilang.");
    if (googleAccountPasswordInput) googleAccountPasswordInput.select();
    return;
  }

  const target = selectedGoogleTargetUser;
  closeGooglePasswordModal();
  addAccountToDeviceHistory(target);
  signInWithUser(target);
}

if (googlePasswordSubmitBtn) {
  googlePasswordSubmitBtn.addEventListener('click', submitGoogleAccountPassword);
}
if (googleAccountPasswordInput) {
  googleAccountPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitGoogleAccountPassword();
    }
  });
}
if (googleForgotPasswordLink) {
  googleForgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    const accountEmail = selectedGoogleTargetUser ? selectedGoogleTargetUser.email : '';
    closeGooglePasswordModal();
    openForgotPasswordModal(accountEmail);
  });
}

// ==========================================================================
// PAROLNI TIKLASH: TEKIN SMS KOD TIZIMI
// ==========================================================================
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const forgotPasswordModal = document.getElementById('forgotPasswordModal');
const closeForgotModalBtn = document.getElementById('closeForgotModalBtn');
const forgotStep1 = document.getElementById('forgotStep1');
const forgotStep2 = document.getElementById('forgotStep2');
const forgotStep3 = document.getElementById('forgotStep3');
const forgotAccountInput = document.getElementById('forgotAccountInput');
const forgotSendCodeBtn = document.getElementById('forgotSendCodeBtn');
const forgotTargetPhoneDisplay = document.getElementById('forgotTargetPhoneDisplay');
const forgotSmsCodeInput = document.getElementById('forgotSmsCodeInput');
const forgotVerifyCodeBtn = document.getElementById('forgotVerifyCodeBtn');
const forgotCountdownText = document.getElementById('forgotCountdownText');
const forgotTimerSec = document.getElementById('forgotTimerSec');
const forgotResendBtn = document.getElementById('forgotResendBtn');
const forgotNewPassInput = document.getElementById('forgotNewPassInput');
const forgotConfirmPassInput = document.getElementById('forgotConfirmPassInput');
const forgotSavePassBtn = document.getElementById('forgotSavePassBtn');

const smsNotificationBanner = document.getElementById('smsNotificationBanner');
const closeSmsBannerBtn = document.getElementById('closeSmsBannerBtn');
const smsPushMessageText = document.getElementById('smsPushMessageText');
const smsPushAutoFillBtn = document.getElementById('smsPushAutoFillBtn');

let currentPasswordReset = null;
let resetTimerInterval = null;

function maskPhoneNumber(phone) {
  if (!phone) return '+998 (90) ***-**-**';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 12) return phone;
  const op = clean.slice(3, 5);
  const last2 = clean.slice(-2);
  return `+998 (${op}) ***-**-${last2}`;
}

function openForgotPasswordModal(prefill = '') {
  if (authModal) authModal.classList.remove('active');
  if (googleChooserModal) googleChooserModal.classList.remove('active');
  if (googlePasswordModal) googlePasswordModal.classList.remove('active');

  if (forgotStep1) forgotStep1.style.display = 'block';
  if (forgotStep2) forgotStep2.style.display = 'none';
  if (forgotStep3) forgotStep3.style.display = 'none';
  if (forgotAccountInput) forgotAccountInput.value = prefill || (authEmailInput ? authEmailInput.value.trim() : '');
  if (forgotPasswordModal) forgotPasswordModal.classList.add('active');
  setTimeout(() => {
    if (forgotAccountInput) forgotAccountInput.focus();
  }, 100);
}

function closeForgotPasswordModal() {
  if (forgotPasswordModal) forgotPasswordModal.classList.remove('active');
  if (smsNotificationBanner) smsNotificationBanner.style.display = 'none';
  if (resetTimerInterval) clearInterval(resetTimerInterval);
  currentPasswordReset = null;
}

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    openForgotPasswordModal();
  });
}
if (closeForgotModalBtn) {
  closeForgotModalBtn.addEventListener('click', closeForgotPasswordModal);
}
if (forgotPasswordModal) {
  forgotPasswordModal.addEventListener('click', (e) => {
    if (e.target === forgotPasswordModal) closeForgotPasswordModal();
  });
}

function startSmsCountdown() {
  if (resetTimerInterval) clearInterval(resetTimerInterval);
  let timeLeft = 60;
  if (forgotTimerSec) forgotTimerSec.textContent = timeLeft.toString();
  if (forgotResendBtn) forgotResendBtn.disabled = true;

  resetTimerInterval = setInterval(() => {
    timeLeft -= 1;
    if (forgotTimerSec) forgotTimerSec.textContent = timeLeft.toString();
    if (timeLeft <= 0) {
      clearInterval(resetTimerInterval);
      if (forgotResendBtn) forgotResendBtn.disabled = false;
      if (forgotCountdownText) forgotCountdownText.textContent = "Kodni qayta so'rashingiz mumkin:";
    }
  }, 1000);
}

function triggerSmsSend() {
  const query = (forgotAccountInput ? forgotAccountInput.value.trim() : '').toLowerCase();
  if (!query) {
    alert("Iltimos, telefon raqamingiz yoki emailingizni kiriting!");
    if (forgotAccountInput) forgotAccountInput.focus();
    return;
  }

  const cleanDigits = query.replace(/\D/g, '');
  const users = getRegisteredUsers();

  const targetUser = users.find(u => {
    const emailMatch = (u.email || '').toLowerCase() === query;
    const phoneDigits = (u.phone || '').replace(/\D/g, '');
    const phoneMatch = cleanDigits.length >= 9 && (phoneDigits === cleanDigits || phoneDigits.endsWith(cleanDigits));
    return emailMatch || phoneMatch;
  });

  if (!targetUser) {
    alert("❌ Ushbu email yoki telefon raqami bilan ro'yxatdan o'tgan hisob topilmadi!\n\nIltimos, ma'lumotlaringizni to'g'ri kiritganingizga ishonch hosil qiling.");
    return;
  }

  // 6 xonali tasdiqlash kodi generatsiyasi
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const phoneToUse = targetUser.phone || (cleanDigits.length >= 9 ? formatUzbekPhone(cleanDigits) : '+998 (90) 123-45-67');

  currentPasswordReset = {
    user: targetUser,
    code: code,
    phone: phoneToUse,
    expires: Date.now() + 5 * 60 * 1000
  };

  // Push SMS bildirishnomasini ko'rsatish
  if (smsPushMessageText) {
    smsPushMessageText.innerHTML = `Parolni tiklash tasdiqlash kodi: <strong>${code}</strong>. Hech kimga bermang!`;
  }
  if (smsNotificationBanner) {
    smsNotificationBanner.style.display = 'block';
  }

  if (forgotTargetPhoneDisplay) {
    forgotTargetPhoneDisplay.textContent = maskPhoneNumber(phoneToUse);
  }

  if (forgotStep1) forgotStep1.style.display = 'none';
  if (forgotStep2) forgotStep2.style.display = 'block';
  if (forgotSmsCodeInput) {
    forgotSmsCodeInput.value = '';
    setTimeout(() => forgotSmsCodeInput.focus(), 100);
  }

  startSmsCountdown();
  showToast(`📲 Tasdiqlash kodi SMS orqali yuborildi!`);
}

if (forgotSendCodeBtn) {
  forgotSendCodeBtn.addEventListener('click', triggerSmsSend);
}
if (forgotResendBtn) {
  forgotResendBtn.addEventListener('click', triggerSmsSend);
}

if (closeSmsBannerBtn) {
  closeSmsBannerBtn.addEventListener('click', () => {
    if (smsNotificationBanner) smsNotificationBanner.style.display = 'none';
  });
}

if (smsPushAutoFillBtn) {
  smsPushAutoFillBtn.addEventListener('click', () => {
    if (currentPasswordReset && currentPasswordReset.code && forgotSmsCodeInput) {
      forgotSmsCodeInput.value = currentPasswordReset.code;
      if (smsNotificationBanner) smsNotificationBanner.style.display = 'none';
      if (forgotVerifyCodeBtn) forgotVerifyCodeBtn.click();
    }
  });
}

if (forgotVerifyCodeBtn) {
  forgotVerifyCodeBtn.addEventListener('click', () => {
    if (!currentPasswordReset) {
      alert("Sessiya eskirgan, iltimos qaytadan urinib ko'ring!");
      openForgotPasswordModal();
      return;
    }
    const entered = forgotSmsCodeInput ? forgotSmsCodeInput.value.replace(/\D/g, '') : '';
    if (!entered || entered.length !== 6) {
      alert("Iltimos, 6 xonali SMS tasdiqlash kodini to'liq kiriting!");
      if (forgotSmsCodeInput) forgotSmsCodeInput.focus();
      return;
    }

    if (Date.now() > currentPasswordReset.expires) {
      alert("❌ SMS kodning amal qilish muddati tugagan! Qaytadan kod so'rang.");
      return;
    }

    if (entered !== currentPasswordReset.code) {
      alert("❌ Noto'g'ri SMS kod kiritildi! Iltimos, SMS xabarda kelgan kodni kiriting.");
      if (forgotSmsCodeInput) forgotSmsCodeInput.select();
      return;
    }

    // Kod to'g'ri -> 3-qadamga o'tish
    if (smsNotificationBanner) smsNotificationBanner.style.display = 'none';
    if (forgotStep2) forgotStep2.style.display = 'none';
    if (forgotStep3) forgotStep3.style.display = 'block';
    if (forgotNewPassInput) {
      forgotNewPassInput.value = '';
      setTimeout(() => forgotNewPassInput.focus(), 100);
    }
    if (forgotConfirmPassInput) forgotConfirmPassInput.value = '';
  });
}

if (forgotSavePassBtn) {
  forgotSavePassBtn.addEventListener('click', () => {
    if (!currentPasswordReset || !currentPasswordReset.user) {
      alert("Sessiya xatosi! Qaytadan urinib ko'ring.");
      return;
    }
    const p1 = forgotNewPassInput ? forgotNewPassInput.value.trim() : '';
    const p2 = forgotConfirmPassInput ? forgotConfirmPassInput.value.trim() : '';

    if (!p1 || p1.length < 4) {
      alert("❌ Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak!");
      if (forgotNewPassInput) forgotNewPassInput.focus();
      return;
    }
    if (p1 !== p2) {
      alert("❌ Kiritilgan parollar bir-biriga mos kelmadi! Iltimos, ikkala maydonda ham bir xil parol yozing.");
      if (forgotConfirmPassInput) forgotConfirmPassInput.focus();
      return;
    }

    const userToUpdate = currentPasswordReset.user;
    userToUpdate.password = p1;
    saveRegisteredUser(userToUpdate);

    alert("✅ Parolingiz muvaffaqiyatli yangilandi!\n\nEndi yangi parolingiz bilan tizimga kirdingiz.");
    closeForgotPasswordModal();
    addAccountToDeviceHistory(userToUpdate);
    signInWithUser(userToUpdate);
  });
}

function signInWithUser(userObj) {
  currentUser = userObj;
  saveCurrentUserSession();
  authRendered = false;
  closeGoogleChooser();
  closeGooglePasswordModal();
  closeForgotPasswordModal();
  if (authModal) authModal.classList.remove('active');
  if (appContent) appContent.classList.remove('blurred');
  checkAuthAndRender();
  renderPricingCards();
  updatePlanBadgeUI();
  updateCommunityCounterUI();
  renderUI();
  showToast(`🎉 Xush kelibsiz, ${currentUser.name}!`);
}

if (googleCustomSubmitBtn && googleCustomEmailInput) {
  googleCustomSubmitBtn.addEventListener('click', () => {
    const rawEmail = googleCustomEmailInput.value.trim().toLowerCase();
    if (!isValidEmail(rawEmail)) {
      alert("❌ Noto'g'ri yoki mavjud bo'lmagan email kiritildi!\n\nIltimos, haqiqiy email manzilingizni kiriting (Masalan: ism@gmail.com).");
      googleCustomEmailInput.focus();
      return;
    }

    const users = getRegisteredUsers();
    let existing = users.find(u => (u.email || '').toLowerCase() === rawEmail);

    if (authMode === 'login') {
      // KIRISH REJIMIDA: Agar hisob ro'yxatdan o'tmagan bo'lsa, qat'iyan kiritilmaydi!
      if (!existing) {
        alert("❌ Ushbu hisob hali ro'yxatdan o'tmagan!\n\nIltimos, avval ro'yxatdan o'ting.");
        closeGoogleChooser();
        setAuthMode('register');
        if (authEmailInput) authEmailInput.value = rawEmail;
        return;
      }

      openGooglePasswordModal(existing);
    } else {
      // RO'YXATDAN O'TISH REJIMIDA:
      if (existing) {
        alert("ℹ️ Ushbu email allaqachon ro'yxatdan o'tgan!\n\nTizimga kirish bo'limiga o'tkazilmoqda...");
        closeGoogleChooser();
        setAuthMode('login');
        if (authEmailInput) authEmailInput.value = rawEmail;
        return;
      }

      const phoneVal = googleCustomPhoneInput ? googleCustomPhoneInput.value.trim() : '';
      if (!isValidUzbekPhone(phoneVal)) {
        alert("❌ Iltimos, haqiqiy O'zbekiston telefon raqamini kiriting!\nOperator kodlari: 90, 91, 93, 94, 95, 97, 98, 99, 33, 88, 77, 50, 20\nNamuna: +998 (90) 123-45-67");
        if (googleCustomPhoneInput) googleCustomPhoneInput.focus();
        return;
      }

      const pass = prompt("🔑 Ushbu yangi Google hisobingiz uchun parol o'rnating (kamida 4 belgi):");
      if (!pass || pass.trim().length < 4) {
        alert("❌ Parol kamida 4 ta belgidan iborat bo'lishi kerak! Ro'yxatdan o'tish bekor qilindi.");
        return;
      }

      const isOydin = rawEmail === 'oydinoy@gmail.com';
      const cleanName = isOydin ? 'Oydinoy' : (rawEmail.split('@')[0] || "Foydalanuvchi");
      const newUser = {
        id: isOydin ? 'oydinoy' : ('google_' + Date.now()),
        name: cleanName,
        email: rawEmail,
        phone: phoneVal,
        password: isOydin ? 'oydinoy1234' : pass.trim(),
        role: isOydin ? 'admin' : 'user',
        roleLabel: isOydin ? '⭐ Oydinoy (Maxsus)' : '🌱 Oddiy Aholi (10 ta)',
        createdAt: new Date().toISOString()
      };
      saveRegisteredUser(newUser);
      addAccountToDeviceHistory(newUser);
      updateCommunityCounterUI();
      signInWithUser(newUser);
    }
  });

  googleCustomEmailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      googleCustomSubmitBtn.click();
    }
  });
}

// GOOGLE AUTH BUTTON BOSILGANDA
if (googleAuthActionBtn) {
  googleAuthActionBtn.addEventListener('click', openGoogleChooser);
}

// EMAIL / PASSWORD FORM SUBMIT (KIRISH & RO'YXATDAN O'TISH)
if (authMainForm) {
  authMainForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailVal = (authEmailInput ? authEmailInput.value.trim() : '').toLowerCase();
    const passVal = authPasswordInput ? authPasswordInput.value.trim() : '';
    const nameVal = authNameInput ? authNameInput.value.trim() : '';
    const phoneVal = authPhoneInput ? authPhoneInput.value.trim() : '';

    if (!emailVal) {
      alert("Iltimos, email yoki telefon raqamingizni kiriting!");
      if (authEmailInput) authEmailInput.focus();
      return;
    }

    const users = getRegisteredUsers();

    if (authMode === 'login') {
      // Check email format if it contains @
      if (emailVal.includes('@') && !isValidEmail(emailVal)) {
        alert("❌ Noto'g'ri email formati!\n\nIltimos, haqiqiy emailingizni to'g'ri kiriting (Masalan: ism@gmail.com).");
        if (authEmailInput) authEmailInput.focus();
        return;
      }

      const cleanDigits = emailVal.replace(/\D/g, '');
      const existing = users.find(u => {
        const emailMatch = (u.email || '').toLowerCase() === emailVal;
        const phoneDigits = (u.phone || '').replace(/\D/g, '');
        const phoneMatch = cleanDigits.length >= 9 && (phoneDigits === cleanDigits || phoneDigits.endsWith(cleanDigits));
        return emailMatch || phoneMatch;
      });

      if (!existing) {
        alert("❌ Ushbu hisob hali ro'yxatdan o'tmagan!\n\nIltimos, avval ro'yxatdan o'ting.");
        setAuthMode('register');
        if (authEmailInput) authEmailInput.value = emailVal;
        return;
      }

      if (existing.password && passVal !== existing.password) {
        alert("❌ Parol noto'g'ri!\n\nUshbu hisob uchun o'rnatilgan to'g'ri parolni kiriting yoki 'Parolni unutdingizmi?' havolasi orqali parolni yangilang.");
        if (authPasswordInput) authPasswordInput.focus();
        return;
      }

      currentUser = existing;
      saveCurrentUserSession();
      addAccountToDeviceHistory(existing);
      authRendered = false;
      checkAuthAndRender();
      renderPricingCards();
      updatePlanBadgeUI();
      updateCommunityCounterUI();
      renderUI();
      showToast(`🎉 Xush kelibsiz, ${currentUser.name}!`);
    } else {
      // Ro'yxatdan o'tish
      if (!nameVal) {
        alert("Iltimos, ismingizni kiriting!");
        if (authNameInput) authNameInput.focus();
        return;
      }

      if (!isValidUzbekPhone(phoneVal)) {
        alert("❌ Iltimos, haqiqiy O'zbekiston telefon raqamini kiriting!\nOperator kodlari: 90, 91, 93, 94, 95, 97, 98, 99, 33, 88, 77, 50, 20\nNamuna: +998 (90) 123-45-67");
        if (authPhoneInput) authPhoneInput.focus();
        return;
      }

      if (!isValidEmail(emailVal)) {
        alert("❌ Noto'g'ri yoki mavjud bo'lmagan email manzil kiritildi!\n\nIltimos, to'g'ri va haqiqiy email manzilingizni kiriting (Masalan: sizning_ismingiz@gmail.com).");
        if (authEmailInput) authEmailInput.focus();
        return;
      }

      if (!passVal || passVal.length < 4) {
        alert("❌ Iltimos, kamida 4 ta belgidan iborat parol o'ylab toping va kiriting!");
        if (authPasswordInput) authPasswordInput.focus();
        return;
      }

      const existing = users.find(u => (u.email || '').toLowerCase() === emailVal);
      if (existing) {
        alert("ℹ️ Bu email allaqachon ro'yxatdan o'tgan!\n\nTizimga kirish bo'limiga o'ting.");
        setAuthMode('login');
        if (authEmailInput) authEmailInput.value = emailVal;
        return;
      }

      const isOydin = emailVal === 'oydinoy@gmail.com';
      const finalName = isOydin ? 'Oydinoy' : (nameVal || emailVal.split('@')[0] || "Foydalanuvchi");

      const newUser = {
        id: isOydin ? 'oydinoy' : ('user_' + Date.now()),
        name: finalName,
        phone: phoneVal,
        email: emailVal,
        password: passVal,
        role: isOydin ? 'admin' : 'user',
        roleLabel: isOydin ? '⭐ Oydinoy (Maxsus)' : '🌱 Oddiy Aholi (10 ta)',
        createdAt: new Date().toISOString()
      };

      saveRegisteredUser(newUser);
      currentUser = newUser;
      saveCurrentUserSession();
      addAccountToDeviceHistory(newUser);
      authRendered = false;
      checkAuthAndRender();
      renderPricingCards();
      updatePlanBadgeUI();
      updateCommunityCounterUI();
      renderUI();

      if (isOydin) {
        showToast("🎉 Xush kelibsiz Oydinoy! 500 ta bepul limit va 40 000 so'mlik cheksiz tarif faol!");
      } else {
        showToast(`🎉 Muvaffaqiyatli ro'yxatdan o'tdingiz, ${currentUser.name}! 10 ta bepul mahsulot kiritishingiz mumkin.`);
      }
    }
  });
}

// --- GOAL MODAL ---
if (editGoalBtn) {
  editGoalBtn.addEventListener('click', () => {
    if (goalInputAmount) goalInputAmount.value = monthlyGoal;
    if (goalModal) goalModal.classList.add('active');
  });
}

if (closeGoalModalBtn) {
  closeGoalModalBtn.addEventListener('click', () => {
    if (goalModal) goalModal.classList.remove('active');
  });
}

if (goalForm) {
  goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newGoal = parseSmartNumber(goalInputAmount.value);
    if (newGoal <= 0) {
      alert("Iltimos to'g'ri summa kiriting!");
      return;
    }
    monthlyGoal = newGoal;
    saveMonthlyGoal();
    if (goalModal) goalModal.classList.remove('active');
    renderUI();
    showToast("Oylik maqsad yangilandi!");
  });
}

// --- MATHEMATICAL CALCULATION LOGIC ---
function calculateItemMetrics(buyPrice, cargoPrice, sellPrice, quantity) {
  const buy = Math.max(0, parseSmartNumber(buyPrice));
  const cargo = Math.max(0, parseSmartNumber(cargoPrice));
  const sell = Math.max(0, parseSmartNumber(sellPrice));
  const qty = Math.max(1, Math.round(parseSmartNumber(quantity)) || 1);

  const singleCost = Math.round((buy + cargo) * 100) / 100;
  const totalCost = Math.round((singleCost * qty) * 100) / 100;
  const totalRevenue = Math.round((sell * qty) * 100) / 100;
  const netProfit = Math.round((totalRevenue - totalCost) * 100) / 100;

  return { buy, cargo, sell, qty, singleCost, totalCost, totalRevenue, netProfit };
}

// --- BUTTERY SMOOTH LIVE PREVIEW (REQUEST ANIMATION FRAME) ---
let livePreviewRaf = null;
function updateLivePreview() {
  if (livePreviewRaf) cancelAnimationFrame(livePreviewRaf);
  livePreviewRaf = requestAnimationFrame(() => {
    const buy = buyPriceInput ? buyPriceInput.value : 0;
    const cargo = cargoPriceInput ? cargoPriceInput.value : 0;
    const sell = sellPriceInput ? sellPriceInput.value : 0;
    const qty = quantityInput ? quantityInput.value : 1;

    const metrics = calculateItemMetrics(buy, cargo, sell, qty);

    if (previewSingleCost) previewSingleCost.textContent = formatCurrency(metrics.singleCost);
    if (previewTotalCost) previewTotalCost.textContent = formatCurrency(metrics.totalCost);
    if (previewProfit) {
      previewProfit.textContent = formatCurrency(metrics.netProfit);
      previewProfit.style.color = metrics.netProfit >= 0 ? 'var(--success)' : 'var(--danger)';
    }
  });
}

// --- POPULATE MONTH DROPDOWN (ONLY WHEN NEEDED) ---
function populateMonthFilterDropdown() {
  if (!monthSelectFilter) return;
  const monthsMap = new Map();

  products.forEach(item => {
    const d = new Date(item.createdAt || Date.now());
    const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' });
    monthsMap.set(yearMonthKey, monthLabel);
  });

  const selectedVal = monthSelectFilter.value || 'all';
  let html = `<option value="all">Barcha oylar</option>`;

  monthsMap.forEach((label, key) => {
    const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
    html += `<option value="${key}">${capitalized}</option>`;
  });

  monthSelectFilter.innerHTML = html;
  monthSelectFilter.value = selectedVal;
}

if (monthSelectFilter) {
  monthSelectFilter.addEventListener('change', (e) => {
    activeMonthFilter = e.target.value;
    renderUI();
  });
}

// --- HERO COMMUNITY USERS COUNTER ENGINE (100% HAQIQIY STATISTIKA) ---
const STORAGE_VISITS_KEY = 'biznes_real_visits_v3';

function getRealVisitsCount() {
  let count = parseInt(localStorage.getItem(STORAGE_VISITS_KEY) || '0', 10);
  if (!sessionStorage.getItem('biznes_session_counted_v3')) {
    count += 1;
    localStorage.setItem(STORAGE_VISITS_KEY, count.toString());
    sessionStorage.setItem('biznes_session_counted_v3', '1');
  }
  return Math.max(1, count);
}

function updateCommunityCounterUI() {
  const totalUsersEl = document.getElementById('heroTotalUsersCount');
  const totalUsersLabelEl = document.getElementById('heroTotalUsersLabel');
  const onlineUsersEl = document.getElementById('heroOnlineUsersCount');
  const totalVisitsEl = document.getElementById('heroTotalVisitsCount');
  if (!totalUsersEl) return;

  // Haqiqiy ro'yxatdan o'tganlar soni
  const regCount = getRegisteredUsers().length;
  totalUsersEl.textContent = regCount.toLocaleString('uz-UZ');

  if (totalUsersLabelEl) {
    totalUsersLabelEl.textContent = regCount === 1 ? "nafar ro'yxatdan o'tgan foydalanuvchi" : "nafar ro'yxatdan o'tgan foydalanuvchilar";
  }

  if (onlineUsersEl) {
    onlineUsersEl.textContent = "1";
  }

  if (totalVisitsEl) {
    totalVisitsEl.textContent = getRealVisitsCount().toString();
  }
}

setInterval(updateCommunityCounterUI, 10000);

// --- RENDER MAIN UI (HIGH PERFORMANCE BATCHED ENGINE) ---
function renderUI() {
  checkAuthAndRender();

  const query = searchQuery.toLowerCase();
  const today = new Date();
  const todayDateStr = today.toDateString();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // Fast single-pass filtering & aggregation
  let grandRevenue = 0;
  let grandCost = 0;
  let grandProfit = 0;

  const filteredProducts = [];

  for (let i = 0; i < products.length; i++) {
    const item = products[i];
    if (query && !item.name.toLowerCase().includes(query)) continue;

    const itemDate = new Date(item.createdAt || Date.now());

    if (activeMonthFilter !== 'all') {
      const [filterYear, filterMonth] = activeMonthFilter.split('-');
      if (itemDate.getFullYear() !== parseInt(filterYear) || (itemDate.getMonth() + 1) !== parseInt(filterMonth)) {
        continue;
      }
    }

    if (activeFilter === 'today') {
      if (itemDate.toDateString() !== todayDateStr) continue;
    } else if (activeFilter === 'week') {
      if (itemDate < oneWeekAgo) continue;
    } else if (activeFilter === 'month') {
      if (itemDate.getMonth() !== currentMonth || itemDate.getFullYear() !== currentYear) continue;
    }

    grandRevenue += item.totalRevenue || 0;
    grandCost += item.totalCost || 0;
    grandProfit += item.netProfit || 0;
    filteredProducts.push(item);
  }

  grandRevenue = Math.round(grandRevenue * 100) / 100;
  grandCost = Math.round(grandCost * 100) / 100;
  grandProfit = Math.round(grandProfit * 100) / 100;

  // 1. Update Top Stats Cards
  if (statTotalRevenue) statTotalRevenue.textContent = formatCurrency(grandRevenue);
  if (statTotalCost) statTotalCost.textContent = formatCurrency(grandCost);
  if (statTotalProfit) {
    statTotalProfit.textContent = formatCurrency(grandProfit);
    statTotalProfit.style.color = grandProfit >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  // 2. Update Goal Tracker
  const rawPercentage = monthlyGoal > 0 ? (grandProfit / monthlyGoal) * 100 : 0;
  const displayPercentage = Math.round(rawPercentage * 10) / 10;
  const barWidth = Math.min(100, Math.max(0, displayPercentage));
  const remainingGoal = Math.max(0, Math.round((monthlyGoal - grandProfit) * 100) / 100);

  if (goalTargetVal) goalTargetVal.textContent = formatCurrency(monthlyGoal);
  if (goalProgressBar) goalProgressBar.style.width = `${barWidth}%`;
  if (goalProgressText) goalProgressText.textContent = `${displayPercentage}% Bajarildi (${formatCurrency(grandProfit)})`;

  if (goalMetricTarget) goalMetricTarget.textContent = formatCurrency(monthlyGoal);
  if (goalMetricAchieved) goalMetricAchieved.textContent = formatCurrency(grandProfit);
  if (goalMetricRemaining) goalMetricRemaining.textContent = remainingGoal > 0 ? `${formatCurrency(remainingGoal)} qoldi` : "🎯 Maqsad bajarildi!";

  // 3. Update Mobile Sticky Footer
  if (stickyRevenue) stickyRevenue.textContent = formatCurrency(grandRevenue);
  if (stickyCost) stickyCost.textContent = formatCurrency(grandCost);
  if (stickyProfit) {
    stickyProfit.textContent = formatCurrency(grandProfit);
    stickyProfit.style.color = grandProfit >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  // 4. Mobile Badge Count
  if (mobileCountBadge) mobileCountBadge.textContent = filteredProducts.length;

  // 5. Update Banner Text
  const bannerTotalIncomeText = document.getElementById('bannerTotalIncomeText');
  if (bannerTotalIncomeText) {
    bannerTotalIncomeText.textContent = `Jami sof foyda: ${formatCurrency(grandProfit)}`;
  }

  // 6. Update Hero Live Community Users Counter
  updateCommunityCounterUI();

  // 7. Fast Single-assignment Table Rendering
  if (productTableBody) {
    if (filteredProducts.length === 0) {
      productTableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
    } else {
      if (emptyState) emptyState.style.display = 'none';

      const defaultImg = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=80&auto=format&fit=crop&q=60';
      
      const rowsHtml = filteredProducts.map(item => {
        const d = new Date(item.createdAt || Date.now());
        const dateStr = d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const imgSrc = item.image || defaultImg;
        const profitClass = item.netProfit >= 0 ? 'color: var(--success);' : 'color: var(--danger);';

        return `
          <tr>
            <td>
              <div class="product-cell">
                <img src="${imgSrc}" class="product-img" alt="${item.name}" loading="lazy" />
                <div class="product-info">
                  <div class="name">${item.name}</div>
                  <div class="date">${dateStr}</div>
                </div>
              </div>
            </td>
            <td>
              <div>${formatCurrency(item.buyPrice)} + ${formatCurrency(item.cargoPrice)}</div>
              <small style="color: var(--text-dim);">1 dona xarajat</small>
            </td>
            <td>
              <div><strong>${formatCurrency(item.sellPrice)}</strong></div>
              <small style="color: var(--text-dim);">${item.quantity} ta</small>
            </td>
            <td>${formatCurrency(item.totalCost)}</td>
            <td class="profit-text" style="${profitClass}">${formatCurrency(item.netProfit)}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="action-btn edit-btn" onclick="editProduct('${item.id}')" title="O'zgartirish" style="font-size: 1rem;">
                ✏️
              </button>
              <button class="action-btn delete-btn" onclick="deleteProduct('${item.id}')" title="O'chirish" style="font-size: 1rem;">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');

      productTableBody.innerHTML = rowsHtml;
    }
  }
}

// --- FAST EDIT PRODUCT ---
window.editProduct = function(id) {
  const item = products.find(p => p.id === id);
  if (!item) return;

  editingProductId = item.id;
  if (editingProductIdInput) editingProductIdInput.value = item.id;

  if (productNameInput) productNameInput.value = item.name;
  if (productDateInput) {
    productDateInput.value = item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : '';
  }
  if (buyPriceInput) buyPriceInput.value = item.buyPrice || '';
  if (cargoPriceInput) cargoPriceInput.value = item.cargoPrice || '';
  if (sellPriceInput) sellPriceInput.value = item.sellPrice || '';
  if (quantityInput) quantityInput.value = item.quantity || 1;

  if (item.image) {
    currentImageData = item.image;
    if (imagePreview) {
      imagePreview.src = item.image;
      imagePreview.style.display = 'block';
    }
    if (dropzone) {
      const icon = dropzone.querySelector('.dropzone-icon');
      const txt = dropzone.querySelector('.dropzone-text');
      if (icon) icon.style.display = 'none';
      if (txt) txt.style.display = 'none';
    }
  } else {
    currentImageData = '';
    if (imagePreview) imagePreview.style.display = 'none';
    if (dropzone) {
      const icon = dropzone.querySelector('.dropzone-icon');
      const txt = dropzone.querySelector('.dropzone-text');
      if (icon) icon.style.display = 'block';
      if (txt) txt.style.display = 'block';
    }
  }

  if (formTitle) formTitle.innerHTML = `✏️ Mahsulotni O'zgartirish`;
  if (submitBtnText) submitBtnText.textContent = "O'zgartirishni Saqlash";
  if (cancelEditBtn) cancelEditBtn.style.display = 'inline-flex';

  updateLivePreview();

  if (window.innerWidth <= 768 && tabFormBtn) {
    tabFormBtn.click();
  }
};

function resetEditMode() {
  editingProductId = null;
  if (editingProductIdInput) editingProductIdInput.value = '';
  if (productForm) productForm.reset();
  if (quantityInput) quantityInput.value = 1;
  if (productDateInput) productDateInput.value = '';
  currentImageData = '';
  if (imagePreview) imagePreview.style.display = 'none';
  if (dropzone) {
    const icon = dropzone.querySelector('.dropzone-icon');
    const txt = dropzone.querySelector('.dropzone-text');
    if (icon) icon.style.display = 'block';
    if (txt) txt.style.display = 'block';
  }

  if (formTitle) formTitle.innerHTML = `➕ Yangi Mahsulot Qo'shish`;
  if (submitBtnText) submitBtnText.textContent = "Hisoblash va Saqlash";
  if (cancelEditBtn) cancelEditBtn.style.display = 'none';
  updateLivePreview();
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', resetEditMode);
}

// --- FORM SUBMIT HANDLER ---
function handleFormSubmit(e) {
  if (e) e.preventDefault();

  const buy = parseSmartNumber(buyPriceInput ? buyPriceInput.value : 0);
  const cargo = parseSmartNumber(cargoPriceInput ? cargoPriceInput.value : 0);
  const sell = parseSmartNumber(sellPriceInput ? sellPriceInput.value : 0);
  const qty = Math.max(1, Math.round(parseSmartNumber(quantityInput ? quantityInput.value : 1)) || 1);
  let name = productNameInput ? productNameInput.value.trim() : '';
  if (!name) name = "Mahsulot";

  let createdAtDate = new Date().toISOString();
  if (productDateInput && productDateInput.value) {
    const d = new Date(productDateInput.value);
    if (!isNaN(d.getTime())) createdAtDate = d.toISOString();
  }

  // Tier Limit Check: 500 for Oydinoy, 10 for others, Infinity for Pro/VIP
  const userLimit = getUserProductLimit();
  if (!editingProductId && products.length >= userLimit) {
    if (isOydinoyUser()) {
      alert(`🌱 Siz uchun berilgan 500 ta bepul mahsulot limitiga yetdingiz (${products.length} ta).\n\nCheksiz mahsulotlar uchun 40 000 so'mlik Cheksiz tarifga o'ting!`);
    } else {
      alert(`🌱 Bepul tarifda oddiy hisoblar uchun ko'pi bilan 10 tagacha mahsulot kiritish mumkin (${products.length} ta kiritildi).\n\nKo'proq mahsulot kiritish uchun 20 000 so'mlik yoki 40 000 so'mlik tarifga o'ting!`);
    }
    openPricingModal();
    return;
  }

  const metrics = calculateItemMetrics(buy, cargo, sell, qty);

  if (editingProductId) {
    products = products.map(item => {
      if (item.id === editingProductId) {
        return {
          ...item,
          name,
          image: currentImageData !== '' ? currentImageData : item.image,
          buyPrice: buy,
          cargoPrice: cargo,
          sellPrice: sell,
          quantity: qty,
          singleCost: metrics.singleCost,
          totalCost: metrics.totalCost,
          totalRevenue: metrics.totalRevenue,
          netProfit: metrics.netProfit,
          createdAt: createdAtDate
        };
      }
      return item;
    });

    saveProducts();
    resetEditMode();
    populateMonthFilterDropdown();
    renderUI();
    showToast(`"${name}" yangilandi!`);
  } else {
    const newProduct = {
      id: Date.now().toString(),
      name,
      image: currentImageData,
      buyPrice: buy,
      cargoPrice: cargo,
      sellPrice: sell,
      quantity: qty,
      singleCost: metrics.singleCost,
      totalCost: metrics.totalCost,
      totalRevenue: metrics.totalRevenue,
      netProfit: metrics.netProfit,
      createdAt: createdAtDate
    };

    products.unshift(newProduct);
    saveProducts();
    resetEditMode();
    populateMonthFilterDropdown();
    renderUI();
    showToast(`"${name}" saqlandi va hisoblandi!`);
  }

  if (window.innerWidth <= 768 && tabTableBtn) {
    tabTableBtn.click();
  }
}

if (productForm) {
  productForm.addEventListener('submit', handleFormSubmit);
}

// --- DELETE PRODUCT ---
window.deleteProduct = function(id) {
  if (confirm("Ushbu mahsulotni o'chirmoqchimisiz?")) {
    products = products.filter(p => p.id !== id);
    if (editingProductId === id) resetEditMode();
    saveProducts();
    populateMonthFilterDropdown();
    renderUI();
    showToast("Mahsulot o'chirildi!");
  }
};

// --- MOBILE TABS ---
if (tabFormBtn && tabTableBtn) {
  tabFormBtn.addEventListener('click', () => {
    tabFormBtn.classList.add('active');
    tabTableBtn.classList.remove('active');
    if (mainLayout) mainLayout.className = 'main-layout show-form';
  });

  tabTableBtn.addEventListener('click', () => {
    tabTableBtn.classList.add('active');
    tabFormBtn.classList.remove('active');
    if (mainLayout) mainLayout.className = 'main-layout show-table';
  });
}

// --- IMAGE UPLOAD ---
if (dropzone) {
  dropzone.addEventListener('click', () => {
    if (imageInput) imageInput.click();
  });
}

if (imageInput) {
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      compressImage(file, 350, 350, 0.6, (compressedDataUrl) => {
        currentImageData = compressedDataUrl;
        if (imagePreview) {
          imagePreview.src = currentImageData;
          imagePreview.style.display = 'block';
        }
        if (dropzone) {
          const icon = dropzone.querySelector('.dropzone-icon');
          const txt = dropzone.querySelector('.dropzone-text');
          if (icon) icon.style.display = 'none';
          if (txt) txt.style.display = 'none';
        }
      });
    }
  });
}

// --- FAST INPUT LISTENERS ---
[buyPriceInput, cargoPriceInput, sellPriceInput, quantityInput].forEach(input => {
  if (input) input.addEventListener('input', updateLivePreview);
});

// --- FILTER BUTTONS ---
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderUI();
  });
});

// --- DEBOUNCED SEARCH INPUT (120ms - Silky Smooth 120 FPS Typing) ---
let searchDebounceTimer = null;
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      renderUI();
    }, 120);
  });
}

// --- CLEAR ALL ---
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    if (products.length === 0) return;
    if (confirm("Barcha saqlangan mahsulotlarni o'chirishni xohlaysizmi?")) {
      products = [];
      resetEditMode();
      saveProducts();
      populateMonthFilterDropdown();
      renderUI();
      showToast("Barcha ma'lumotlar tozalandi!");
    }
  });
}

// --- EXPORT CSV EXCEL ---
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    if (products.length === 0) {
      alert("Yuklab olish uchun ma'lumot yo'q!");
      return;
    }

    let csvContent = "\uFEFF";
    csvContent += `Mahsulot Nomi,Xarid Narxi,Kargo Narxi,Jami Tannarx,Sotuv Narxi,Soni,100% Sof Foyda,Sana\n`;

    products.forEach(p => {
      const dateStr = new Date(p.createdAt || Date.now()).toLocaleDateString('uz-UZ');
      csvContent += `"${p.name}",${p.buyPrice},${p.cargoPrice},${p.totalCost},${p.sellPrice},${p.quantity},${p.netProfit},"${dateStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Biznes_Hisob_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Excel (CSV) yuklab olindi!");
  });
}

// --- PRINT ---
if (printBtn) {
  printBtn.addEventListener('click', () => window.print());
}

// --- SETTINGS MODAL ---
if (settingsBtn) {
  settingsBtn.addEventListener('click', () => {
    if (settingCurrency) settingCurrency.value = settings.currency;
    if (settingsModal) settingsModal.classList.add('active');
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', () => {
    if (settingsModal) settingsModal.classList.remove('active');
  });
}

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', () => {
    if (settingCurrency) settings.currency = settingCurrency.value;
    saveSettingsToStorage();
    if (settingsModal) settingsModal.classList.remove('active');
    updateLivePreview();
    renderUI();
    showToast("Sozlamalar saqlandi!");
  });
}

// --- INCOME ANALYTICS MODAL (OYLIK VA YILLIK TO'LIQ TAHLIL) ---
let activeIncomeTab = 'month'; // 'month' or 'year'
let selectedIncomeYear = new Date().getFullYear();
let selectedIncomeMonth = new Date().getMonth(); // 0 to 11
let isIncomePrivacyHidden = false;

const incomeAnalyticsBtn = document.getElementById('incomeAnalyticsBtn');
const openIncomeBannerBtn = document.getElementById('openIncomeBannerBtn');
const incomeModal = document.getElementById('incomeModal');
const closeIncomeModalBtn = document.getElementById('closeIncomeModalBtn');
const closeIncomeModalXBtn = document.getElementById('closeIncomeModalXBtn');
const closeIncomeModalBottomBtn = document.getElementById('closeIncomeModalBottomBtn');
const toggleIncomePrivacyBtn = document.getElementById('toggleIncomePrivacyBtn');
const incomePrivacyIcon = document.getElementById('incomePrivacyIcon');

const tabIncomeMonthBtn = document.getElementById('tabIncomeMonthBtn');
const tabIncomeYearBtn = document.getElementById('tabIncomeYearBtn');
const incomeMonthSection = document.getElementById('incomeMonthSection');
const incomeYearSection = document.getElementById('incomeYearSection');
const incomeMonthSelect = document.getElementById('incomeMonthSelect');
const downloadMonthReportBtn = document.getElementById('downloadMonthReportBtn');
const downloadYearReportBtn = document.getElementById('downloadYearReportBtn');

const MONTH_NAMES_UZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktyabr', 'Noyabr', 'Dekabr'
];

function openIncomeModal() {
  if (incomeModal) {
    selectedIncomeYear = new Date().getFullYear();
    selectedIncomeMonth = new Date().getMonth();
    populateIncomeMonthSelect();
    renderIncomeAnalytics();
    incomeModal.classList.add('active');
  }
}

function closeIncomeModal() {
  if (incomeModal) incomeModal.classList.remove('active');
}

if (incomeAnalyticsBtn) incomeAnalyticsBtn.addEventListener('click', openIncomeModal);
if (openIncomeBannerBtn) openIncomeBannerBtn.addEventListener('click', openIncomeModal);
if (closeIncomeModalBtn) closeIncomeModalBtn.addEventListener('click', closeIncomeModal);
if (closeIncomeModalXBtn) closeIncomeModalXBtn.addEventListener('click', closeIncomeModal);
if (closeIncomeModalBottomBtn) closeIncomeModalBottomBtn.addEventListener('click', closeIncomeModal);

// Close on backdrop click (click outside modal box)
if (incomeModal) {
  incomeModal.addEventListener('click', (e) => {
    if (e.target === incomeModal) {
      closeIncomeModal();
    }
  });
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && incomeModal && incomeModal.classList.contains('active')) {
    closeIncomeModal();
  }
});

const closeStickyFooterBtn = document.getElementById('closeStickyFooterBtn');
const mobileStickyFooter = document.getElementById('mobileStickyFooter');
if (closeStickyFooterBtn && mobileStickyFooter) {
  closeStickyFooterBtn.addEventListener('click', () => {
    mobileStickyFooter.style.display = 'none';
  });
}

if (toggleIncomePrivacyBtn) {
  toggleIncomePrivacyBtn.addEventListener('click', () => {
    isIncomePrivacyHidden = !isIncomePrivacyHidden;
    if (incomePrivacyIcon) {
      incomePrivacyIcon.textContent = isIncomePrivacyHidden ? '🙈' : '👁️';
    }
    renderIncomeAnalytics();
  });
}

// Tab Switching
function switchIncomeTab(tab) {
  activeIncomeTab = tab;
  if (tab === 'month') {
    if (tabIncomeMonthBtn) tabIncomeMonthBtn.classList.add('active');
    if (tabIncomeYearBtn) tabIncomeYearBtn.classList.remove('active');
    if (incomeMonthSection) incomeMonthSection.style.display = 'block';
    if (incomeYearSection) incomeYearSection.style.display = 'none';
  } else {
    if (tabIncomeYearBtn) tabIncomeYearBtn.classList.add('active');
    if (tabIncomeMonthBtn) tabIncomeMonthBtn.classList.remove('active');
    if (incomeMonthSection) incomeMonthSection.style.display = 'none';
    if (incomeYearSection) incomeYearSection.style.display = 'block';
  }
  renderIncomeAnalytics();
}

if (tabIncomeMonthBtn) tabIncomeMonthBtn.addEventListener('click', () => switchIncomeTab('month'));
if (tabIncomeYearBtn) tabIncomeYearBtn.addEventListener('click', () => switchIncomeTab('year'));

function populateIncomeMonthSelect() {
  if (!incomeMonthSelect) return;
  let optionsHtml = '';
  for (let m = 0; m < 12; m++) {
    const isSelected = (m === selectedIncomeMonth);
    optionsHtml += `<option value="${m}" ${isSelected ? 'selected' : ''}>${MONTH_NAMES_UZ[m]} ${selectedIncomeYear}</option>`;
  }
  incomeMonthSelect.innerHTML = optionsHtml;
}

if (incomeMonthSelect) {
  incomeMonthSelect.addEventListener('change', (e) => {
    selectedIncomeMonth = parseInt(e.target.value, 10);
    renderIncomeAnalytics();
  });
}

function getAvailableYears() {
  const yearsSet = new Set();
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 3; y <= currentYear + 1; y++) {
    yearsSet.add(y);
  }
  products.forEach(p => {
    const d = new Date(p.createdAt || Date.now());
    const yr = d.getFullYear();
    if (!isNaN(yr) && yr > 2000) yearsSet.add(yr);
  });
  return Array.from(yearsSet).sort((a, b) => b - a);
}

window.selectIncomeYear = function(yr) {
  selectedIncomeYear = yr;
  populateIncomeMonthSelect();
  renderIncomeAnalytics();
};

function renderIncomeAnalytics() {
  const availableYears = getAvailableYears();
  if (!availableYears.includes(selectedIncomeYear)) {
    selectedIncomeYear = availableYears[0] || new Date().getFullYear();
  }

  // Grand Total across ALL time
  let grandProfit = 0;
  products.forEach(p => { grandProfit += p.netProfit || 0; });
  grandProfit = Math.round(grandProfit * 100) / 100;

  const incomeGrandTotalVal = document.getElementById('incomeGrandTotalVal');
  const formattedGrand = isIncomePrivacyHidden ? '•••••••• so\'m' : formatCurrency(grandProfit);
  if (incomeGrandTotalVal) incomeGrandTotalVal.textContent = formattedGrand;

  if (activeIncomeTab === 'month') {
    renderMonthlyView();
  } else {
    renderYearlyView(availableYears);
  }
}

function renderMonthlyView() {
  const incomeMonthCardTitle = document.getElementById('incomeMonthCardTitle');
  const incomeMonthProfitBigVal = document.getElementById('incomeMonthProfitBigVal');
  const incomeMonthRevenueVal = document.getElementById('incomeMonthRevenueVal');
  const incomeMonthCostVal = document.getElementById('incomeMonthCostVal');
  const incomeMonthQtyVal = document.getElementById('incomeMonthQtyVal');
  const monthlyProductsList = document.getElementById('monthlyProductsList');

  if (incomeMonthCardTitle) {
    incomeMonthCardTitle.textContent = `${MONTH_NAMES_UZ[selectedIncomeMonth]} ${selectedIncomeYear} FOYDASI`;
  }

  // Filter products for this specific month & year
  let mProfit = 0;
  let mRevenue = 0;
  let mCost = 0;
  let mQty = 0;
  const monthProducts = [];

  products.forEach(p => {
    const d = new Date(p.createdAt || Date.now());
    if (d.getFullYear() === selectedIncomeYear && d.getMonth() === selectedIncomeMonth) {
      mProfit += p.netProfit || 0;
      mRevenue += p.totalRevenue || 0;
      mCost += p.totalCost || 0;
      mQty += p.quantity || 1;
      monthProducts.push(p);
    }
  });

  mProfit = Math.round(mProfit * 100) / 100;
  mRevenue = Math.round(mRevenue * 100) / 100;
  mCost = Math.round(mCost * 100) / 100;

  if (incomeMonthProfitBigVal) {
    incomeMonthProfitBigVal.textContent = isIncomePrivacyHidden ? '••••••••' : formatCurrency(mProfit);
  }
  if (incomeMonthRevenueVal) {
    incomeMonthRevenueVal.textContent = isIncomePrivacyHidden ? '••••••••' : formatCurrency(mRevenue);
  }
  if (incomeMonthCostVal) {
    incomeMonthCostVal.textContent = isIncomePrivacyHidden ? '••••••••' : formatCurrency(mCost);
  }
  if (incomeMonthQtyVal) {
    incomeMonthQtyVal.textContent = `${mQty} ta (${monthProducts.length} ta sotuv)`;
  }

  // Render monthly products list
  if (monthlyProductsList) {
    if (monthProducts.length === 0) {
      monthlyProductsList.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem; background: rgba(255,255,255,0.02); border-radius: var(--radius-sm); border: 1px dashed var(--border);">
          <span>📭 Ushbu oyda (${MONTH_NAMES_UZ[selectedIncomeMonth]} ${selectedIncomeYear}) mahsulot kiritilmagan.</span>
        </div>`;
    } else {
      monthlyProductsList.innerHTML = monthProducts.map(p => {
        const itemProfitFormatted = isIncomePrivacyHidden ? '••••••••' : formatCurrency(p.netProfit || 0);
        const itemDateStr = new Date(p.createdAt || Date.now()).toLocaleDateString('uz-UZ');
        return `
          <div class="monthly-product-item">
            <div style="min-width: 0;">
              <div style="font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px;">
                ${p.name || 'Nomsiz'}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">
                <span>${itemDateStr}</span> • <span>${p.quantity || 1} ta</span>
              </div>
            </div>
            <div style="text-align: right; flex-shrink: 0;">
              <div style="color: var(--success); font-weight: 800; font-size: 0.9rem;">
                +${itemProfitFormatted}
              </div>
              <div style="font-size: 0.72rem; color: #38bdf8;">
                ${isIncomePrivacyHidden ? '•••' : formatCurrency(p.sellPrice || 0)}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

function renderYearlyView(availableYears) {
  // Render Year Pills
  const yearPillsContainer = document.getElementById('yearPillsContainer');
  if (yearPillsContainer) {
    yearPillsContainer.innerHTML = availableYears.map(yr => `
      <button class="year-pill ${yr === selectedIncomeYear ? 'active' : ''}" onclick="selectIncomeYear(${yr})">${yr}</button>
    `).join('');
  }

  // Selected year metrics
  let yearRevenue = 0;
  let yearProfit = 0;
  let yearCost = 0;
  let yearQty = 0;
  const activeMonthsSet = new Set();

  products.forEach(p => {
    const d = new Date(p.createdAt || Date.now());
    if (d.getFullYear() === selectedIncomeYear) {
      activeMonthsSet.add(d.getMonth());
      yearRevenue += p.totalRevenue || 0;
      yearProfit += p.netProfit || 0;
      yearCost += p.totalCost || 0;
      yearQty += p.quantity || 1;
    }
  });

  yearRevenue = Math.round(yearRevenue * 100) / 100;
  yearProfit = Math.round(yearProfit * 100) / 100;
  yearCost = Math.round(yearCost * 100) / 100;

  const formattedYearProfit = isIncomePrivacyHidden ? '••••••••' : formatCurrency(yearProfit);

  const incomeYearTitle = document.getElementById('incomeYearTitle');
  const incomeYearRevenueVal = document.getElementById('incomeYearRevenueVal');
  const incomeYearProfitVal = document.getElementById('incomeYearProfitVal');
  const incomeYearCostVal = document.getElementById('incomeYearCostVal');
  const incomeYearMonthsCountVal = document.getElementById('incomeYearMonthsCountVal');
  const incomeYearQtyVal = document.getElementById('incomeYearQtyVal');

  if (incomeYearTitle) incomeYearTitle.textContent = `${selectedIncomeYear}-YIL UMUMIY HISOBI`;
  if (incomeYearRevenueVal) incomeYearRevenueVal.textContent = isIncomePrivacyHidden ? '••••••••' : formatCurrency(yearRevenue);
  if (incomeYearProfitVal) incomeYearProfitVal.textContent = formattedYearProfit;
  if (incomeYearCostVal) incomeYearCostVal.textContent = isIncomePrivacyHidden ? '••••••••' : formatCurrency(yearCost);
  if (incomeYearMonthsCountVal) incomeYearMonthsCountVal.textContent = `${activeMonthsSet.size} ta oy`;
  if (incomeYearQtyVal) incomeYearQtyVal.textContent = `${yearQty} ta`;

  renderMonthlyBreakdown(selectedIncomeYear);
}

function renderMonthlyBreakdown(year) {
  const monthlyBreakdownList = document.getElementById('monthlyBreakdownList');
  if (!monthlyBreakdownList) return;

  const monthDataMap = new Map();
  for (let m = 0; m < 12; m++) {
    monthDataMap.set(m, { revenue: 0, cost: 0, profit: 0, qty: 0, count: 0 });
  }

  products.forEach(p => {
    const d = new Date(p.createdAt || Date.now());
    if (d.getFullYear() === year) {
      const m = d.getMonth();
      const curr = monthDataMap.get(m);
      curr.revenue += p.totalRevenue || 0;
      curr.cost += p.totalCost || 0;
      curr.profit += p.netProfit || 0;
      curr.qty += p.quantity || 1;
      curr.count += 1;
    }
  });

  let cardsHtml = '';
  for (let m = 11; m >= 0; m--) {
    const data = monthDataMap.get(m);
    if (data.count > 0) {
      const formattedProfit = isIncomePrivacyHidden ? '••••••••' : formatCurrency(data.profit);
      const formattedRevenue = isIncomePrivacyHidden ? '••••••••' : formatCurrency(data.revenue);
      const formattedCost = isIncomePrivacyHidden ? '••••••••' : formatCurrency(data.cost);

      cardsHtml += `
        <div class="monthly-breakdown-item">
          <div class="m-breakdown-head">
            <span class="m-name">📅 ${MONTH_NAMES_UZ[m]} ${year}</span>
            <span class="m-profit" style="color: var(--success); font-weight: 800;">+${formattedProfit}</span>
          </div>
          <div class="m-breakdown-details">
            <div>Tushum: <strong>${formattedRevenue}</strong></div>
            <div>Xarajat: <strong>${formattedCost}</strong></div>
            <div>Mahsulotlar: <strong>${data.qty} ta (${data.count} sotuv)</strong></div>
          </div>
        </div>
      `;
    }
  }

  monthlyBreakdownList.innerHTML = cardsHtml || `<div style="text-align:center; padding: 15px; color: var(--text-muted); font-size: 0.85rem;">Ushbu yilda sotuv ma'lumotlari yo'q</div>`;
}

// Download Month Report (Excel/CSV)
if (downloadMonthReportBtn) {
  downloadMonthReportBtn.addEventListener('click', () => {
    const mProducts = products.filter(p => {
      const d = new Date(p.createdAt || Date.now());
      return d.getFullYear() === selectedIncomeYear && d.getMonth() === selectedIncomeMonth;
    });

    if (mProducts.length === 0) {
      alert(`${MONTH_NAMES_UZ[selectedIncomeMonth]} ${selectedIncomeYear} uchun ma'lumot yo'q!`);
      return;
    }

    let csvContent = "\uFEFF";
    csvContent += `${MONTH_NAMES_UZ[selectedIncomeMonth].toUpperCase()} ${selectedIncomeYear} BIZNES HISOBOTI\n`;
    csvContent += `Mahsulot Nomi,Xarid Narxi,Kargo Narxi,Jami Tannarx,Sotuv Narxi,Soni,100% Sof Foyda,Sana\n`;

    mProducts.forEach(p => {
      const dateStr = new Date(p.createdAt || Date.now()).toLocaleDateString('uz-UZ');
      csvContent += `"${p.name}",${p.buyPrice},${p.cargoPrice},${p.totalCost},${p.sellPrice},${p.quantity},${p.netProfit},"${dateStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Daromad_${MONTH_NAMES_UZ[selectedIncomeMonth]}_${selectedIncomeYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${MONTH_NAMES_UZ[selectedIncomeMonth]} oylik hisoboti yuklandi!`);
  });
}

// Download Year Report (Excel/CSV)
if (downloadYearReportBtn) {
  downloadYearReportBtn.addEventListener('click', () => {
    const yearProducts = products.filter(p => {
      const d = new Date(p.createdAt || Date.now());
      return d.getFullYear() === selectedIncomeYear;
    });

    if (yearProducts.length === 0) {
      alert(`${selectedIncomeYear}-yil uchun yuklab olishga ma'lumot yo'q!`);
      return;
    }

    let csvContent = "\uFEFF";
    csvContent += `${selectedIncomeYear}-YIL BIZNES HISOBOTI\n`;
    csvContent += `Mahsulot Nomi,Xarid Narxi,Kargo Narxi,Jami Tannarx,Sotuv Narxi,Soni,100% Sof Foyda,Sana\n`;

    yearProducts.forEach(p => {
      const dateStr = new Date(p.createdAt || Date.now()).toLocaleDateString('uz-UZ');
      csvContent += `"${p.name}",${p.buyPrice},${p.cargoPrice},${p.totalCost},${p.sellPrice},${p.quantity},${p.netProfit},"${dateStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Mening_Daromadim_${selectedIncomeYear}_yil.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`${selectedIncomeYear}-yil hisoboti yuklandi!`);
  });
}

// ==========================================================================
// 👑 PREMIUM & TARIFLAR MANAGEMENT ENGINE (1 KUNLIK PROMO SINOV)
// ==========================================================================
const STORAGE_PLAN_KEY = 'biznes_active_plan_v12';
const STORAGE_PLAN_EXPIRES_KEY = 'biznes_plan_expires_at_v12';
let userPlan = localStorage.getItem(STORAGE_PLAN_KEY) || 'free'; // 'free', 'monthly_pro', 'yearly_vip', 'lifetime'

const pricingBtn = document.getElementById('pricingBtn');
const pricingModal = document.getElementById('pricingModal');
const closePricingModalBtn = document.getElementById('closePricingModalBtn');

const checkoutModal = document.getElementById('checkoutModal');
const closeCheckoutModalBtn = document.getElementById('closeCheckoutModalBtn');
const checkoutPlanTitle = document.getElementById('checkoutPlanTitle');
const checkoutPlanPrice = document.getElementById('checkoutPlanPrice');

const promoCodeInput = document.getElementById('promoCodeInput');
const applyPromoBtn = document.getElementById('applyPromoBtn');
const activePlanBadge = document.getElementById('activePlanBadge');
const planExpiryText = document.getElementById('planExpiryText');

// Install Guide Modal DOMs
const headerInstallBtn = document.getElementById('headerInstallBtn');
const installGuideModal = document.getElementById('installGuideModal');
const closeInstallGuideBtn = document.getElementById('closeInstallGuideBtn');
const gotItInstallBtn = document.getElementById('gotItInstallBtn');

function checkPlanExpiration() {
  const expiresAt = parseInt(localStorage.getItem(STORAGE_PLAN_EXPIRES_KEY) || '0', 10);
  if (expiresAt > 0) {
    if (Date.now() > expiresAt) {
      userPlan = 'free';
      localStorage.setItem(STORAGE_PLAN_KEY, 'free');
      localStorage.removeItem(STORAGE_PLAN_EXPIRES_KEY);
      return false;
    }
    return true; // Still active trial
  }
  return false;
}

function updatePlanBadgeUI() {
  if (!activePlanBadge) return;
  checkPlanExpiration();

  const expiresAt = parseInt(localStorage.getItem(STORAGE_PLAN_EXPIRES_KEY) || '0', 10);
  if (expiresAt > 0 && Date.now() <= expiresAt) {
    const hoursLeft = Math.max(1, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60)));
    activePlanBadge.textContent = `👑 VIP Sinov (${hoursLeft} soat)`;
    activePlanBadge.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    if (planExpiryText) planExpiryText.textContent = `1 kunlik sinov: ${hoursLeft} soat qoldi`;
    return;
  }

  const isOydin = isOydinoyUser();
  if (userPlan === 'lifetime') {
    activePlanBadge.textContent = '💎 Bir Umrlik (VIP)';
    activePlanBadge.style.background = 'linear-gradient(135deg, #9333ea, #7c3aed)';
    if (planExpiryText) planExpiryText.textContent = 'Cheksiz / Abadiy faol';
  } else if (userPlan === 'yearly_vip') {
    activePlanBadge.textContent = '👑 Yillik VIP';
    activePlanBadge.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    if (planExpiryText) planExpiryText.textContent = '1 yil faol';
  } else if (userPlan === 'monthly_pro') {
    activePlanBadge.textContent = '⚡ Oylik Cheksiz (40 000)';
    activePlanBadge.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
    if (planExpiryText) planExpiryText.textContent = 'Oylik Cheksiz faol';
  } else if (userPlan === 'monthly_start') {
    activePlanBadge.textContent = '⚡ Oylik Start (20 000)';
    activePlanBadge.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    if (planExpiryText) planExpiryText.textContent = '100 tagacha mahsulot';
  } else {
    activePlanBadge.textContent = isOydin ? '⭐ Oydinoy (500 ta)' : '🌱 Bepul (10 ta)';
    activePlanBadge.style.background = isOydin ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)';
    if (planExpiryText) planExpiryText.textContent = isOydin ? '500 tagacha mahsulot bepul' : '10 tagacha mahsulot bepul';
  }
}

function renderPricingCards() {
  const grid = document.querySelector('.pricing-cards-grid');
  if (!grid) return;

  const isOydin = isOydinoyUser();

  if (isOydin) {
    grid.innerHTML = `
      <!-- CARD 1: OYDINOY BEPUL (500 TA) -->
      <div class="pricing-card card-free" id="cardFree">
        <div class="p-card-header">
          <div class="p-card-tag tag-vip">⭐ Maxsus Imtiyoz</div>
          <h4 class="p-card-title">🌱 Oydinoy Bepul</h4>
          <div class="p-card-price">
            <span class="p-amount">0</span>
            <span class="p-period">so'm / doimiy</span>
          </div>
          <p class="p-card-desc">oydinoy@gmail.com uchun maxsus 500 ta limit</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>500 tagacha</strong> mahsulot saqlash</li>
          <li>✓ 100% Sof Foyda hisoblash</li>
          <li>✓ Tannarx va Kargo kalkulyatori</li>
          <li>✓ Telefon xotirasida saqlash</li>
          <li class="disabled">✕ Excel (CSV) yuklab olish</li>
          <li class="disabled">✕ Yillik daromad tahlillari</li>
        </ul>
        <button class="btn btn-secondary plan-action-btn current-plan-btn" id="btnSelectFree" disabled>
          ✓ Amaldagi tarif (500 ta)
        </button>
      </div>

      <!-- CARD 2: OYLIK CHEKSIZ (40 000 SO'M) -->
      <div class="pricing-card card-pro" id="cardPro">
        <div class="p-card-header">
          <div class="p-card-tag tag-pro">Hamyonbop Cheksiz</div>
          <h4 class="p-card-title">⚡ Oylik Cheksiz</h4>
          <div class="p-card-price">
            <span class="p-amount">40 000</span>
            <span class="p-period">so'm / oy</span>
          </div>
          <p class="p-card-desc">oydinoy@gmail.com uchun 40 000 so'mga cheksiz!</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>CHEKSIZ</strong> mahsulotlar kiritish</li>
          <li>✓ <strong>Excel (CSV)</strong> to'liq yuklab olish</li>
          <li>✓ Oylik foyda maqsadi (Goal tracker)</li>
          <li>✓ Rasmlarni cheksiz yuklash</li>
          <li>✓ Qidiruv va saralash filterlari</li>
          <li class="disabled">✕ Shaxsiy menejer yordami</li>
        </ul>
        <button class="btn btn-primary plan-action-btn" onclick="openCheckout('Oylik Cheksiz', '40 000 so\'m / oy', 40000)">
          ⚡ 40 000 so'mga Cheksiz Olish
        </button>
      </div>

      <!-- CARD 3: YILLIK VIP -->
      <div class="pricing-card card-vip featured" id="cardVip">
        <div class="featured-ribbon">🔥 50% TEJASH</div>
        <div class="p-card-header">
          <div class="p-card-tag tag-vip">🔥 Tavsiya etiladi</div>
          <h4 class="p-card-title">👑 Yillik VIP</h4>
          <div class="p-card-price">
            <span class="p-amount">199 000</span>
            <span class="p-period">so'm / yil</span>
          </div>
          <div class="p-monthly-equivalent">Oyiga atigi ~16 500 so'm!</div>
          <p class="p-card-desc">Faol savdogarlar va jiddiy tadbirkorlar uchun</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>Barcha PRO</strong> imkoniyatlari</li>
          <li>✓ <strong>Yillik &amp; Oyma-oy</strong> to'liq daromad tahlili</li>
          <li>✓ Barcha yillik hisobotlarni yuklab olish</li>
          <li>✓ Telegram orqali shaxsiy yordam</li>
        </ul>
        <button class="btn btn-primary plan-action-btn btn-vip-action" onclick="openCheckout('Yillik VIP', '199 000 so\'m / yil', 199000)">
          👑 VIP ga o'tish (199 000)
        </button>
      </div>

      <!-- CARD 4: BIR UMRLIK -->
      <div class="pricing-card card-lifetime" id="cardLifetime">
        <div class="p-card-header">
          <div class="p-card-tag tag-lifetime">💎 Abadiy Litsenziya</div>
          <h4 class="p-card-title">💎 Bir Umrlik</h4>
          <div class="p-card-price">
            <span class="p-amount">450 000</span>
            <span class="p-period">so'm (Bir martalik)</span>
          </div>
          <p class="p-card-desc">1 marta to'laysiz — umrbod bepul ishlatasiz!</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>Umrbod to'liq litsenziya</strong></li>
          <li>✓ Kelajakdagi barcha yangi funksiyalar</li>
          <li>✓ Cheksiz eksport va hisobotlar</li>
        </ul>
        <button class="btn btn-secondary plan-action-btn btn-lifetime-action" onclick="openCheckout('Bir Umrlik (Lifetime)', '450 000 so\'m (Bir marta)', 450000)">
          💎 Bir Umrga Olish (450 000)
        </button>
      </div>
    `;
  } else {
    // ODDIY AHOLI UCHUN: 10 ta bepul, 20 ming so'm oddiy, 40 ming so'm cheksiz
    grid.innerHTML = `
      <!-- CARD 1: BEPUL (10 TA) -->
      <div class="pricing-card card-free" id="cardFree">
        <div class="p-card-header">
          <div class="p-card-tag">Boshlang'ich</div>
          <h4 class="p-card-title">🌱 Bepul (Start)</h4>
          <div class="p-card-price">
            <span class="p-amount">0</span>
            <span class="p-period">so'm / doimiy</span>
          </div>
          <p class="p-card-desc">Oddiy aholi va yangi foydalanuvchilar uchun</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>10 tagacha</strong> mahsulot saqlash</li>
          <li>✓ 100% Sof Foyda hisoblash</li>
          <li>✓ Tannarx va Kargo kalkulyatori</li>
          <li>✓ Telefon xotirasida saqlash</li>
          <li class="disabled">✕ Excel (CSV) yuklab olish</li>
          <li class="disabled">✕ Yillik daromad tahlillari</li>
        </ul>
        <button class="btn btn-secondary plan-action-btn current-plan-btn" id="btnSelectFree" disabled>
          ✓ Amaldagi tarif (10 ta)
        </button>
      </div>

      <!-- CARD 2: ODDIY START (20 MING SO'M) -->
      <div class="pricing-card card-basic" id="cardBasic" style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.3);">
        <div class="p-card-header">
          <div class="p-card-tag" style="background: rgba(16,185,129,0.2); color: var(--success);">🌱 Oddiy Savdo</div>
          <h4 class="p-card-title">⚡ Oylik Start</h4>
          <div class="p-card-price">
            <span class="p-amount">20 000</span>
            <span class="p-period">so'm / oy</span>
          </div>
          <p class="p-card-desc">Oddiy aholi va kichik savdolar uchun arzon narx</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>100 tagacha</strong> mahsulot kiritish</li>
          <li>✓ <strong>Excel (CSV)</strong> yuklab olish</li>
          <li>✓ Oylik maqsad (Goal tracker)</li>
          <li>✓ Rasmlar saqlash</li>
          <li class="disabled">✕ Cheksiz mahsulotlar</li>
        </ul>
        <button class="btn btn-primary plan-action-btn" style="background: linear-gradient(135deg, #10b981, #059669);" onclick="openCheckout('Oylik Start', '20 000 so\'m / oy', 20000)">
          ⚡ 20 000 so'mga Olish
        </button>
      </div>

      <!-- CARD 3: OYLIK CHEKSIZ (40 MING SO'M) -->
      <div class="pricing-card card-pro featured" id="cardPro">
        <div class="featured-ribbon">⚡ CHEKSIZ IMKONIYAT</div>
        <div class="p-card-header">
          <div class="p-card-tag tag-pro">🔥 Eng Qulay</div>
          <h4 class="p-card-title">🚀 Oylik Cheksiz</h4>
          <div class="p-card-price">
            <span class="p-amount">40 000</span>
            <span class="p-period">so'm / oy</span>
          </div>
          <p class="p-card-desc">Mutlaqo CHEKSIZ mahsulotlar va to'liq erkinlik!</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>CHEKSIZ</strong> mahsulotlar kiritish</li>
          <li>✓ <strong>Excel (CSV)</strong> to'liq yuklab olish</li>
          <li>✓ Oylik va Yillik daromad tahlillari</li>
          <li>✓ Rasmlarni cheksiz yuklash</li>
          <li>✓ Qidiruv va filterlar</li>
        </ul>
        <button class="btn btn-primary plan-action-btn" onclick="openCheckout('Oylik Cheksiz', '40 000 so\'m / oy', 40000)">
          🚀 40 000 so'mga Cheksiz
        </button>
      </div>

      <!-- CARD 4: YILLIK VIP -->
      <div class="pricing-card card-vip" id="cardVip">
        <div class="p-card-header">
          <div class="p-card-tag tag-vip">1 Yillik VIP</div>
          <h4 class="p-card-title">👑 Yillik VIP</h4>
          <div class="p-card-price">
            <span class="p-amount">199 000</span>
            <span class="p-period">so'm / yil</span>
          </div>
          <div class="p-monthly-equivalent">Oyiga atigi ~16 500 so'm!</div>
          <p class="p-card-desc">Faol tadbirkorlar uchun 1 yillik VIP</p>
        </div>
        <ul class="p-features-list">
          <li>✓ <strong>Barcha Cheksiz</strong> imkoniyatlar</li>
          <li>✓ Telegram shaxsiy yordam</li>
          <li>✓ 1 yil davomida barcha yangilanishlar</li>
        </ul>
        <button class="btn btn-secondary plan-action-btn btn-vip-action" onclick="openCheckout('Yillik VIP', '199 000 so\'m / yil', 199000)">
          👑 VIP ga o'tish (199 000)
        </button>
      </div>
    `;
  }
}

function openPricingModal() {
  updatePlanBadgeUI();
  renderPricingCards();
  if (pricingModal) pricingModal.classList.add('active');
}

function closePricingModal() {
  if (pricingModal) pricingModal.classList.remove('active');
}

if (pricingBtn) pricingBtn.addEventListener('click', openPricingModal);
if (closePricingModalBtn) closePricingModalBtn.addEventListener('click', closePricingModal);

window.openCheckout = function(planName, priceText, priceNumber) {
  if (checkoutPlanTitle) checkoutPlanTitle.textContent = `${planName} ga ulanish`;
  if (checkoutPlanPrice) checkoutPlanPrice.textContent = priceText;
  if (checkoutModal) checkoutModal.classList.add('active');
};

function closeCheckoutModal() {
  if (checkoutModal) checkoutModal.classList.remove('active');
}

if (closeCheckoutModalBtn) closeCheckoutModalBtn.addEventListener('click', closeCheckoutModal);

// PROMO CODE HANDLER — EXACTLY 1 DAY (24 HOURS) TRIAL
if (applyPromoBtn && promoCodeInput) {
  applyPromoBtn.addEventListener('click', () => {
    const code = promoCodeInput.value.trim().toUpperCase();
    if (!code) {
      alert("Iltimos promokod kiriting!");
      return;
    }

    if (['PRO2026', 'ADMIN', 'START', 'VIP', 'OYDINOY', 'BARAKA'].includes(code)) {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000; // Aniq 24 soat (1 kun)
      const expiresAt = Date.now() + ONE_DAY_MS;
      localStorage.setItem(STORAGE_PLAN_EXPIRES_KEY, expiresAt.toString());
      localStorage.setItem(STORAGE_PLAN_KEY, 'yearly_vip');
      userPlan = 'yearly_vip';
      updatePlanBadgeUI();
      promoCodeInput.value = '';
      closePricingModal();
      showToast("🎉 Tabriklaymiz! Sizga 1 KUNLIK VIP sinov muddati bepul berildi!");
    } else {
      alert("❌ Noto'g'ri promokod kiritildi. Iltimos tekshirib qayta urinib ko'ring.");
    }
  });
}

// ==========================================================================
// 📲 ILOVANI O'RNATISH (CLEAN HEADER BUTTON & MODAL GUIDE)
// ==========================================================================
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function openInstallFlow() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => {
      deferredInstallPrompt = null;
    });
  } else {
    // Show Apple / Android visual guide modal
    if (installGuideModal) installGuideModal.classList.add('active');
  }
}

if (headerInstallBtn) headerInstallBtn.addEventListener('click', openInstallFlow);
if (closeInstallGuideBtn) closeInstallGuideBtn.addEventListener('click', () => {
  if (installGuideModal) installGuideModal.classList.remove('active');
});
if (gotItInstallBtn) gotItInstallBtn.addEventListener('click', () => {
  if (installGuideModal) installGuideModal.classList.remove('active');
});

// --- INITIALIZE APPLICATION ---
updatePlanBadgeUI();
updateLivePreview();
populateMonthFilterDropdown();
renderUI();

// Auto-sync items from IndexedDB
loadProductsFromIDB().then(idbProducts => {
  if (Array.isArray(idbProducts) && idbProducts.length > 0) {
    if (idbProducts.length >= products.length) {
      products = idbProducts;
      saveProducts();
      populateMonthFilterDropdown();
      renderUI();
    }
  }
});

// ==========================================================================
// PWA SERVICE WORKER REGISTRATION
// ==========================================================================
(function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // On localhost, always check for updates immediately
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let reg of registrations) {
        reg.update();
      }
    });
  }

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js?v=2105', { scope: './' });
      reg.update();
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast("Ilovaning yangi versiyasi yuklandi!");
          }
        });
      });
    } catch (err) {
      console.warn('SW:', err);
    }
  });
})();

