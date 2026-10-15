// Run only on your own trusted computer. Never expose this tool or service key in public hosting.
const admin = require('firebase-admin');
const path = require('path');
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
const serviceAccount = require(keyPath);
const email = process.argv[2];
if (!email) {
  console.error('Usage: node tools/set-admin-role.cjs admin@example.com');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
(async () => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Admin claim assigned to ${user.email}. Ask them to sign out and sign in again.`);
  } catch (error) {
    console.error('Could not assign admin claim:', error.message);
    process.exitCode = 1;
  }
})();
