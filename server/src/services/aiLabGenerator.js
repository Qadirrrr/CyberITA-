import env from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Real AI lab generation for guided practice labs.
 *
 * Turns an instructor's title + brief into a brand new lab (summary,
 * scenario, objectives, starter files and verified steps) by calling an
 * external AI provider, then validates and sanitises everything the
 * model returned before it is allowed anywhere near the database:
 *
 *   - Step count, field lengths and points are clamped to platform rules.
 *   - Verification is either an exact command or an output regex; the
 *     regex must compile and must not be a match-anything pattern, and
 *     commands pass a denylist for destructive / host-escaping input.
 *   - Starter files may only be relative paths with capped contents.
 *
 * The returned object has exactly the same shape as labGenerator's
 * generateLab(), plus source: 'ai', so the /labs/generate save path is
 * shared. Any failure (not configured, provider error, invalid output)
 * throws AiLabError and the route falls back to the template generator
 * with a visible notice, never silently.
 */

export class AiLabError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiLabError';
  }
}

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  // gemini-2.0-flash was retired by Google (the API now answers 404
  // "no longer available" and points at this model instead).
  gemini: 'gemini-3.8-flash',
};

const POINTS_PER_STEP = 10;
const AI_TIMEOUT_MS = 90000;

export function isAiLabConfigured() {
  return Boolean(env.ai.apiKey);
}

function aiModel() {
  if (env.ai.model) return env.ai.model;
  return DEFAULT_MODELS[env.ai.provider] || DEFAULT_MODELS.openai;
}

function cleanText(value, max, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

function cleanMultiline(value, max, fallback = '') {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  return (text || fallback).slice(0, max);
}

const DANGEROUS_COMMAND = /(\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+\/(?:\s|$)|:\(\)\s*\{|>\s*\/dev\/(sd|nvme|hd)|\bmkfs\b|\bdd\b[^|]*\bof=\/dev\/|\b(shutdown|poweroff|halt|reboot)\b|\bchmod\s+-R\s+777\s+\/|\bcurl\b[^|]*\|\s*(sudo\s+)?(sh|bash)\b|\bwget\b[^|]*\|\s*(sudo\s+)?(sh|bash)\b|\bnc\b[^|]*\s-e\s|\bhistory\s+-c\b)/i;

function sanitizeCommand(raw) {
  const command = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!command) return null;
  if (/[\r\n]/.test(command)) return null;
  if (DANGEROUS_COMMAND.test(command)) return null;
  return command;
}

function sanitizePattern(raw) {
  const pattern = String(raw ?? '').trim().slice(0, 200);
  if (!pattern) return null;
  // A pattern that matches anything would verify every step for free.
  if (/^\^?\.[\*\+]\$?$/.test(pattern) || pattern === '^' || pattern === '$') return null;
  try {
    // Must compile exactly as the runtime will use it.
    new RegExp(pattern);
  } catch {
    return null;
  }
  return pattern;
}

function sanitizeSteps(rawSteps, requested) {
  if (!Array.isArray(rawSteps)) throw new AiLabError('The AI response did not include steps.');
  const steps = [];
  for (const raw of rawSteps) {
    if (steps.length >= requested) break;
    if (!raw || typeof raw !== 'object') continue;
    const title = cleanText(raw.title, 120);
    let instruction = cleanMultiline(raw.instruction, 2000);
    if (!title || !instruction) continue;

    const expectedCommand = sanitizeCommand(raw.expectedCommand);
    const expectedPattern = sanitizePattern(raw.expectedOutputPattern);
    let verification = raw.verification === 'command' ? 'command' : raw.verification === 'output' ? 'output' : expectedPattern ? 'output' : 'command';
    if (verification === 'command' && !expectedCommand) verification = expectedPattern ? 'output' : null;
    if (verification === 'output' && !expectedPattern) verification = expectedCommand ? 'command' : null;
    if (!verification) continue; // A step that can never verify is dropped.

    // The instruction must show the learner the command, as the
    // blueprint steps do: append it when the model forgot the block.
    if (expectedCommand && !instruction.includes('```')) {
      instruction = `${instruction}\n\n\`\`\`bash\n${expectedCommand}\n\`\`\``;
    }

    steps.push({
      title,
      instruction,
      hint: cleanMultiline(raw.hint, 500) || null,
      verification,
      expectedCommand: expectedCommand || null,
      expectedOutputPattern: verification === 'output' ? expectedPattern : null,
      points: POINTS_PER_STEP,
      isOptional: false,
    });
  }
  if (steps.length < 3) {
    throw new AiLabError(`The AI returned only ${steps.length} usable step(s); at least 3 are required.`);
  }
  return steps.map((item, index) => ({ ...item, position: index }));
}

function sanitizeInitialFiles(rawFiles) {
  if (!rawFiles || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) return {};
  const files = {};
  for (const [path, content] of Object.entries(rawFiles)) {
    if (Object.keys(files).length >= 8) break;
    const cleanPath = String(path || '').trim().slice(0, 120);
    if (!cleanPath || cleanPath.startsWith('/') || cleanPath.includes('..')) continue;
    if (!/^[a-zA-Z0-9._/-]+$/.test(cleanPath)) continue;
    if (typeof content !== 'string') continue;
    files[cleanPath] = content.slice(0, 20000);
  }
  return files;
}

function buildPrompt({ title, details, difficulty, stepCount }) {
  const system = [
    'You are an expert Linux lab author for the CyberITA+ learning platform.',
    'You write guided, hands-on labs that run inside a disposable Ubuntu 22.04 container where the learner is root, home directory /home/student, initial working directory /home/student.',
    'Available tools: coreutils, grep, awk, sed, find, tar, file, sha256sum, python3, procps (ps, top, free), iproute2 (ip, ss), ping, nmap, curl. There is no systemd and no Docker daemon inside the container, and no step may depend on external network access or on installing packages.',
    'Difficulty guidance: beginner = single simple commands; intermediate = flags, pipes and combining two ideas per step; advanced = multi-part tasks, filtering and light shell scripting.',
    'Respond with a single JSON object only, no markdown fences, no commentary.',
  ].join('\n');

  const user = [
    `Create a guided practice lab titled "${title}".`,
    details ? `Instructor brief: ${details}` : '',
    `Difficulty: ${difficulty}. Exactly ${stepCount} steps, in teaching order, each building on the previous ones.`,
    '',
    'JSON shape:',
    '{',
    '  "summary": "one sentence, max 180 characters",',
    '  "scenario": "2 to 3 sentence story that motivates the lab",',
    '  "objectives": ["3 to 5 short learning objectives"],',
    '  "estimatedMinutes": 30,',
    '  "initialFiles": { "relative/path.txt": "file contents the learner starts with (optional, only when a step needs fixture data)" },',
    '  "steps": [',
    '    {',
    '      "title": "short step title",',
    '      "instruction": "what to do and why, markdown, MUST include the exact command in a ```bash code block",',
    '      "hint": "one helpful hint",',
    '      "verification": "output" or "command",',
    '      "expectedCommand": "the exact command for command verification, otherwise null",',
    '      "expectedOutputPattern": "a JavaScript regular expression matched against the terminal output for output verification, otherwise null"',
    '    }',
    '  ]',
    '}',
    '',
    'Verification rules (important, steps are checked automatically):',
    '- Prefer "output" verification: the pattern must match text the command really prints on Ubuntu 22.04 (for example "PRETTY_NAME=" for cat /etc/os-release). Escape regex special characters in literal text.',
    '- Use "command" verification only when the exact command matters; the expectedCommand must be the command from the instruction, exactly as a learner would type it.',
    '- Every step needs exactly one working verification. Never use a pattern that matches any output (like .*).',
    '- Commands must be non-interactive, safe to run as root in a disposable container, and must not modify system files outside /home/student and /tmp, except simple read-only inspection.',
    '- Do not use: rm -rf /, shutdown or reboot, mkfs, dd onto devices, piping downloads into a shell, or commands that wait for input.',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
}

async function callOpenAiCompatible({ system, user }) {
  const baseUrl = env.ai.baseUrl || 'https://api.openai.com/v1';
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: aiModel(),
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AiLabError(`Could not reach the AI provider: ${error.message}`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AiLabError(`The AI provider rejected the request (${response.status}): ${data?.error?.message || 'unknown error'}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new AiLabError('The AI provider returned an empty response.');
  return content;
}

async function callGemini({ system, user }) {
  const baseUrl = env.ai.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  let response;
  try {
    response = await fetch(`${baseUrl}/models/${encodeURIComponent(aiModel())}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.ai.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: 'application/json',
          // A full lab JSON is a few thousand tokens; leave ample room
          // so the response is never truncated mid-object.
          maxOutputTokens: 8192,
          // Gemini 3.x models think before answering, which makes a
          // plain generation call slow (a trivial test request was seen
          // hanging on the production host). Lab authoring does not
          // need deep reasoning: keep thinking LOW on 3.x models so
          // responses stay fast. Older models use a different field
          // and simply omit this.
          ...(aiModel().startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
        },
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AiLabError(`Could not reach the AI provider: ${error.message}`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AiLabError(`The AI provider rejected the request (${response.status}): ${data?.error?.message || 'unknown error'}`);
  }
  const content = (data?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').join('');
  if (!content) throw new AiLabError('The AI provider returned an empty response.');
  return content;
}

function parseAiJson(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/,'').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // fall through to the error below
      }
    }
    throw new AiLabError('The AI response was not valid JSON.');
  }
}

/**
 * Generate a complete guided lab with the configured AI provider.
 * Same return shape as labGenerator.generateLab(), plus source: 'ai'.
 */
export async function generateLabWithAi({
  title,
  details = '',
  difficulty = 'beginner',
  stepCount = 8,
  isPractice = false,
} = {}) {
  if (!isAiLabConfigured()) {
    throw new AiLabError('AI generation is not configured on this server (AI_API_KEY is missing).');
  }
  const cleanTitle = cleanText(title, 200, 'Practice lab');
  const requested = Math.max(3, Math.min(12, Number(stepCount) || 8));
  const difficultyLabel = difficulty === 'advanced' ? 'advanced' : difficulty === 'intermediate' ? 'intermediate' : 'beginner';
  const prompt = buildPrompt({ title: cleanTitle, details: cleanMultiline(details, 2000), difficulty: difficultyLabel, stepCount: requested });

  const call = env.ai.provider === 'gemini' ? callGemini : callOpenAiCompatible;

  let parsed = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
    try {
      const content = await call(prompt);
      parsed = parseAiJson(content);
    } catch (error) {
      lastError = error;
      logger.warn('AI lab generation attempt failed', { attempt: attempt + 1, error: error.message });
    }
  }
  if (!parsed) throw lastError || new AiLabError('AI generation failed.');

  const steps = sanitizeSteps(parsed.steps, requested);
  const objectives = (Array.isArray(parsed.objectives) ? parsed.objectives : [])
    .map((item) => cleanText(item, 200))
    .filter(Boolean)
    .slice(0, 5);
  const scenario = cleanMultiline(parsed.scenario, 1200, 'Practise the commands for this topic in a real Linux container.');
  const summary = cleanText(parsed.summary, 200, scenario.slice(0, 200));
  const estimate = Math.min(600, Math.max(10, Number(parsed.estimatedMinutes) || steps.length * (difficultyLabel === 'advanced' ? 9 : difficultyLabel === 'intermediate' ? 7 : 5)));

  const description = [
    '## Scenario',
    scenario,
    details ? `\n## Brief\n${cleanMultiline(details, 2000)}\n` : '',
    '## What you will practise',
    ...(objectives.length ? objectives.map((objective) => `- ${objective}`) : ['- Follow the guided steps and verify each one from real command output']),
    '',
    '## Environment',
    'Your session runs in a real, disposable Linux container. You are root **inside** the container so you can install packages and use professional tooling, but the container has no host access, no Docker socket and is limited in CPU, memory and processes. The environment is destroyed when the session expires.',
    '',
    '## How steps work',
    'Each step is verified automatically. Press **Enter** after running a command; when the expected output appears the step ticks off. Hints are available on every step.',
    isPractice ? '\n## Practice mode\nThis lab is not graded and no report is required. Start as many sessions as you like.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title: cleanTitle,
    summary,
    description,
    objectives: objectives.map((objective) => `- ${objective}`).join('\n'),
    submissionRequirements: isPractice
      ? ''
      : [
          '- A screenshot of the terminal proving each verified step',
          '- A short explanation of what each command changed and why',
          '- The hash of any file you created, if the task asks for one',
        ].join('\n'),
    taskBrief: '',
    difficulty: difficultyLabel,
    estimatedMinutes: estimate,
    terminalWelcome: isPractice
      ? `Welcome to "${cleanTitle}". This is a real practice lab container. Install packages and explore freely. Run \`help\` for a quick reference.`
      : `Welcome to "${cleanTitle}". This is a real Linux container. Run \`help\` or explore freely.`,
    initialCwd: '/home/student',
    initialFiles: sanitizeInitialFiles(parsed.initialFiles),
    isPractice: Boolean(isPractice),
    labMode: 'practice',
    minEvidence: 1,
    domain: 'ai',
    source: 'ai',
    steps,
    counts: {
      steps: steps.length,
      totalPoints: steps.reduce((sum, item) => sum + item.points, 0),
    },
  };
}

export default { generateLabWithAi, isAiLabConfigured, AiLabError };
