/**
 * Deterministic "paste content -> steps" parser.
 *
 * No AI provider is required: the text is split into step blocks using the
 * first structure it finds (markdown headings, numbered lists, horizontal rules
 * or blank-line paragraphs). The first fenced command becomes the expected
 * command, `Hint:` lines become hints and `Output:` lines become output
 * patterns.
 *
 * Kept free of React/UI imports so the parser can be unit-tested in isolation.
 */

const HEADING = /^\s{0,3}#{1,6}\s+(?:step\s*\d+\s*[:.)-]?\s*)?(.+?)\s*#*\s*$/i;
const NUMBERED = /^\s{0,3}(\d{1,3})[.)]\s+(.+?)\s*$/;
const HINT = /^\s*(?:hint|tip)\s*[:\-]\s*(.+)$/i;
const OUTPUT = /^\s*(?:expected output|output pattern|output)\s*[:\-]\s*(.+)$/i;
const FENCE = /```(?:bash|sh|shell|zsh|console|powershell|cmd)?[ \t]*\r?\n([\s\S]*?)```/i;
const RULE = /\n\s*(?:-{3,}|\*{3,}|_{3,})\s*\n/;

function cleanTitle(value) {
  return String(value || '')
    .replace(/^\s*#+\s*/, '')
    .replace(/^\s*\d{1,3}[.)]\s+/, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\*\*(.*?)\*\*$/, '$1')
    .replace(/^__(.*?)__$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenTitle(value, fallback) {
  const cleaned = cleanTitle(value);
  if (!cleaned) return fallback;
  if (cleaned.length <= 90) return cleaned;
  const sentence = cleaned.match(/^(.{10,90}?[.!?])(?:\s|$)/);
  return `${(sentence ? sentence[1] : cleaned.slice(0, 87)).trim()}…`;
}

function firstCommand(text) {
  const match = String(text || '').match(FENCE);
  if (!match) return '';
  const lines = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines[0] || '').replace(/^\$\s+/, '').slice(0, 500);
}

function blockFromChunk(chunk, index) {
  const trimmed = String(chunk || '').trim();
  const lines = trimmed.split('\n');
  const title = shortenTitle(lines[0], `Step ${index + 1}`);
  // When a chunk is a single paragraph, keep the whole paragraph as the
  // instruction so the preview never loses content.
  const body = lines.length > 1 ? lines.slice(1).join('\n').trim() : trimmed;
  return { title, body };
}

export function splitIntoBlocks(source) {
  const text = String(source || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const headingLines = [];
  lines.forEach((line, index) => {
    if (HEADING.test(line)) headingLines.push(index);
  });
  if (headingLines.length >= 2) {
    return headingLines.map((lineIndex, index) => {
      const match = lines[lineIndex].match(HEADING);
      const end = index + 1 < headingLines.length ? headingLines[index + 1] : lines.length;
      return {
        title: cleanTitle(match[1]) || `Step ${index + 1}`,
        body: lines.slice(lineIndex + 1, end).join('\n').trim(),
      };
    });
  }

  const numberedLines = [];
  lines.forEach((line, index) => {
    const match = line.match(NUMBERED);
    if (match) numberedLines.push({ lineIndex: index, title: cleanTitle(match[2]) });
  });
  if (numberedLines.length >= 2) {
    return numberedLines.map((item, index) => {
      const end = index + 1 < numberedLines.length ? numberedLines[index + 1].lineIndex : lines.length;
      return {
        title: item.title || `Step ${index + 1}`,
        body: lines.slice(item.lineIndex + 1, end).join('\n').trim(),
      };
    });
  }

  if (RULE.test(text)) {
    return text
      .split(RULE)
      .map((chunk, index) => blockFromChunk(chunk, index))
      .filter((block) => block.body || block.title);
  }

  const paragraphs = text.split(/\n\s*\n/).filter((chunk) => chunk.trim());
  if (paragraphs.length >= 2) {
    return paragraphs.map((chunk, index) => blockFromChunk(chunk, index));
  }
  return [blockFromChunk(text, 0)];
}

export function blocksToSteps(blocks) {
  return blocks.map((block, index) => {
    const hintLines = [];
    const outputLines = [];
    const kept = [];
    for (const line of String(block.body || '').split('\n')) {
      const hint = line.match(HINT);
      if (hint) {
        hintLines.push(hint[1].trim());
        continue;
      }
      const output = line.match(OUTPUT);
      if (output) {
        outputLines.push(output[1].trim());
        continue;
      }
      kept.push(line);
    }

    const instruction = kept.join('\n').trim() || block.title || `Step ${index + 1}`;
    const command = firstCommand(instruction);
    const pattern = outputLines.join(' ').trim();
    return {
      title: (block.title || `Step ${index + 1}`).slice(0, 200),
      instruction: instruction.slice(0, 5000),
      hint: hintLines.join(' ').trim().slice(0, 2000),
      // An explicit Output: line is the author's intent, so it wins over the
      // fenced command (matching output lets learners use equivalent commands).
      verification: pattern ? 'output' : command ? 'command' : 'manual',
      expectedCommand: command,
      expectedOutputPattern: pattern.slice(0, 500),
      points: 10,
      isOptional: false,
    };
  });
}

export function parseSteps(source) {
  return blocksToSteps(splitIntoBlocks(source));
}

export const SAMPLE_STEPS_TEXT = `## Step 1: Inspect the host
Read the operating system release.

\`\`\`bash
cat /etc/os-release
\`\`\`
Hint: Look for the PRETTY_NAME field.

## Step 2: Check the kernel
Print the kernel release.

\`\`\`bash
uname -r
\`\`\`
Output: ^\\d+\\.\\d+`;
