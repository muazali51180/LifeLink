/**
 * LifeLink AI — Client Application
 * Hacktoberfest Lahore 2026 Edition
 */

import { firebaseConfig } from './firebase-config.js';

// Blood compatibility mapping on client
const BLOOD_COMPATIBILITY = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-']
};

const $ = (id) => document.getElementById(id);

let currentUser = {
  uid: 'demo-user-1',
  name: 'Demo Seeker',
  email: 'user@lifelink.org',
  token: 'demo-token-user-1',
  isAdmin: false,
  isFirebase: false
};

let firebaseAuth = null;
let fbAuthModules = null;
let allDonors = [];
let allEmergencies = [];
let activeRequestedBlood = null;

// Helper: Toast notification
function toast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

function escapeHtml(val) {
  return String(val || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// -------------------------------------------------------------
// 1. Initial Load & Firebase Auth Setup
// -------------------------------------------------------------
async function initApp() {
  setupEventListeners();
  await checkHealth();
  await initFirebaseAuth();
  await loadDonors();
  await loadEmergencies();
}

async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ok) {
      const badge = $('engineLabel');
      if (data.aiConfigured) {
        badge.textContent = `Groq LLaMA 3.1 8B`;
      } else {
        badge.textContent = `AI Matcher Ready`;
      }
      if ($('statTotalDonors')) $('statTotalDonors').textContent = `${data.totalDemoDonors}+`;
      if ($('statEmergencies')) $('statEmergencies').textContent = data.activeEmergencies;
    }
  } catch (err) {
    console.warn('Backend health check error:', err);
  }
}

async function initFirebaseAuth() {
  const isKeyConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('PASTE_API_KEY');
  if (!isKeyConfigured) {
    console.log('💡 Note: Firebase Web API key is not configured in firebase-config.js. Demo Auth mode active.');
    return;
  }

  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js');
    const {
      getAuth,
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut,
      onAuthStateChanged,
      sendPasswordResetEmail,
      updateProfile
    } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js');

    const app = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(app);
    fbAuthModules = {
      createUserWithEmailAndPassword,
      signInWithEmailAndPassword,
      signOut,
      sendPasswordResetEmail,
      updateProfile
    };

    onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        const idToken = await user.getIdToken();
        const tokenResult = await user.getIdTokenResult();
        const isAdmin = tokenResult.claims?.admin === true;

        currentUser = {
          uid: user.uid,
          name: user.displayName || user.email.split('@')[0],
          email: user.email,
          token: idToken,
          isAdmin,
          isFirebase: true
        };
        updateAuthUI(true);
        toast(`Logged in as ${user.email} 🔐`);
      } else {
        updateAuthUI(false);
      }
    });

    console.log('🔥 Live Firebase Authentication active for project:', firebaseConfig.projectId);
  } catch (err) {
    console.warn('⚠️ Could not connect to live Firebase Auth:', err.message);
  }
}

function updateAuthUI(isLoggedIn) {
  const navBtn = $('authNavBtn');
  const userBadge = $('userProfileBadge');
  const emailTag = $('userEmailTag');
  const adminSec = $('admin');

  if (isLoggedIn) {
    if (navBtn) navBtn.classList.add('hidden');
    if (userBadge) {
      userBadge.classList.remove('hidden');
      emailTag.textContent = currentUser.name ? `${currentUser.name} (${currentUser.isAdmin ? 'Admin' : 'User'})` : currentUser.email;
    }
    if (adminSec) adminSec.classList.toggle('hidden', !currentUser.isAdmin);
  } else {
    if (navBtn) navBtn.classList.remove('hidden');
    if (userBadge) userBadge.classList.add('hidden');
    if (adminSec) adminSec.classList.add('hidden');
  }
}

// -------------------------------------------------------------
// 2. Event Listeners & Auth Modal
// -------------------------------------------------------------
function setupEventListeners() {
  // AI Search form
  $('aiSearchForm').addEventListener('submit', handleAiSearch);

  // Quick prompt chips
  document.querySelectorAll('.prompt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.prompt;
      $('aiRequest').value = text;
      handleAiSearch(new Event('submit'));
    });
  });

  // Filter inputs
  $('searchBtn').addEventListener('click', renderDonors);
  $('resetFilterBtn').addEventListener('click', () => {
    $('filterCity').value = '';
    $('filterBlood').value = '';
    $('filterAvailable').value = 'all';
    $('showCompatibleToggle').checked = true;
    activeRequestedBlood = null;
    $('compatBadgeNote').classList.add('hidden');
    renderDonors();
  });
  $('filterCity').addEventListener('input', renderDonors);
  $('filterBlood').addEventListener('change', () => {
    activeRequestedBlood = $('filterBlood').value;
    renderDonors();
  });
  $('filterAvailable').addEventListener('change', renderDonors);
  $('showCompatibleToggle').addEventListener('change', renderDonors);

  // Donor Registration form
  $('donorForm').addEventListener('submit', handleDonorRegistration);

  // Emergency Modal
  $('openEmergencyModalBtn').addEventListener('click', () => toggleEmergencyModal(true));
  $('openEmergencyBtn2').addEventListener('click', () => toggleEmergencyModal(true));
  $('closeEmergencyModal').addEventListener('click', () => toggleEmergencyModal(false));
  $('cancelEmergencyBtn').addEventListener('click', () => toggleEmergencyModal(false));
  $('emergencyForm').addEventListener('submit', handleEmergencySubmit);

  // Contact Modal
  $('closeContactModal').addEventListener('click', () => toggleContactModal(false));

  // Quick Demo Buttons
  $('demoLoginUser').addEventListener('click', () => switchDemoRole(false));
  $('demoLoginAdmin').addEventListener('click', () => switchDemoRole(true));
  $('quickDemoBtn').addEventListener('click', () => switchDemoRole(!currentUser.isAdmin));

  // Firebase Auth Modal Handlers
  if ($('authNavBtn')) {
    $('authNavBtn').addEventListener('click', () => toggleAuthModal(true));
  }
  if ($('closeAuthModal')) {
    $('closeAuthModal').addEventListener('click', () => toggleAuthModal(false));
  }
  if ($('logoutBtn')) {
    $('logoutBtn').addEventListener('click', handleLogout);
  }

  // Auth Tabs (Login vs Sign Up)
  if ($('tabLogin') && $('tabSignup')) {
    $('tabLogin').addEventListener('click', () => switchAuthTab('login'));
    $('tabSignup').addEventListener('click', () => switchAuthTab('signup'));
  }

  // Firebase Login Form
  if ($('firebaseLoginForm')) {
    $('firebaseLoginForm').addEventListener('submit', handleFirebaseLogin);
  }

  // Firebase Sign Up Form
  if ($('firebaseSignupForm')) {
    $('firebaseSignupForm').addEventListener('submit', handleFirebaseSignup);
  }

  // Forgot Password
  if ($('fbForgotBtn')) {
    $('fbForgotBtn').addEventListener('click', handleForgotPassword);
  }
}

function toggleAuthModal(show) {
  const el = $('authModal');
  if (el) el.classList.toggle('hidden', !show);
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('tabLogin').style.borderBottom = isLogin ? '3px solid #dc2626' : 'none';
  $('tabLogin').style.color = isLogin ? '#dc2626' : '#64748b';
  $('tabSignup').style.borderBottom = !isLogin ? '3px solid #dc2626' : 'none';
  $('tabSignup').style.color = !isLogin ? '#dc2626' : '#64748b';

  $('firebaseLoginForm').classList.toggle('hidden', !isLogin);
  $('firebaseSignupForm').classList.toggle('hidden', isLogin);
}

async function handleFirebaseLogin(e) {
  e.preventDefault();
  const email = $('fbLoginEmail').value.trim();
  const password = $('fbLoginPassword').value;
  const statusEl = $('fbAuthStatus');

  statusEl.className = 'form-status';
  statusEl.textContent = 'Verifying credentials...';

  // If live Firebase Auth is ready
  if (firebaseAuth && fbAuthModules) {
    try {
      await fbAuthModules.signInWithEmailAndPassword(firebaseAuth, email, password);
      statusEl.className = 'form-status success';
      statusEl.textContent = 'Login successful!';
      toggleAuthModal(false);
      $('firebaseLoginForm').reset();
    } catch (err) {
      statusEl.className = 'form-status error';
      statusEl.textContent = err.message || 'Firebase login failed.';
    }
    return;
  }

  // Offline / Demo Mode fallback login
  currentUser = {
    uid: `user-${Date.now()}`,
    name: email.split('@')[0],
    email: email,
    token: email.includes('admin') ? 'demo-token-admin' : `demo-token-${email}`,
    isAdmin: email.includes('admin'),
    isFirebase: false
  };

  statusEl.className = 'form-status success';
  statusEl.textContent = 'Logged in (Demo Mode). Add Firebase Web apiKey in firebase-config.js for live cloud auth.';
  setTimeout(() => {
    toggleAuthModal(false);
    updateAuthUI(true);
    toast(`Welcome, ${currentUser.name}!`);
  }, 1000);
}

async function handleFirebaseSignup(e) {
  e.preventDefault();
  const name = $('fbSignupName').value.trim();
  const email = $('fbSignupEmail').value.trim();
  const password = $('fbSignupPassword').value;
  const statusEl = $('fbSignupStatus');

  statusEl.className = 'form-status';
  statusEl.textContent = 'Creating account...';

  if (firebaseAuth && fbAuthModules) {
    try {
      const cred = await fbAuthModules.createUserWithEmailAndPassword(firebaseAuth, email, password);
      await fbAuthModules.updateProfile(cred.user, { displayName: name });
      statusEl.className = 'form-status success';
      statusEl.textContent = 'Account created successfully!';
      toggleAuthModal(false);
      $('firebaseSignupForm').reset();
    } catch (err) {
      statusEl.className = 'form-status error';
      statusEl.textContent = err.message || 'Signup failed.';
    }
    return;
  }

  // Offline / Demo Mode fallback signup
  currentUser = {
    uid: `user-${Date.now()}`,
    name: name,
    email: email,
    token: `demo-token-${email}`,
    isAdmin: false,
    isFirebase: false
  };

  statusEl.className = 'form-status success';
  statusEl.textContent = 'Account registered in Demo Mode!';
  setTimeout(() => {
    toggleAuthModal(false);
    updateAuthUI(true);
    toast(`Welcome to LifeLink, ${name}!`);
  }, 1000);
}

async function handleForgotPassword() {
  const email = $('fbLoginEmail').value.trim();
  const statusEl = $('fbAuthStatus');
  if (!email) {
    statusEl.className = 'form-status error';
    statusEl.textContent = 'Please enter your email above first.';
    return;
  }

  if (firebaseAuth && fbAuthModules) {
    try {
      await fbAuthModules.sendPasswordResetEmail(firebaseAuth, email);
      statusEl.className = 'form-status success';
      statusEl.textContent = 'Password reset link sent to your inbox!';
    } catch (err) {
      statusEl.className = 'form-status error';
      statusEl.textContent = err.message;
    }
  } else {
    statusEl.className = 'form-status';
    statusEl.textContent = 'Demo Mode: Connect live Firebase in firebase-config.js to enable reset emails.';
  }
}

async function handleLogout() {
  if (firebaseAuth && fbAuthModules) {
    try {
      await fbAuthModules.signOut(firebaseAuth);
    } catch (err) {
      console.warn('Sign out error:', err);
    }
  }

  currentUser = {
    uid: 'guest',
    name: '',
    email: '',
    token: '',
    isAdmin: false,
    isFirebase: false
  };

  updateAuthUI(false);
  toast('You have been logged out.');
}

function switchDemoRole(isAdmin) {
  currentUser = {
    uid: isAdmin ? 'demo-admin' : 'demo-user-1',
    name: isAdmin ? 'LifeLink Administrator' : 'Demo Seeker',
    email: isAdmin ? 'admin@lifelink.org' : 'user@lifelink.org',
    token: isAdmin ? 'demo-token-admin' : 'demo-token-user-1',
    isAdmin,
    isFirebase: false
  };

  updateAuthUI(true);
  toast(isAdmin ? 'Switched to Admin Role 🛡️' : 'Switched to Seeker/Donor Role 🩸');
  if (isAdmin) loadAdminData();
}

// -------------------------------------------------------------
// 3. AI Natural Language Search & Matching
// -------------------------------------------------------------
async function handleAiSearch(e) {
  if (e) e.preventDefault();
  const request = $('aiRequest').value.trim();
  if (!request) return;

  const button = $('aiSearchBtn');
  const statusEl = $('aiStatus');
  const parsedCard = $('aiParsedCard');

  button.disabled = true;
  button.innerHTML = '<span>⚡ Matching with AI...</span>';
  statusEl.className = 'ai-status-msg loading';
  statusEl.textContent = 'Analyzing request on backend and searching compatible donors...';
  statusEl.classList.remove('hidden');
  parsedCard.classList.add('hidden');

  try {
    const res = await fetch('/api/parse-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.token || 'demo-token'}`
      },
      body: JSON.stringify({ request })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'AI matching request failed.');
    }

    const parsed = data.parsed;
    $('aiModelBadge').textContent = data.model || 'Groq LLaMA 3.1 8B';

    if (parsed.intent !== 'find_donors') {
      statusEl.className = 'ai-status-msg error';
      statusEl.textContent = parsed.clarification || 'Please specify both a blood group and city.';
      return;
    }

    statusEl.classList.add('hidden');

    // Populate AI Result Card
    $('parsedBlood').textContent = parsed.bloodGroup || 'Not specified';
    $('parsedCity').textContent = parsed.city || 'Any';
    $('parsedUrgency').textContent = (parsed.urgency || 'standard').toUpperCase();
    $('parsedHospital').textContent = parsed.hospital || 'Any nearby';

    // Show compatibility list
    const compatList = data.compatibleDonors || BLOOD_COMPATIBILITY[parsed.bloodGroup] || [parsed.bloodGroup];
    $('compatListText').textContent = compatList.length
      ? `${parsed.bloodGroup} patient can safely receive: [ ${compatList.join(', ')} ]`
      : 'Standard cross-match required';

    parsedCard.classList.remove('hidden');

    // Automatically apply to directory filters
    activeRequestedBlood = parsed.bloodGroup;
    if (parsed.city) $('filterCity').value = parsed.city;
    if (parsed.bloodGroup) $('filterBlood').value = parsed.bloodGroup;
    $('showCompatibleToggle').checked = true;

    renderDonors();

    // Scroll smoothly to matched directory
    document.querySelector('#find').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`AI matched donors for ${parsed.bloodGroup} in ${parsed.city || 'your area'}`);

  } catch (err) {
    statusEl.className = 'ai-status-msg error';
    statusEl.textContent = err.message || 'AI service error. Please try again.';
  } finally {
    button.disabled = false;
    button.innerHTML = '<span>Match Donors With AI</span>';
  }
}

// -------------------------------------------------------------
// 4. Load & Render Donors
// -------------------------------------------------------------
async function loadDonors() {
  try {
    const res = await fetch('/api/donors');
    const data = await res.json();
    allDonors = data.donors || [];
    renderDonors();
  } catch (err) {
    console.error('Error loading donors:', err);
    $('donorResults').innerHTML = `<div class="empty">Could not load donor listings. Check backend connection.</div>`;
  }
}

function renderDonors() {
  const cityFilter = $('filterCity').value.trim().toLowerCase();
  const bloodFilter = $('filterBlood').value.trim().toUpperCase();
  const availableFilter = $('filterAvailable').value;
  const includeCompatible = $('showCompatibleToggle').checked;

  const targetBlood = activeRequestedBlood || bloodFilter;
  const compatibleTypes = (includeCompatible && targetBlood) ? (BLOOD_COMPATIBILITY[targetBlood] || [targetBlood]) : (targetBlood ? [targetBlood] : null);

  let filtered = allDonors.filter(donor => {
    // City filter
    if (cityFilter) {
      const donorCity = (donor.cityLower || donor.city || '').toLowerCase();
      const donorArea = (donor.area || '').toLowerCase();
      if (!donorCity.includes(cityFilter) && !donorArea.includes(cityFilter)) {
        return false;
      }
    }

    // Blood filter
    if (compatibleTypes) {
      if (!compatibleTypes.includes(donor.bloodGroup)) return false;
    }

    // Availability filter
    if (availableFilter === 'available' && !donor.available) {
      return false;
    }

    return true;
  });

  // Update counter
  $('resultsCount').textContent = `${filtered.length} donor(s) found`;
  if (compatibleTypes && compatibleTypes.length > 1) {
    $('compatBadgeNote').classList.remove('hidden');
    $('compatBadgeNote').textContent = `Showing compatible donors: ${compatibleTypes.join(', ')}`;
  } else {
    $('compatBadgeNote').classList.add('hidden');
  }

  const container = $('donorResults');
  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty" style="grid-column: 1/-1; padding: 40px; text-align: center; background: #fff; border-radius: 16px; border: 1px dashed #cbd5e1;">
        <h3>No matching donors found in this location.</h3>
        <p style="color: #64748b; margin: 8px 0 16px;">Try searching a broader city, turning on compatible donors, or post an urgent emergency appeal below.</p>
        <button class="btn btn-emergency" onclick="document.getElementById('openEmergencyModalBtn').click()">🚨 Post Urgent Hospital Blood Request</button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(donor => {
    const isExactMatch = targetBlood && donor.bloodGroup === targetBlood;
    const isCompatible = targetBlood && !isExactMatch && compatibleTypes?.includes(donor.bloodGroup);

    return `
      <article class="donor-card">
        <div class="donor-card-top">
          <div class="blood-badge-large">${escapeHtml(donor.bloodGroup)}</div>
          <div class="donor-info">
            <h3>${escapeHtml(donor.name)}</h3>
            <p class="donor-location">📍 ${escapeHtml(donor.area ? `${donor.area}, ${donor.city}` : donor.city)}</p>
            <div class="donor-badges">
              <span class="status-chip ${donor.available ? 'available' : 'unavailable'}">
                ${donor.available ? '🟢 Available' : '⚪ Unavailable'}
              </span>
              ${isExactMatch ? '<span class="compat-donor-badge" style="background:#fef2f2; color:#b91c1c; border-color:#fecaca;">Exact Match</span>' : ''}
              ${isCompatible ? '<span class="compat-donor-badge">Compatible Donor</span>' : ''}
              ${donor.bloodGroup === 'O-' ? '<span class="compat-donor-badge" style="background:#f0fdf4; color:#166534; border-color:#bbf7d0;">Universal Donor</span>' : ''}
            </div>
          </div>
        </div>

        <div class="donor-card-actions">
          <button class="btn btn-contact-call" onclick="openContactModal('${escapeHtml(donor.name)}', '${escapeHtml(donor.bloodGroup)}', '${escapeHtml(donor.city)}', '${escapeHtml(donor.phone || '+92 300 0000000')}')">
            📞 Direct Call
          </button>
          <button class="btn btn-contact-wa" onclick="openWhatsApp('${escapeHtml(donor.name)}', '${escapeHtml(donor.bloodGroup)}', '${escapeHtml(donor.phone || '+92 300 0000000')}')">
            💬 WhatsApp
          </button>
        </div>
      </article>
    `;
  }).join('');
}

// -------------------------------------------------------------
// 5. Direct Contact & WhatsApp Handlers
// -------------------------------------------------------------
window.openContactModal = function(name, bloodGroup, city, phone) {
  $('contactDonorName').textContent = name;
  $('contactBloodBadge').textContent = bloodGroup;
  $('contactDonorLoc').textContent = city;
  $('contactPhoneDisplay').textContent = phone;
  $('contactCallBtn').href = `tel:${phone.replace(/\s+/g, '')}`;

  const defaultMsg = encodeURIComponent(`Assalam-o-Alaikum ${name}, mujhe LifeLink AI par aapka blood donor profile mila. Hamare patient ko hospital mein urgent ${bloodGroup} blood ki zaroorat hai. Kya aap rabta kar sakte hain?`);
  const cleanPhone = phone.replace(/[^\d]/g, '');
  $('contactWhatsAppBtn').href = `https://wa.me/${cleanPhone}?text=${defaultMsg}`;

  toggleContactModal(true);
};

window.openWhatsApp = function(name, bloodGroup, phone) {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const message = encodeURIComponent(`Assalam-o-Alaikum ${name}, mujhe LifeLink AI par aapka blood donor profile mila. Hamare patient ko hospital mein urgent ${bloodGroup} blood ki zaroorat hai. Kya aap help kar sakte hain?`);
  window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
};

function toggleContactModal(show) {
  const el = $('contactModal');
  if (el) el.classList.toggle('hidden', !show);
}

// -------------------------------------------------------------
// 6. Emergency Blood Requests Feed
// -------------------------------------------------------------
async function loadEmergencies() {
  try {
    const res = await fetch('/api/emergencies');
    const data = await res.json();
    allEmergencies = data.emergencies || [];
    renderEmergencies();
  } catch (err) {
    console.error('Error loading emergencies:', err);
  }
}

function renderEmergencies() {
  const container = $('emergencyList');
  if (!container) return;

  if (!allEmergencies.length) {
    container.innerHTML = `<div class="empty" style="grid-column: 1/-1; padding: 24px; text-align: center; background: #fff; border-radius: 12px;">No active hospital blood alerts right now.</div>`;
    return;
  }

  container.innerHTML = allEmergencies.map(emg => `
    <article class="emergency-card ${emg.urgency === 'critical' ? 'critical' : ''}">
      <div class="emergency-top">
        <div class="emergency-patient">
          <h3>${escapeHtml(emg.patientName)}</h3>
          <p class="emergency-hospital">🏥 ${escapeHtml(emg.hospital)}, ${escapeHtml(emg.city)}</p>
        </div>
        <div class="emergency-blood-pill">${escapeHtml(emg.bloodGroup)}</div>
      </div>

      <div class="emergency-details">
        <span class="urgency-badge ${emg.urgency}">${escapeHtml(emg.urgency)}</span>
        <span>Units: <strong>${escapeHtml(emg.unitsNeeded || 1)}</strong></span>
        <span>🕒 Posted recently</span>
      </div>

      ${emg.notes ? `<p class="emergency-notes">${escapeHtml(emg.notes)}</p>` : ''}

      <div class="emergency-actions">
        <button class="btn btn-emergency btn-sm" style="width: 100%;" onclick="openContactModal('${escapeHtml(emg.patientName)} Attendant', '${escapeHtml(emg.bloodGroup)}', '${escapeHtml(emg.hospital)}', '${escapeHtml(emg.contactNumber)}')">
          🩸 Contact Hospital / Attendant
        </button>
      </div>
    </article>
  `).join('');
}

function toggleEmergencyModal(show) {
  const el = $('emergencyModal');
  if (el) el.classList.toggle('hidden', !show);
}

async function handleEmergencySubmit(e) {
  e.preventDefault();
  const payload = {
    patientName: $('emgPatient').value.trim(),
    hospital: $('emgHospital').value.trim(),
    city: $('emgCity').value.trim(),
    bloodGroup: $('emgBlood').value,
    unitsNeeded: Number($('emgUnits').value) || 1,
    urgency: $('emgUrgency').value,
    contactNumber: $('emgContact').value.trim(),
    notes: $('emgNotes').value.trim()
  };

  try {
    const res = await fetch('/api/emergencies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.token || 'demo-token'}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to post emergency request');

    toast('🚨 Urgent blood appeal broadcasted successfully!');
    $('emergencyForm').reset();
    toggleEmergencyModal(false);
    await loadEmergencies();
    document.querySelector('#emergency').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(err.message);
  }
}

// -------------------------------------------------------------
// 7. Donor Registration
// -------------------------------------------------------------
async function handleDonorRegistration(e) {
  e.preventDefault();
  const statusEl = $('donorRegStatus');

  const payload = {
    name: $('donorName').value.trim(),
    phone: $('donorPhone').value.trim(),
    city: $('donorCity').value.trim(),
    area: $('donorArea').value.trim(),
    bloodGroup: $('donorBlood').value,
    available: $('donorAvailable').value === 'yes',
    consent: $('donorConsent').checked
  };

  try {
    statusEl.className = 'form-status';
    statusEl.textContent = 'Saving donor profile...';

    const res = await fetch('/api/donors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.token || 'demo-token'}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    statusEl.className = 'form-status success';
    statusEl.textContent = '✅ Donor profile registered successfully! You are now part of LifeLink AI.';
    toast('Donor profile registered!');
    $('donorForm').reset();
    await loadDonors();
  } catch (err) {
    statusEl.className = 'form-status error';
    statusEl.textContent = err.message || 'Could not save profile.';
  }
}

// -------------------------------------------------------------
// 8. Admin Control Center
// -------------------------------------------------------------
async function loadAdminData() {
  if (!currentUser.isAdmin) return;
  try {
    const donorRes = await fetch('/api/donors');
    const donorData = await donorRes.json();
    const donors = donorData.donors || [];

    const donorsContainer = $('adminDonorsList');
    if (donorsContainer) {
      donorsContainer.innerHTML = donors.map(d => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #e2e8f0;">
          <div>
            <strong>${escapeHtml(d.name)} (${escapeHtml(d.bloodGroup)})</strong>
            <p style="font-size:0.8rem; color:#64748b;">${escapeHtml(d.city)} · ${escapeHtml(d.phone)}</p>
          </div>
          <button class="btn btn-sm btn-outline" style="color:#b91c1c;" onclick="deleteDonor('${d.id}')">Delete</button>
        </div>
      `).join('');
    }

    const emgRes = await fetch('/api/emergencies');
    const emgData = await emgRes.json();
    const emergencies = emgData.emergencies || [];

    const emgContainer = $('adminEmergenciesList');
    if (emgContainer) {
      emgContainer.innerHTML = emergencies.map(e => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #e2e8f0;">
          <div>
            <strong>${escapeHtml(e.patientName)} (${escapeHtml(e.bloodGroup)})</strong>
            <p style="font-size:0.8rem; color:#64748b;">${escapeHtml(e.hospital)}</p>
          </div>
          <button class="btn btn-sm btn-outline" style="color:#b91c1c;" onclick="deleteEmergency('${e.id}')">Resolve / Delete</button>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading admin data:', err);
  }
}

window.deleteDonor = async function(id) {
  if (!confirm('Are you sure you want to remove this donor profile?')) return;
  try {
    const res = await fetch(`/api/donors/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    if (res.ok) {
      toast('Donor removed.');
      await loadDonors();
      await loadAdminData();
    }
  } catch (err) {
    alert('Delete failed');
  }
};

window.deleteEmergency = async function(id) {
  if (!confirm('Mark this hospital emergency as resolved?')) return;
  try {
    const res = await fetch(`/api/emergencies/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentUser.token}` }
    });
    if (res.ok) {
      toast('Emergency request resolved.');
      await loadEmergencies();
      await loadAdminData();
    }
  } catch (err) {
    alert('Delete failed');
  }
};

// Initialize application on DOM load
window.addEventListener('DOMContentLoaded', initApp);
