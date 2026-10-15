import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputFile = path.join(rootDir, 'LifeLink-AI-Submission.zip');

async function createPackage() {
  console.log('📦 Creating LifeLink AI Hackathon submission ZIP package...');

  let archiver;
  try {
    const archiverModule = await import('archiver');
    archiver = archiverModule.default || archiverModule;
  } catch {
    console.error('archiver package not found, please run npm install first.');
    process.exit(1);
  }

  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }

  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    const sizeInKB = (archive.pointer() / 1024).toFixed(1);
    console.log(`✅ Package created successfully: ${outputFile} (${sizeInKB} KB / ${archive.pointer()} bytes)`);
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('⚠️ Warning:', err);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  // Files to exclude
  const excludedPatterns = [
    'node_modules/**',
    'node_modules',
    '.git/**',
    '.git',
    '.env',
    'LifeLink-AI-Submission.zip',
    '**/serviceAccountKey.json',
    '.DS_Store'
  ];

  archive.glob('**/*', {
    cwd: rootDir,
    ignore: excludedPatterns,
    dot: true
  }, { prefix: 'LifeLink-AI' });

  await archive.finalize();
}

createPackage().catch((err) => {
  console.error('❌ Failed to create zip package:', err);
  process.exit(1);
});
