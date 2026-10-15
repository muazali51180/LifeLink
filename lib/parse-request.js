/**
 * LifeLink AI — Blood Donor Matching and Request Parsing Library
 * Built for Hacktoberfest Lahore 2026
 */

export const BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

/**
 * Red Blood Cell (Erythrocyte) Compatibility Matrix
 * Key: Recipient Blood Group -> Value: Array of Compatible Donor Blood Groups
 */
export const BLOOD_COMPATIBILITY = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'] // Universal Recipient
};

/**
 * Get all compatible donor blood types for a patient/recipient
 * @param {string} recipientBloodGroup
 * @returns {string[]}
 */
export function getCompatibleDonors(recipientBloodGroup) {
  if (!recipientBloodGroup) return [];
  const normalized = recipientBloodGroup.toUpperCase().trim();
  return BLOOD_COMPATIBILITY[normalized] || [];
}

/**
 * Check if a donor can donate blood to a recipient
 * @param {string} donorGroup
 * @param {string} recipientGroup
 * @returns {boolean}
 */
export function canDonate(donorGroup, recipientGroup) {
  if (!donorGroup || !recipientGroup) return false;
  const compatible = getCompatibleDonors(recipientGroup);
  return compatible.includes(donorGroup.toUpperCase().trim());
}

/**
 * Normalize variations of blood group strings into canonical form (e.g. "o positive" -> "O+")
 * @param {string} text
 * @returns {string|null}
 */
export function normalizeBloodGroup(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.toLowerCase().trim();

  // Direct regex matches
  if (/^(a|b|ab|o)\s*[\+\-]$/i.test(clean)) {
    return clean.replace(/\s+/g, '').toUpperCase();
  }

  // Word variations - sorted by length descending so AB is tested before B or A
  const map = [
    ['ab positive', 'AB+'], ['ab-positive', 'AB+'], ['ab negative', 'AB-'], ['ab-negative', 'AB-'],
    ['ab pos', 'AB+'], ['ab-pos', 'AB+'], ['ab neg', 'AB-'], ['ab-neg', 'AB-'],
    ['ab +ve', 'AB+'], ['ab -ve', 'AB-'], ['ab+', 'AB+'], ['ab-', 'AB-'],
    ['o positive', 'O+'], ['o-positive', 'O+'], ['o negative', 'O-'], ['o-negative', 'O-'],
    ['o pos', 'O+'], ['o-pos', 'O+'], ['o neg', 'O-'], ['o-neg', 'O-'],
    ['o +ve', 'O+'], ['o -ve', 'O-'], ['o+', 'O+'], ['o-', 'O-'],
    ['a positive', 'A+'], ['a-positive', 'A+'], ['a negative', 'A-'], ['a-negative', 'A-'],
    ['a pos', 'A+'], ['a-pos', 'A+'], ['a neg', 'A-'], ['a-neg', 'A-'],
    ['a +ve', 'A+'], ['a -ve', 'A-'], ['a+', 'A+'], ['a-', 'A-'],
    ['b positive', 'B+'], ['b-positive', 'B+'], ['b negative', 'B-'], ['b-negative', 'B-'],
    ['b pos', 'B+'], ['b-pos', 'B+'], ['b neg', 'B-'], ['b-neg', 'B-'],
    ['b +ve', 'B+'], ['b -ve', 'B-'], ['b+', 'B+'], ['b-', 'B-']
  ];

  for (const [pattern, canonical] of map) {
    // Word boundary or non-alphanumeric boundary
    const escaped = pattern.replace(/[\-\+]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (regex.test(clean)) {
      return canonical;
    }
  }

  return null;
}

/**
 * Known Pakistani and international cities dictionary for heuristic detection
 */
const COMMON_CITIES = [
  'Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad',
  'Multan', 'Peshawar', 'Quetta', 'Gujranwala', 'Sialkot',
  'Hyderabad', 'Sargodha', 'Bahawalpur', 'Abbottabad', 'Sukkur',
  'Sheikhupura', 'Gujrat', 'Jhelum', 'Kasur', 'Okara',
  'Wah Cantt', 'Mardan', 'Sahiwal', 'Dera Ghazi Khan'
];

/**
 * Normalize and extract city name from text
 * @param {string} text
 * @returns {string|null}
 */
export function extractCityFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  for (const city of COMMON_CITIES) {
    const cityRegex = new RegExp(`\\b${city.toLowerCase()}\\b`, 'i');
    if (cityRegex.test(lower)) {
      return city;
    }
  }
  return null;
}

/**
 * Validate and sanitize parsed request object from AI or heuristic parser
 * @param {object} value
 * @returns {object}
 */
export function validateParsedRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid AI response schema.');
  }

  const intent = value.intent === 'find_donors' ? 'find_donors' : 'clarify';
  
  let bloodGroup = null;
  if (typeof value.bloodGroup === 'string') {
    const upper = value.bloodGroup.trim().toUpperCase();
    if (BLOOD_GROUPS.has(upper)) {
      bloodGroup = upper;
    } else {
      bloodGroup = normalizeBloodGroup(value.bloodGroup);
    }
  }

  let city = null;
  if (typeof value.city === 'string' && value.city.trim().length <= 80) {
    city = value.city.trim().replace(/[<>]/g, '');
    if (city.length === 0) city = null;
  }

  const clarification = typeof value.clarification === 'string'
    ? value.clarification.trim().slice(0, 240) : null;

  const urgency = typeof value.urgency === 'string' && ['critical', 'urgent', 'standard'].includes(value.urgency.toLowerCase())
    ? value.urgency.toLowerCase() : 'standard';

  const hospital = typeof value.hospital === 'string' && value.hospital.trim().length <= 100
    ? value.hospital.trim().replace(/[<>]/g, '') : null;

  if (intent === 'find_donors' && (!bloodGroup || !city)) {
    return {
      intent: 'clarify',
      bloodGroup,
      city,
      urgency,
      hospital,
      clarification: clarification || 'Please provide both a valid blood group (e.g. O+, A-, B+) and city (e.g. Lahore, Karachi).'
    };
  }

  return { intent, bloodGroup, city, urgency, hospital, clarification };
}

/**
 * Validate raw user input string
 * @param {string} value
 * @returns {string}
 */
export function validateUserRequest(value) {
  if (typeof value !== 'string') throw new Error('Request must be text.');
  const request = value.trim();
  if (request.length < 3 || request.length > 500) {
    throw new Error('Request must be between 3 and 500 characters.');
  }
  return request;
}

/**
 * Fallback heuristic natural-language parser for English and Roman Urdu queries.
 * Used when Groq API key is not configured or during offline testing/evaluation.
 * @param {string} rawText
 * @returns {object}
 */
export function heuristicParseRequest(rawText) {
  const text = validateUserRequest(rawText);
  const lower = text.toLowerCase();

  // Check if text is related to blood or donor
  const donorKeywords = ['blood', 'donor', 'donors', 'khoon', 'chahiye', 'chahye', 'zaroorat', 'urgent', 'emergency', 'need', 'require', 'patient', 'hospital'];
  const hasBloodIntent = donorKeywords.some(kw => lower.includes(kw)) || /(o|a|b|ab)[\+\-]/i.test(text);

  if (!hasBloodIntent) {
    return {
      intent: 'clarify',
      bloodGroup: null,
      city: null,
      urgency: 'standard',
      hospital: null,
      clarification: 'LifeLink AI is an intelligent blood donor platform. Please specify a blood group and city to search donors.'
    };
  }

  // Extract blood group
  const bloodGroup = normalizeBloodGroup(text);

  // Extract city
  const city = extractCityFromText(text);

  // Detect urgency
  let urgency = 'standard';
  if (/\b(emergency|critical|immediate|immediately|right now|shadid|foran)\b/i.test(lower)) {
    urgency = 'critical';
  } else if (/\b(urgent|urgently|jaldi|asap|today|soon)\b/i.test(lower)) {
    urgency = 'urgent';
  }

  // Detect hospital mention
  let hospital = null;
  const hospitalMatch = text.match(/(?:at|in|near)\s+([A-Za-z\s]+(?:Hospital|Clinic|Medical Complex|Institute))/i);
  if (hospitalMatch) {
    hospital = hospitalMatch[1].trim();
  }

  return validateParsedRequest({
    intent: bloodGroup && city ? 'find_donors' : 'clarify',
    bloodGroup,
    city,
    urgency,
    hospital,
    clarification: (!bloodGroup || !city)
      ? 'Please specify both blood group (e.g. O+, B-) and city (e.g. Lahore) to find donors.'
      : null
  });
}
