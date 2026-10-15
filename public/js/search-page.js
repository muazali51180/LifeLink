/**
 * Search & AI Matching Page Logic
 * LifeLink AI — Hacktoberfest Lahore 2026
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
let activeRequestedBlood = null;

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

async function initSearchPage() {
  setupSearchEvents();
  await loadDonors();
}

function setupSearchEvents() {
  $('aiSearchForm').addEventListener('submit', handleAiSearch);

  document.querySelectorAll('.prompt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      $('aiRequest').value = btn.dataset.prompt;
      handleAiSearch(new Event('submit'));
    });
  });

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

  $('closeContactModal').addEventListener('click', () => {
    $('contactModal').classList.add('hidden');
  });
}

async function handleAiSearch(e) {
  if (e) e.preventDefault();
  const request = $('aiRequest').value.trim();
  if (!request) return;

  const btn = $('aiSearchBtn');
  const statusEl = $('aiStatus');
  const card = $('aiParsedCard');

  btn.disabled = true;
  btn.innerHTML = '<span>⚡ Matching with AI...</span>';
  statusEl.className = 'ai-status-msg loading';
  statusEl.textContent = 'Processing request and matching with hospital compatibility rules...';
  statusEl.classList.remove('hidden');
  card.classList.add('hidden');

  try {
    const res = await fetch('/api/parse-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'AI matching failed.');

    const parsed = data.parsed;
    $('aiModelBadge').textContent = data.model || 'Groq LLaMA 3.1 8B';

    if (parsed.intent !== 'find_donors') {
      statusEl.className = 'ai-status-msg error';
      statusEl.textContent = parsed.clarification || 'Please specify both a blood group and city.';
      return;
    }

    statusEl.classList.add('hidden');

    $('parsedBlood').textContent = parsed.bloodGroup || 'Not specified';
    $('parsedCity').textContent = parsed.city || 'Any';
    $('parsedUrgency').textContent = (parsed.urgency || 'standard').toUpperCase();
    $('parsedHospital').textContent = parsed.hospital || 'Any nearby';

    const compatList = data.compatibleDonors || BLOOD_COMPATIBILITY[parsed.bloodGroup] || [parsed.bloodGroup];
    $('compatListText').textContent = compatList.length
      ? `${parsed.bloodGroup} patient can safely receive: [ ${compatList.join(', ')} ]`
      : 'Standard cross-match required';

    card.classList.remove('hidden');

    // Auto apply to directory filters
    activeRequestedBlood = parsed.bloodGroup;
    if (parsed.city) $('filterCity').value = parsed.city;
    if (parsed.bloodGroup) $('filterBlood').value = parsed.bloodGroup;
    $('showCompatibleToggle').checked = true;

    renderDonors();
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`AI matched donors for ${parsed.bloodGroup} in ${parsed.city || 'your area'}`);

  } catch (err) {
    statusEl.className = 'ai-status-msg error';
    statusEl.textContent = err.message || 'AI service error. Please try manual filters.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Match Donors With AI</span>';
  }
}

async function loadDonors() {
  try {
    const res = await fetch('/api/donors');
    const data = await res.json();
    allDonors = data.donors || [];
    renderDonors();
  } catch (err) {
    $('donorResults').innerHTML = `<div class="empty">Error loading donors directory.</div>`;
  }
}

function renderDonors() {
  const cityFilter = $('filterCity').value.trim().toLowerCase();
  const bloodFilter = $('filterBlood').value.trim().toUpperCase();
  const availableFilter = $('filterAvailable').value;
  const includeCompatible = $('showCompatibleToggle').checked;

  const targetBlood = activeRequestedBlood || bloodFilter;
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
        <p style="color: #64748b; margin: 8px 0 16px;">Try expanding search to a broader city, or broadcast an urgent hospital alert.</p>
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

  const defaultMsg = encodeURIComponent(`Hello ${name}, I found your blood donor profile on LifeLink AI. Our patient urgently requires ${bloodGroup} blood at the hospital. Could you please let us know if you are available to donate? Thank you.`);
  const cleanPhone = phone.replace(/[^\d]/g, '');
  $('contactWhatsAppBtn').href = `https://wa.me/${cleanPhone}?text=${defaultMsg}`;

  $('contactModal').classList.remove('hidden');
};

window.openWhatsApp = function(name, bloodGroup, phone) {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const message = encodeURIComponent(`Hello ${name}, I found your blood donor profile on LifeLink AI. Our patient urgently requires ${bloodGroup} blood at the hospital. Could you please let us know if you are available to donate? Thank you.`);
  window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
};

window.addEventListener('DOMContentLoaded', initSearchPage);
