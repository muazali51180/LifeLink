/**
 * Blood Matching Page Logic
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

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3500);
}

function initBloodMatching() {
  $('bloodMatchForm').addEventListener('submit', handleMatchSubmit);

  document.querySelectorAll('.prompt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      $('matchRequest').value = btn.dataset.prompt;
      handleMatchSubmit(new Event('submit'));
    });
  });
}

async function handleMatchSubmit(e) {
  if (e) e.preventDefault();
  const request = $('matchRequest').value.trim();
  if (!request) return;

  const btn = $('matchSubmitBtn');
  const statusEl = $('matchStatusMsg');
  const card = $('matchResultCard');

  btn.disabled = true;
  btn.innerHTML = '<span>⚡ Matching...</span>';
  statusEl.className = 'ai-status-msg loading';
  statusEl.textContent = 'Analyzing request and searching clinical compatibility matrix...';
  statusEl.classList.remove('hidden');
  card.classList.add('hidden');

  try {
    const res = await fetch('/api/parse-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Matching request failed.');

    const parsed = data.parsed;
    if (parsed.intent !== 'find_donors') {
      statusEl.className = 'ai-status-msg error';
      statusEl.textContent = parsed.clarification || 'Please specify both a blood group and city.';
      return;
    }

    statusEl.classList.add('hidden');

    $('resBlood').textContent = parsed.bloodGroup || 'Not specified';
    $('resCity').textContent = parsed.city || 'Any';
    $('resUrgency').textContent = (parsed.urgency || 'standard').toUpperCase();
    $('resHospital').textContent = parsed.hospital || 'Any nearby';
    $('matchEngineBadge').textContent = data.model ? `Engine: ${data.model}` : 'Engine: LLaMA 3.1 8B';

    const compatList = data.compatibleDonors || BLOOD_COMPATIBILITY[parsed.bloodGroup] || [parsed.bloodGroup];
    $('resCompatText').textContent = compatList.length
      ? `${parsed.bloodGroup} patient can safely receive red blood cells from: [ ${compatList.join(', ')} ]`
      : 'Standard cross-match required';

    // Query donor count to show preview on button
    let count = 0;
    try {
      const donorRes = await fetch(`/api/donors?city=${encodeURIComponent(parsed.city || '')}&bloodGroup=${encodeURIComponent(parsed.bloodGroup || '')}&compatible=true&availableOnly=true`);
      const donorData = await donorRes.json();
      count = donorData.total || 0;
    } catch (_) {}

    const headline = $('matchedDonorsHeadline');
    if (count > 0) {
      headline.textContent = `🎯 ${count} Compatible Donor(s) Found in ${parsed.city || 'Your Area'}!`;
    } else {
      headline.textContent = `🎯 Matching Filters Ready for ${parsed.bloodGroup} in ${parsed.city || 'Your Area'}`;
    }

    // Set destination URL to the new dedicated Donors page
    const donorsUrl = `/donors?blood=${encodeURIComponent(parsed.bloodGroup || '')}&city=${encodeURIComponent(parsed.city || '')}&compatible=true`;
    const actionBtn = $('viewMatchedDonorsBtn');
    actionBtn.href = donorsUrl;
    actionBtn.innerHTML = `<span>👉 View Matched Donors (${count} Available) &rarr;</span>`;

    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    toast(`Matching complete! Found ${count} compatible donor(s).`);

  } catch (err) {
    statusEl.className = 'ai-status-msg error';
    statusEl.textContent = err.message || 'Error processing request.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Match Donors</span>';
  }
}

window.addEventListener('DOMContentLoaded', initBloodMatching);
