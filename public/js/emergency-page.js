/**
 * Emergency Appeals Page Logic
 * LifeLink AI — Hacktoberfest Lahore 2026
 */

const $ = (id) => document.getElementById(id);
let allEmergencies = [];

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

async function initEmergencyPage() {
  $('emergencyPageForm').addEventListener('submit', handleEmergencySubmit);
  $('closeContactModal').addEventListener('click', () => {
    $('contactModal').classList.add('hidden');
  });
  await loadEmergencies();
}

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
  const badge = $('emgCountBadge');
  if (badge) badge.textContent = `${allEmergencies.length} Active`;

  if (!allEmergencies.length) {
    container.innerHTML = `<div class="empty" style="padding:24px; text-align:center; background:#fff; border-radius:12px;">No active hospital blood alerts right now.</div>`;
    return;
  }

  container.innerHTML = allEmergencies.map(emg => `
    <article class="emergency-card ${emg.urgency === 'critical' ? 'critical' : ''}">
      <div class="emergency-top">
        <div class="emergency-patient">
          <h3 style="font-size:1.15rem; font-weight:800; color:var(--ink);">${escapeHtml(emg.patientName)}</h3>
          <p class="emergency-hospital" style="color:#991b1b; font-weight:600; font-size:0.92rem;">🏥 ${escapeHtml(emg.hospital)}, ${escapeHtml(emg.city)}</p>
        </div>
        <div class="emergency-blood-pill">${escapeHtml(emg.bloodGroup)}</div>
      </div>

      <div class="emergency-details">
        <span class="urgency-badge ${emg.urgency}">${escapeHtml(emg.urgency)}</span>
        <span>Bottles / Units: <strong>${escapeHtml(emg.unitsNeeded || 1)}</strong></span>
        <span>🕒 Active Appeal</span>
      </div>

      ${emg.notes ? `<p class="emergency-notes">${escapeHtml(emg.notes)}</p>` : ''}

      <div class="emergency-actions">
        <button class="btn btn-emergency" style="width:100%;" onclick="openContactAttendant('${escapeHtml(emg.patientName)}', '${escapeHtml(emg.hospital)}', '${escapeHtml(emg.bloodGroup)}', '${escapeHtml(emg.contactNumber)}')">
          🩸 Contact Hospital Attendant
        </button>
      </div>
    </article>
  `).join('');
}

async function handleEmergencySubmit(e) {
  e.preventDefault();
  const statusEl = $('emgPostStatus');
  statusEl.className = 'form-status';
  statusEl.textContent = 'Publishing emergency appeal...';

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to post appeal');

    statusEl.className = 'form-status success';
    statusEl.textContent = '✅ Urgent appeal broadcasted successfully!';
    toast('🚨 Urgent blood request published!');
    $('emergencyPageForm').reset();
    await loadEmergencies();
  } catch (err) {
    statusEl.className = 'form-status error';
    statusEl.textContent = err.message || 'Error publishing appeal.';
  }
}

window.openContactAttendant = function(patient, hospital, bloodGroup, phone) {
  $('contactDonorName').textContent = `${patient} Attendant`;
  $('contactBloodBadge').textContent = bloodGroup;
  $('contactDonorLoc').textContent = hospital;
  $('contactPhoneDisplay').textContent = phone;
  $('contactCallBtn').href = `tel:${phone.replace(/\s+/g, '')}`;

  const cleanPhone = phone.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`Hello, I saw your emergency request for ${patient} needing ${bloodGroup} blood at ${hospital} on LifeLink AI. I am reaching out to assist with blood donation.`);
  $('contactWhatsAppBtn').href = `https://wa.me/${cleanPhone}?text=${msg}`;

  $('contactModal').classList.remove('hidden');
};

window.addEventListener('DOMContentLoaded', initEmergencyPage);
