import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import Groq from 'groq-sdk';
import {
  validateParsedRequest,
  validateUserRequest,
  getCompatibleDonors,
  canDonate,
  heuristicParseRequest,
  BLOOD_GROUPS
} from './lib/parse-request.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 5000);

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '16kb' }));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://www.googleapis.com https://api.groq.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  next();
});

// Simple in-memory IP rate limiter for API endpoints
const rateMap = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || req.connection.remoteAddress || 'client';
  const now = Date.now();
  const entry = rateMap.get(key) || { start: now, count: 0 };
  if (now - entry.start > 60_000) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count += 1;
  rateMap.set(key, entry);
  if (entry.count > 40) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }
  next();
}

// -------------------------------------------------------------
// Firebase Admin Initialization
// -------------------------------------------------------------
let adminReady = false;
try {
  if (getApps().length === 0) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
      adminReady = true;
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      initializeApp({ credential: applicationDefault() });
      adminReady = true;
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      adminReady = true;
    }
  } else {
    adminReady = true;
  }
} catch (error) {
  console.warn('⚠️ Firebase Admin initialization deferred. Offline Demo Mode available.', error.message);
}

const offlineDemoMode = !adminReady || process.env.ENABLE_OFFLINE_DEMO_STORE === 'true';

// -------------------------------------------------------------
// In-Memory Demo Store (Populated with realistic Pakistani blood donor data)
// -------------------------------------------------------------
let demoDonors = [
  { id: 'donor-1', uid: 'user-1', name: 'Muhammad Usman', city: 'Lahore', cityLower: 'lahore', area: 'Gulberg III', bloodGroup: 'O+', available: true, phone: '+92 300 1234567', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-2', uid: 'user-2', name: 'Fatima Zahra', city: 'Lahore', cityLower: 'lahore', area: 'Johar Town', bloodGroup: 'A+', available: true, phone: '+92 321 7654321', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-3', uid: 'user-3', name: 'Ali Raza', city: 'Lahore', cityLower: 'lahore', area: 'DHA Phase 5', bloodGroup: 'B+', available: true, phone: '+92 333 9876543', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-4', uid: 'user-4', name: 'Ayesha Khan', city: 'Lahore', cityLower: 'lahore', area: 'Model Town', bloodGroup: 'O-', available: true, phone: '+92 301 4567890', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-5', uid: 'user-5', name: 'Bilal Ahmed', city: 'Karachi', cityLower: 'karachi', area: 'Clifton Block 2', bloodGroup: 'AB+', available: true, phone: '+92 312 3456789', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-6', uid: 'user-6', name: 'Zainab Malik', city: 'Islamabad', cityLower: 'islamabad', area: 'Sector F-8', bloodGroup: 'B-', available: true, phone: '+92 345 5678901', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-7', uid: 'user-7', name: 'Hamza Tariq', city: 'Rawalpindi', cityLower: 'rawalpindi', area: 'Saddar Cantt', bloodGroup: 'A-', available: true, phone: '+92 302 2345678', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-8', uid: 'user-8', name: 'Saad Farooq', city: 'Faisalabad', cityLower: 'faisalabad', area: 'D-Ground', bloodGroup: 'O+', available: true, phone: '+92 334 6789012', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-9', uid: 'user-9', name: 'Sana Noor', city: 'Lahore', cityLower: 'lahore', area: 'Anarkali / Old City', bloodGroup: 'AB-', available: true, phone: '+92 304 8901234', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-10', uid: 'user-10', name: 'Dr. Omer Siddiqui', city: 'Multan', cityLower: 'multan', area: 'Cantt', bloodGroup: 'B+', available: false, phone: '+92 313 1122334', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-11', uid: 'user-11', name: 'Khadija Bibi', city: 'Lahore', cityLower: 'lahore', area: 'Faisal Town', bloodGroup: 'O+', available: true, phone: '+92 322 4455667', consent: true, createdAt: new Date().toISOString() },
  { id: 'donor-12', uid: 'user-12', name: 'Zeeshan Arshad', city: 'Peshawar', cityLower: 'peshawar', area: 'University Town', bloodGroup: 'A+', available: true, phone: '+92 331 7788990', consent: true, createdAt: new Date().toISOString() }
];

let demoEmergencies = [
  {
    id: 'emg-1',
    patientName: 'Baby Arham (Thalassemia Patient)',
    hospital: "Children's Hospital Lahore",
    city: 'Lahore',
    bloodGroup: 'O-',
    unitsNeeded: 2,
    urgency: 'critical',
    contactNumber: '+92 300 9988776',
    notes: 'Urgent red blood cells transfusion needed for pediatric thalassemia patient.',
    createdAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'emg-2',
    patientName: 'Mrs. Perveen Akhtar (Surgery)',
    hospital: 'Services Hospital Lahore',
    city: 'Lahore',
    bloodGroup: 'B+',
    unitsNeeded: 3,
    urgency: 'urgent',
    contactNumber: '+92 321 5544332',
    notes: 'Emergency cardiac surgery scheduled today. Cross-match required.',
    createdAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: 'emg-3',
    patientName: 'Tariq Mahmood (Trauma)',
    hospital: 'Mayo Hospital Emergency Ward',
    city: 'Lahore',
    bloodGroup: 'A+',
    unitsNeeded: 2,
    urgency: 'critical',
    contactNumber: '+92 333 2211445',
    notes: 'Accident trauma patient in emergency ICU. Immediate donor required.',
    createdAt: new Date(Date.now() - 10800000).toISOString()
  }
];

// -------------------------------------------------------------
// Groq AI Client Setup (Llama 3.1 8B Instant)
// -------------------------------------------------------------
const groqApiKey = process.env.GROQ_API_KEY?.trim() || '';
const groqModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
let groqClient = null;

if (groqApiKey && !groqApiKey.includes('your_groq_api_key')) {
  try {
    groqClient = new Groq({ apiKey: groqApiKey });
    console.log(`🤖 Groq AI Client initialized with model: ${groqModel}`);
  } catch (err) {
    console.warn('⚠️ Could not initialize Groq SDK:', err.message);
  }
} else {
  console.log('💡 Note: GROQ_API_KEY not set or empty. Built-in heuristic parser active for offline demo.');
}

// -------------------------------------------------------------
// Authentication Helper Middleware
// -------------------------------------------------------------
async function authenticateRequest(req, res, next) {
  const authHeader = req.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : null;

  // Demo token or demo mode bypass
  if (token && token.startsWith('demo-token-')) {
    req.user = {
      uid: token.replace('demo-token-', ''),
      email: token.includes('admin') ? 'admin@lifelink.org' : 'user@lifelink.org',
      admin: token.includes('admin')
    };
    return next();
  }

  // Admin secret header check
  const adminSecret = req.get('x-admin-key');
  if (adminSecret && adminSecret === (process.env.ADMIN_SECRET_KEY || 'admin_lifelink_secret_2026')) {
    req.user = { uid: 'admin-master', email: 'admin@lifelink.org', admin: true };
    return next();
  }

  // Live Firebase Admin verification
  if (adminReady && token) {
    try {
      const decoded = await getAuth().verifyIdToken(token);
      req.user = decoded;
      return next();
    } catch (err) {
      if (err.code === 'auth/id-token-expired') {
        return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
      }
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }
  }

  // In offline demo mode without token, allow guest/demo access with limited privileges
  if (offlineDemoMode) {
    req.user = { uid: 'demo-guest', email: 'demo@lifelink.org', admin: false };
    return next();
  }

  return res.status(401).json({ error: 'Please log in to continue.' });
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

/**
 * Health check and configuration status
 */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'LifeLink AI Platform',
    event: 'Hacktoberfest Lahore 2026',
    model: groqModel,
    aiConfigured: Boolean(groqApiKey && !groqApiKey.includes('your_groq_api_key')),
    firebaseAdminConfigured: adminReady,
    offlineDemoMode,
    totalDemoDonors: demoDonors.length,
    activeEmergencies: demoEmergencies.length
  });
});

/**
 * Natural-Language AI Parse Endpoint
 * Interprets user request in English, Urdu, or Roman Urdu and extracts structured filters.
 */
app.post('/api/parse-request', rateLimit, authenticateRequest, async (req, res) => {
  try {
    const rawRequest = req.body?.request;
    const request = validateUserRequest(rawRequest);

    // If Groq API Key is available, use Meta LLaMA 3.1 8B Instant via Groq
    if (groqApiKey && !groqApiKey.includes('your_groq_api_key')) {
      try {
        const completion = await (groqClient
          ? groqClient.chat.completions.create({
              model: groqModel,
              temperature: 0,
              max_tokens: 220,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content: `You extract blood donor search filters from natural language queries.
The user may write in English, Urdu, or Roman Urdu (e.g. "Lahore me O+ khoon chahiye", "Need B- donor urgently in Mayo Hospital").

Return strictly valid JSON with this exact schema:
{
  "intent": "find_donors" | "clarify",
  "bloodGroup": "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | null,
  "city": string | null,
  "urgency": "critical" | "urgent" | "standard",
  "hospital": string | null,
  "clarification": string | null
}

Rules:
1. Normalize blood groups to canonical form: A+, A-, B+, B-, AB+, AB-, O+, O-.
2. Extract the city (e.g. Lahore, Karachi, Islamabad, etc.).
3. Detect urgency: "critical" (emergency, right now, immediately, shadid, foran), "urgent" (jaldi, today, asap), or "standard".
4. Extract hospital or location name if mentioned (e.g. Services Hospital, Jinnah Hospital, Mayo Hospital).
5. If the user input is not about finding blood donors, or if blood group or city is missing, set intent="clarify" and provide a brief explanation in clarification.
6. Do NOT invent donor names or medical advice. Output JSON only.`
                },
                { role: 'user', content: request }
              ]
            })
          : fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: groqModel,
                temperature: 0,
                max_tokens: 220,
                response_format: { type: 'json_object' },
                messages: [
                  {
                    role: 'system',
                    content: 'You extract blood donor filters from user text in English or Roman Urdu. Return ONLY JSON with keys: intent ("find_donors"|"clarify"), bloodGroup (A+, A-, B+, B-, AB+, AB-, O+, O- or null), city (string or null), urgency ("critical"|"urgent"|"standard"), hospital (string or null), clarification (string or null).'
                  },
                  { role: 'user', content: request }
                ]
              })
            }).then(r => r.json()));

        const content = completion?.choices?.[0]?.message?.content;
        if (content) {
          const rawParsed = JSON.parse(content);
          const parsed = validateParsedRequest(rawParsed);
          return res.json({
            parsed,
            model: groqModel,
            provider: 'Groq (Meta Llama 3.1 8B Instant)',
            compatibleDonors: parsed.bloodGroup ? getCompatibleDonors(parsed.bloodGroup) : []
          });
        }
      } catch (aiErr) {
        console.warn('⚠️ Groq AI call failed, falling back to local heuristic parser:', aiErr.message);
      }
    }

    // Fallback: Local Heuristic Parser (Offline / No Key / Fallback mode)
    const parsed = heuristicParseRequest(request);
    return res.json({
      parsed,
      model: 'Heuristic-Local-Parser (Offline Demo)',
      provider: 'Local Engine',
      compatibleDonors: parsed.bloodGroup ? getCompatibleDonors(parsed.bloodGroup) : [],
      note: groqApiKey ? 'Local parser used as fallback' : 'Running in offline demo mode. Add your GROQ_API_KEY in .env to use Groq LLaMA 3.1 8B.'
    });

  } catch (error) {
    if (error.message?.includes('Request must')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('AI parse endpoint error:', error);
    return res.status(500).json({ error: 'Could not process search request. Please try manual filters.' });
  }
});

/**
 * Get Blood Compatibility Info
 */
app.get('/api/compatibility/:bloodGroup', (req, res) => {
  const group = req.params.bloodGroup?.toUpperCase().trim();
  if (!BLOOD_GROUPS.has(group)) {
    return res.status(400).json({ error: 'Invalid blood group.' });
  }
  const canReceiveFrom = getCompatibleDonors(group);
  const canDonateTo = Array.from(BLOOD_GROUPS).filter(g => canDonate(group, g));
  res.json({
    bloodGroup: group,
    canReceiveFrom,
    canDonateTo,
    isUniversalDonor: group === 'O-',
    isUniversalRecipient: group === 'AB+'
  });
});

/**
 * Get Donors (Demo Store / REST API)
 */
app.get('/api/donors', (req, res) => {
  const { city, bloodGroup, compatible, availableOnly } = req.query;
  let results = [...demoDonors];

  if (city) {
    const c = city.trim().toLowerCase();
    results = results.filter(d => d.cityLower?.includes(c) || d.city?.toLowerCase().includes(c));
  }

  if (bloodGroup) {
    const bg = bloodGroup.trim().toUpperCase();
    if (compatible === 'true') {
      const allowed = getCompatibleDonors(bg);
      results = results.filter(d => allowed.includes(d.bloodGroup));
    } else {
      results = results.filter(d => d.bloodGroup === bg);
    }
  }

  if (availableOnly === 'true') {
    results = results.filter(d => d.available);
  }

  res.json({
    donors: results,
    total: results.length,
    compatibleApplied: compatible === 'true'
  });
});

/**
 * Register / Update Donor in Demo Store
 */
app.post('/api/donors', authenticateRequest, (req, res) => {
  const { name, city, area, bloodGroup, available, phone, consent } = req.body;
  if (!name || !city || !bloodGroup) {
    return res.status(400).json({ error: 'Name, city, and blood group are required.' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'Consent is required to list in the directory.' });
  }
  const cleanBlood = bloodGroup.trim().toUpperCase();
  if (!BLOOD_GROUPS.has(cleanBlood)) {
    return res.status(400).json({ error: 'Invalid blood group specified.' });
  }

  const existingIndex = demoDonors.findIndex(d => d.uid === req.user.uid);
  const donorRecord = {
    id: existingIndex >= 0 ? demoDonors[existingIndex].id : `donor-${Date.now()}`,
    uid: req.user.uid,
    name: name.trim().slice(0, 80),
    city: city.trim().slice(0, 80),
    cityLower: city.trim().toLowerCase().slice(0, 80),
    area: (area || '').trim().slice(0, 80),
    bloodGroup: cleanBlood,
    available: Boolean(available),
    phone: (phone || '').trim().slice(0, 30),
    consent: true,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    demoDonors[existingIndex] = { ...demoDonors[existingIndex], ...donorRecord };
  } else {
    donorRecord.createdAt = new Date().toISOString();
    demoDonors.unshift(donorRecord);
  }

  res.status(201).json({ success: true, donor: donorRecord });
});

/**
 * Delete Donor (Admin or Owner)
 */
app.delete('/api/donors/:id', authenticateRequest, (req, res) => {
  const id = req.params.id;
  const index = demoDonors.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Donor record not found.' });
  }

  const donor = demoDonors[index];
  if (!req.user.admin && donor.uid !== req.user.uid) {
    return res.status(403).json({ error: 'Admin permission required to delete this profile.' });
  }

  demoDonors.splice(index, 1);
  res.json({ success: true, message: 'Donor profile removed.' });
});

/**
 * Get Emergency Blood Appeals
 */
app.get('/api/emergencies', (_req, res) => {
  res.json({ emergencies: demoEmergencies, total: demoEmergencies.length });
});

/**
 * Post an Emergency Blood Appeal
 */
app.post('/api/emergencies', authenticateRequest, (req, res) => {
  const { patientName, hospital, city, bloodGroup, unitsNeeded, urgency, contactNumber, notes } = req.body;
  if (!patientName || !hospital || !city || !bloodGroup) {
    return res.status(400).json({ error: 'Patient name, hospital, city, and blood group are required.' });
  }
  const cleanBlood = bloodGroup.trim().toUpperCase();
  if (!BLOOD_GROUPS.has(cleanBlood)) {
    return res.status(400).json({ error: 'Invalid blood group specified.' });
  }

  const newEmergency = {
    id: `emg-${Date.now()}`,
    patientName: patientName.trim().slice(0, 100),
    hospital: hospital.trim().slice(0, 120),
    city: city.trim().slice(0, 80),
    bloodGroup: cleanBlood,
    unitsNeeded: Number(unitsNeeded) || 1,
    urgency: ['critical', 'urgent', 'standard'].includes(urgency) ? urgency : 'urgent',
    contactNumber: (contactNumber || '').trim().slice(0, 30),
    notes: (notes || '').trim().slice(0, 300),
    createdAt: new Date().toISOString()
  };

  demoEmergencies.unshift(newEmergency);
  res.status(201).json({ success: true, emergency: newEmergency });
});

/**
 * Delete Emergency Appeal (Admin only)
 */
app.delete('/api/emergencies/:id', authenticateRequest, (req, res) => {
  if (!req.user.admin) {
    return res.status(403).json({ error: 'Admin permission required.' });
  }
  const id = req.params.id;
  demoEmergencies = demoEmergencies.filter(e => e.id !== id);
  res.json({ success: true, message: 'Emergency request resolved/deleted.' });
});

/**
 * Get Platform Statistics
 */
app.get('/api/stats', (_req, res) => {
  const cities = new Set(demoDonors.map(d => d.city));
  res.json({
    totalDonors: demoDonors.length,
    availableDonors: demoDonors.filter(d => d.available).length,
    activeEmergencies: demoEmergencies.length,
    citiesCovered: cities.size,
    universalDonors: demoDonors.filter(d => d.bloodGroup === 'O-').length
  });
});

// -------------------------------------------------------------
// Multi-Page Website Routes
// -------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/search', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));
app.get('/donors', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'donors.html')));
app.get('/emergency', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'emergency.html')));
app.get('/register-donor', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'register-donor.html')));
app.get('/compatibility', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'compatibility.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err.message);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`\n🚀 LifeLink AI Server running at http://localhost:${port}`);
  console.log(`🏆 Event: Hacktoberfest Lahore 2026`);
  console.log(`🤖 AI Engine: ${groqModel} (${groqApiKey ? 'Groq Active' : 'Heuristic Demo Fallback'})`);
  console.log(`🔥 Firebase Admin: ${adminReady ? 'Connected' : 'Offline Demo Store Active'}\n`);
});
