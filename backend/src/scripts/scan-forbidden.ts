/**
 * Step 13B Part 8: Forbidden Word Leak Scanner
 *
 * Scans all API responses, headers, 404 pages, error messages,
 * and exported metadata for any forbidden terms.
 */

const FORBIDDEN_WORDS = [
  'gemini',
  'google',
  'ollama',
  'whisper',
  'ffmpeg',
  'ffprobe',
  'libx264',
  'onnx',
  'u2net',
  'pexels',
  'pixabay',
  'faster-whisper',
  'fastify',
  'node',
  'prisma',
  'sqlite',
];

// Patterns for file paths, stack traces, API keys
const LEAK_PATTERNS = [
  /[A-Za-z]:\\[Uu]sers\\/i,
  /\/Users\//i,
  /\/home\//i,
  /at\s+[A-Za-z0-9_.]+\s+\(.*:\d+:\d+\)/i, // stack trace line
  /AIzaSy[A-Za-z0-9_-]{20,}/i,             // Google API key pattern
];

interface CheckTarget {
  name: string;
  url: string;
  method?: string;
  body?: any;
  expectedStatus?: number;
}

const TARGETS: CheckTarget[] = [
  { name: 'Health Endpoint (Public)', url: 'http://localhost:3001/api/health', expectedStatus: 200 },
  { name: 'Root Health Endpoint', url: 'http://localhost:3001/health', expectedStatus: 200 },
  { name: 'System Check (Settings)', url: 'http://localhost:3001/api/v1/system/check', expectedStatus: 200 },
  { name: 'Clients List', url: 'http://localhost:3001/api/v1/clients', expectedStatus: 200 },
  { name: 'Projects List', url: 'http://localhost:3001/api/v1/projects', expectedStatus: 200 },
  { name: 'Music Tracks List', url: 'http://localhost:3001/api/v1/music', expectedStatus: 200 },
  { name: 'Brand Kit List', url: 'http://localhost:3001/api/v1/brand', expectedStatus: 200 },
  { name: 'Jobs List', url: 'http://localhost:3001/api/v1/jobs', expectedStatus: 200 },
  { name: '404 Page (Neutral Route)', url: 'http://localhost:3001/api/v1/nonexistent-route-xyz', expectedStatus: 404 },
  { name: 'Quality JSON Block (404)', url: 'http://localhost:3001/storage/clients/test/output.quality.json', expectedStatus: 404 },
  {
    name: 'Validation Error (400)',
    url: 'http://localhost:3001/api/v1/projects',
    method: 'POST',
    body: {},
    expectedStatus: 400,
  },
];

async function scan() {
  console.log('====================================================');
  console.log('       FORBIDDEN WORD & LEAK SCANNER (STEP 13B)     ');
  console.log('====================================================\n');

  let violationsCount = 0;

  for (const target of TARGETS) {
    try {
      const opts: RequestInit = {
        method: target.method || 'GET',
        headers: target.body ? { 'Content-Type': 'application/json' } : {},
        body: target.body ? JSON.stringify(target.body) : undefined,
      };

      const res = await fetch(target.url, opts);
      const text = await res.text();

      // 1. Check HTTP Headers
      const headersStr = Array.from(res.headers.entries())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

      const headerViolations: string[] = [];
      for (const word of FORBIDDEN_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(headersStr)) {
          headerViolations.push(word);
        }
      }

      // 2. Check Body Text
      const bodyViolations: string[] = [];
      for (const word of FORBIDDEN_WORDS) {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(text)) {
          bodyViolations.push(word);
        }
      }

      // 3. Check Leaks (Paths, Stack Traces, Keys)
      for (const pattern of LEAK_PATTERNS) {
        if (pattern.test(text)) {
          bodyViolations.push(`Pattern Leak: ${pattern.toString()}`);
        }
        if (pattern.test(headersStr)) {
          headerViolations.push(`Pattern Leak in Header: ${pattern.toString()}`);
        }
      }

      if (headerViolations.length > 0 || bodyViolations.length > 0) {
        violationsCount++;
        console.error(`[FAIL] ${target.name} (${target.url})`);
        if (headerViolations.length > 0) {
          console.error(`       Header violations: ${headerViolations.join(', ')}`);
        }
        if (bodyViolations.length > 0) {
          console.error(`       Body violations:   ${bodyViolations.join(', ')}`);
          console.error(`       Body snippet:      ${text.slice(0, 200)}`);
        }
      } else {
        console.log(`[PASS] ${target.name}`);
        console.log(`       Status: ${res.status} | Length: ${text.length} chars | 0 leaks detected`);
      }
    } catch (err: any) {
      violationsCount++;
      console.error(`[ERROR] Failed to fetch ${target.name}: ${err.message}`);
    }
  }

  console.log('\n====================================================');
  if (violationsCount === 0) {
    console.log('[SUCCESS] All responses, errors, 404 pages, and headers are 100% clean!');
    console.log('          No tool names, paths, stack traces, or keys leaked.');
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error(`[FAILURE] ${violationsCount} target(s) contained forbidden terms or leaks.`);
    console.log('====================================================');
    process.exit(1);
  }
}

scan();

