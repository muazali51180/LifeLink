/**
 * Donors Directory Page Logic
 * LifeLink — Hacktoberfest Lahore 2026
 */

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
let allDonors = [];
let activeTargetBlood = null;

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

function escapeHtml(val) {
  return String(val || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function initDonorsPage() {
  setupEvents();
  applyUrlParams();
  await loadDonors();
}

function setupEvents() {
  $('searchBtn').addEventListener('click', renderDonors);
  $('resetFilterBtn').addEventListener('click', () => {
    $('filterCity').value = '';
    $('filterBlood').value = '';
    $('filterAvailable').value = 'all';
    $('showCompatibleToggle').checked = true;
    activeTargetBlood = null;
    $('compatBadgeNote').classList.add('hidden');
    renderDonors();
  });

  $('filterCity').addEventListener('input', renderDonors);
  $('filterBlood').addEventListener('change', () => {
    activeTargetBlood = $('filterBlood').value;
    renderDonors();
  });
  $('filterAvailable').addEventListener('change', renderDonors);
  $('showCompatibleToggle').addEventListener('change', renderDonors);

  $('closeContactModal').addEventListener('click', () => {
    $('contactModal').classList.add('hidden');
  });
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const blood = params.get('blood');
  const city = params.get('city');
  const compat = params.get('compatible');

  if (blood) {
    $('filterBlood').value = blood.toUpperCase();
    activeTargetBlood = blood.toUpperCase();
  }
  if (city) {
    $('filterCity').value = city;
  }
  if (compat !== null) {
    $('showCompatibleToggle').checked = (compat === 'true');
  }
}

async function loadDonors() {
  try {
    const res = await fetch('/api/donors');
    const data = await res.json();
    allDonors = data.donors || [];
    renderDonors();
  } catch (err) {
    $('donorResults').innerHTML = `<div class="empty">Error loading donor listings.</div>`;
  }
}

function renderDonors() {
  const cityFilter = $('filterCity').value.trim().toLowerCase();
  const bloodFilter = $('filterBlood').value.trim().toUpperCase();
  const availableFilter = $('filterAvailable').value;
  const includeCompatible = $('showCompatibleToggle').checked;

  const targetBlood = activeTargetBlood || bloodFilter;
  const compatibleTypes = (includeCompatible && targetBlood) ? (BLOOD_COMPATIBILITY[targetBlood] || [targetBlood]) : (targetBlood ? [targetBlood] : null);

  const filtered = allDonors.filter(donor => {
    if (cityFilter) {
      const donorCity = (donor.cityLower || donor.city || '').toLowerCase();
      const donorArea = (donor.area || '').toLowerCase();
      if (!donorCity.includes(cityFilter) && !donorArea.includes(cityFilter)) return false;
    }
    if (compatibleTypes && !compatibleTypes.includes(donor.bloodGroup)) return false;
    if (availableFilter === 'available' && !donor.available) return false;
    return true;
  });

  $('resultsCount').textContent = `${filtered.length} donor(s) available`;
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
        <p style="color: #64748b; margin: 8px 0 16px;">Try expanding search to a broader city, or post an emergency request for your patient.</p>
        <a class="btn btn-emergency" href="/emergency">🚨 Post Urgent Hospital Blood Request</a>
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

window.openContactModal = function(name, bloodGroup, city, phone) {
  $('contactDonorName').textContent = name;
  $('contactBloodBadge').textContent = bloodGroup;
  $('contactDonorLoc').textContent = city;
  $('contactPhoneDisplay').textContent = phone;
  $('contactCallBtn').href = `tel:${phone.replace(/\s+/g, '')}`;

  const defaultMsg = encodeURIComponent(`Hello ${name}, I found your blood donor profile on LifeLink. Our patient urgently requires ${bloodGroup} blood at the hospital. Could you please let us know if you are available to donate? Thank you.`);
  const cleanPhone = phone.replace(/[^\d]/g, '');
  $('contactWhatsAppBtn').href = `https://wa.me/${cleanPhone}?text=${defaultMsg}`;

  $('contactModal').classList.remove('hidden');
};

window.openWhatsApp = function(name, bloodGroup, phone) {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const message = encodeURIComponent(`Hello ${name}, I found your blood donor profile on LifeLink. Our patient urgently requires ${bloodGroup} blood at the hospital. Could you please let us know if you are available to donate? Thank you.`);
  window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
};

window.addEventListener('DOMContentLoaded', initDonorsPage);
