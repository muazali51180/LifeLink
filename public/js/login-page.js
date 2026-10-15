/**
 * Login & Account Page Logic
 * LifeLink AI — Hacktoberfest Lahore 2026
 */

import { firebaseConfig } from '../firebase-config.js';

const $ = (id) => document.getElementById(id);

let firebaseAuth = null;
let fbAuthModules = null;

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

async function initLoginPage() {
  setupTabs();
  setupDemoButtons();
  $('pageLoginForm').addEventListener('submit', handleLogin);
  $('pageSignupForm').addEventListener('submit', handleSignup);
  $('forgotPassBtn').addEventListener('click', handleForgotPass);
  $('pageLogoutBtn').addEventListener('click', handleLogout);

  await initFirebaseAuth();
}

function setupTabs() {
  $('loginTabBtn').addEventListener('click', () => {
    $('loginTabBtn').style.borderBottom = '3px solid var(--primary)';
    $('loginTabBtn').style.color = 'var(--primary)';
    $('signupTabBtn').style.borderBottom = 'none';
    $('signupTabBtn').style.color = 'var(--ink-muted)';
    $('pageLoginForm').classList.remove('hidden');
    $('pageSignupForm').classList.add('hidden');
  });

  $('signupTabBtn').addEventListener('click', () => {
    $('signupTabBtn').style.borderBottom = '3px solid var(--primary)';
    $('signupTabBtn').style.color = 'var(--primary)';
    $('loginTabBtn').style.borderBottom = 'none';
    $('loginTabBtn').style.color = 'var(--ink-muted)';
    $('pageSignupForm').classList.remove('hidden');
    $('pageLoginForm').classList.add('hidden');
  });
}

function setupDemoButtons() {
  $('demoSeekerBtn').addEventListener('click', () => {
    setLoggedInUser({
      name: 'Muhammad Usman (Seeker)',
      email: 'usman.seeker@lifelink.org',
      isAdmin: false
    });
    toast('Logged in as Demo Seeker! 🩸');
  });

  $('demoAdminBtn').addEventListener('click', () => {
    setLoggedInUser({
      name: 'LifeLink Admin',
      email: 'admin@lifelink.org',
      isAdmin: true
    });
    toast('Logged in as LifeLink Admin! 🛡️');
  });
}

async function initFirebaseAuth() {
  const isKeyConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes('PASTE_API_KEY');
  if (!isKeyConfigured) {
    console.log('💡 Note: Live Firebase key not pasted yet. Demo mode active.');
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
        const tokenResult = await user.getIdTokenResult();
        const isAdmin = tokenResult.claims?.admin === true;
        setLoggedInUser({
          name: user.displayName || user.email.split('@')[0],
          email: user.email,
          isAdmin
        });
      } else {
        showLoggedOutUI();
      }
    });

  } catch (err) {
    console.warn('Firebase init error:', err);
  }
}

function setLoggedInUser(user) {
  $('profileBox').classList.remove('hidden');
  $('authFormsContainer').classList.add('hidden');
  $('profileName').textContent = user.name;
  $('profileEmail').textContent = user.email;
  $('profileRoleBadge').textContent = user.isAdmin ? 'Role: Administrator 🛡️' : 'Role: Verified Seeker / Donor 🩸';
  $('navAdminBtn').classList.toggle('hidden', !user.isAdmin);
}

function showLoggedOutUI() {
  $('profileBox').classList.add('hidden');
  $('authFormsContainer').classList.remove('hidden');
  $('navAdminBtn').classList.add('hidden');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const statusEl = $('loginStatus');

  statusEl.className = 'form-status';
  statusEl.textContent = 'Verifying credentials...';

  if (firebaseAuth && fbAuthModules) {
    try {
      await fbAuthModules.signInWithEmailAndPassword(firebaseAuth, email, password);
      statusEl.className = 'form-status success';
      statusEl.textContent = 'Login successful!';
      toast('Login successful!');
    } catch (err) {
      statusEl.className = 'form-status error';
      statusEl.textContent = err.message || 'Login failed.';
    }
    return;
  }

  // Simulated login in demo mode
  setTimeout(() => {
    setLoggedInUser({
      name: email.split('@')[0],
      email: email,
      isAdmin: email.includes('admin')
    });
    toast('Logged in successfully (Demo Mode)!');
  }, 600);
}

async function handleSignup(e) {
  e.preventDefault();
  const name = $('signupName').value.trim();
  const email = $('signupEmail').value.trim();
  const password = $('signupPassword').value;
  const statusEl = $('signupStatus');

  statusEl.className = 'form-status';
  statusEl.textContent = 'Creating account...';

  if (firebaseAuth && fbAuthModules) {
    try {
      const cred = await fbAuthModules.createUserWithEmailAndPassword(firebaseAuth, email, password);
      await fbAuthModules.updateProfile(cred.user, { displayName: name });
      statusEl.className = 'form-status success';
      statusEl.textContent = 'Account created successfully!';
      toast('Account created!');
    } catch (err) {
      statusEl.className = 'form-status error';
      statusEl.textContent = err.message || 'Signup failed.';
    }
    return;
  }

  // Simulated signup in demo mode
  setTimeout(() => {
    setLoggedInUser({
      name: name,
      email: email,
      isAdmin: false
    });
    toast(`Welcome, ${name}!`);
  }, 600);
}

async function handleForgotPass() {
  const email = $('loginEmail').value.trim();
  const statusEl = $('loginStatus');
  if (!email) {
    statusEl.className = 'form-status error';
    statusEl.textContent = 'Please enter your email above first.';
    return;
  }

  if (firebaseAuth && fbAuthModules) {
    try {
      await fbAuthModules.sendPasswordResetEmail(firebaseAuth, email);
      statusEl.className = 'form-status success';
      statusEl.textContent = 'Password reset email sent to your inbox!';
    } catch (err) {
      statusEl.className = 'form-status error';
      statusEl.textContent = err.message;
    }
  } else {
    statusEl.className = 'form-status';
    statusEl.textContent = 'Demo Mode: Add your Firebase API key in firebase-config.js to send live reset emails.';
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

  showLoggedOutUI();
  toast('You have been signed out.');
}

window.addEventListener('DOMContentLoaded', initLoginPage);
