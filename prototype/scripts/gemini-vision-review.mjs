import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PROMPT = `Review this MineStar haul-truck screenshot for visual implementation issues.

Focus on:
1. Whether the truck appears stretched, squashed, or proportionally wrong.
2. Whether the material overlay is shifted, mis-sized, or not aligned with the tray.
3. Whether material tinting is visible or if the material still appears white.
4. Whether the truck looks correctly centred for rotation.
5. Whether there are signs that the wrong atlas cell sizing, scale factor, or mask registration are being used.

Return concise markdown with sections:
- Summary
- Visual issues
- Likely technical causes
- Recommended fixes
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.image) {
    console.error('Usage: npm run vision:review -- <image-path> [--output <markdown-path>] [--prompt "custom prompt"]');
    process.exit(1);
  }

  const env = loadEnvFiles([
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
  ]);

  const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    console.error('Missing GEMINI_API_KEY. Add it to ../.env or set it in the shell before running the vision helper.');
    process.exit(1);
  }

  const imagePath = path.resolve(process.cwd(), args.image);
  if (!fs.existsSync(imagePath)) {
    console.error(`Image file not found: ${imagePath}`);
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const mimeType = getMimeType(imagePath);
  const prompt = args.prompt || DEFAULT_PROMPT;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBuffer.toString('base64'),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      topK: 32,
      topP: 0.9,
      maxOutputTokens: 2048,
    },
  };

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Gemini request failed (${response.status}): ${text}`);
    process.exit(1);
  }

  const result = await response.json();
  const text = extractText(result);

  if (!text) {
    console.error('Gemini returned no text content.');
    process.exit(1);
  }

  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, text, 'utf8');
    console.log(`Saved review to ${outputPath}`);
  } else {
    console.log(text);
  }
}

function parseArgs(argv) {
  const args = { image: null, output: null, prompt: null };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--') && !args.image) {
      args.image = token;
      continue;
    }
    if (token === '--output') {
      args.output = argv[++i];
      continue;
    }
    if (token === '--prompt') {
      args.prompt = argv[++i];
    }
  }

  return args;
}

function loadEnvFiles(filePaths) {
  const values = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const contents = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      values[key] = stripQuotes(value);
    }
  }
  return values;
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

function extractText(result) {
  const candidates = result?.candidates || [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];
    const text = parts.map((part) => part.text).filter(Boolean).join('\n');
    if (text) return text;
  }
  return '';
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});