// 주일설교(창세기와 복음 시리즈) 폴더를 읽어 sunday-word-data.js를 자동으로 갱신하고,
// 변경이 있으면 커밋 후 GitHub에 push합니다.
// 화면 표시는 매 주일 오후 3시를 기준으로 그 주의 말씀으로 전환됩니다 (클라이언트 JS에서 처리).
// 작업 스케줄러가 주기적으로 이 스크립트를 실행합니다. 수동 실행도 가능합니다: node scripts/sync-sunday-word.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SERMON_DIR = 'N:\\개인\\0.클로드 에이전트\\설교집\\주일설교';
const PROJECT_DIR = path.join(__dirname, '..');
const DATA_JS = path.join(PROJECT_DIR, 'sunday-word-data.js');

const FILENAME_RE = /^(\d{4}-\d{2}-\d{2}), (\d+)강 (.+)\.md$/;
// 본문 인용문이 시작되는 위치를 찾는 줄(장·절 범위 추출용으로는 쓰지 않음 — 발췌 인용은 범위가 조각나 있을 수 있음)
const BODY_LINE_RE = /본문[^\n]*?[가-힣]+\s+\d+:\d+/;
// 실제 본문 범위는 "창세기 X:Y-Z |" 형태의 제목줄(3강부터)에서 우선 추출하고,
// 없으면 본문 줄 자체에서 첫 장:절만이라도 추출한다.
const TITLE_RANGE_RE = /([가-힣]+)\s+(\d+:\d+(?:[-–]\d+(?::\d+)?)?)\s*\|/;
const BODY_RANGE_FALLBACK_RE = /본문[^\n]*?([가-힣]+)\s+(\d+:\d+(?:[-–]\d+(?::\d+)?)?)/;
const SUMMARY_SECTION_RE = /## 이주의 말씀 요약\s*\(1000자[^)]*\)\s*\n+([\s\S]*?)(?:\n---|\n## )/;

// 파일명이 "YYYY-MM-DD, N강 제목.md" 패턴을 따르지 않는 초기 2개 파일(1강, 2강)은
// 레거시 파일명이라 여기서 직접 지정한다. 3강부터는 전부 패턴을 따르므로 자동 인식된다.
const LEGACY_FILES = [
  { file: 'SUNDAY_SERMON_창1-1-5_20260816.md', date: '2026-08-16', gang: '1', title: '빛이 있으라' },
  { file: '주보_보시기에좋았더라_20260823.md', date: '2026-08-23', gang: '2', title: '보시기에 심히 좋았더라' }
];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(__dirname, 'sync.log'), line + '\n');
}

function extractRange(text) {
  const titleMatch = TITLE_RANGE_RE.exec(text);
  if (titleMatch) return { book: titleMatch[1], range: titleMatch[2] };
  const fallbackMatch = BODY_RANGE_FALLBACK_RE.exec(text);
  if (fallbackMatch) return { book: fallbackMatch[1], range: fallbackMatch[2] };
  return null;
}

function extractPassage(text) {
  const bodyMatch = BODY_LINE_RE.exec(text);
  if (!bodyMatch) return null;
  const afterLineIdx = text.indexOf('\n', bodyMatch.index);
  const rest = text.slice(afterLineIdx + 1);
  const endMatch = /\n---|\n##\s/.exec(rest);
  let passage = endMatch ? rest.slice(0, endMatch.index) : rest;
  passage = passage
    .split('\n')
    .map(line => line.replace(/^>\s?/, '').trim())
    .filter(line => line.length > 0)
    .join(' ')
    .trim();
  const rangeInfo = extractRange(text);
  return {
    book: rangeInfo ? rangeInfo.book : '',
    range: rangeInfo ? rangeInfo.range : '',
    passage
  };
}

function extractSummary(text, fileName) {
  const m = SUMMARY_SECTION_RE.exec(text);
  if (!m) {
    log(`안내: ${fileName} 에 "## 이주의 말씀 요약 (800자 내외)" 섹션이 없어 요약 없이 게재됨`);
    return '';
  }
  return m[1].trim();
}

function parseOne(filePath, fileName, date, gang, title) {
  const text = fs.readFileSync(filePath, 'utf8');
  const bodyInfo = extractPassage(text);
  if (!bodyInfo) {
    log(`경고: ${fileName} 에서 본문 정보를 찾지 못함 — 건너뜀`);
    return null;
  }
  const summary = extractSummary(text, fileName);
  return {
    date,
    series: `창세기와 복음 ${gang}강 · ${title}`,
    ref: `${bodyInfo.book} ${bodyInfo.range}`,
    passage: bodyInfo.passage,
    summary
  };
}

function jsStringLiteral(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function buildDataFile(entries) {
  const lines = entries.map((e, i) => {
    const comma = i === entries.length - 1 ? '' : ',';
    return `  {date:${jsStringLiteral(e.date)}, series:${jsStringLiteral(e.series)}, ref:${jsStringLiteral(e.ref)}, passage:${jsStringLiteral(e.passage)}, summary:${jsStringLiteral(e.summary)}}${comma}`;
  });
  return '// 이 파일은 scripts/sync-sunday-word.js가 주일설교 폴더를 읽어 자동으로 재생성합니다. 손으로 고치지 마세요.\n'
    + 'var sundayWords = [\n' + lines.join('\n') + '\n];\n';
}

function main() {
  if (!fs.existsSync(SERMON_DIR)) {
    log(`주일설교 폴더를 찾을 수 없음: ${SERMON_DIR} (N드라이브 연결 확인 필요) — 중단`);
    return;
  }

  const entries = [];

  for (const legacy of LEGACY_FILES) {
    const fp = path.join(SERMON_DIR, legacy.file);
    if (!fs.existsSync(fp)) {
      log(`경고: 레거시 파일을 찾을 수 없음: ${legacy.file} — 건너뜀`);
      continue;
    }
    const parsed = parseOne(fp, legacy.file, legacy.date, legacy.gang, legacy.title);
    if (parsed) entries.push(parsed);
  }

  const files = fs.readdirSync(SERMON_DIR).filter(f => FILENAME_RE.test(f));
  for (const f of files) {
    const m = FILENAME_RE.exec(f);
    const [, date, gang, title] = m;
    const parsed = parseOne(path.join(SERMON_DIR, f), f, date, gang, title);
    if (parsed) entries.push(parsed);
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length === 0) {
    log('파싱된 주일설교가 없음 — 중단');
    return;
  }

  const newData = buildDataFile(entries);
  const oldData = fs.existsSync(DATA_JS) ? fs.readFileSync(DATA_JS, 'utf8') : '';

  if (newData === oldData) {
    log(`변경 없음 (주일설교 ${entries.length}건, 최신: ${entries[entries.length - 1].date})`);
    return;
  }

  fs.writeFileSync(DATA_JS, newData, 'utf8');
  log(`sunday-word-data.js 갱신 완료 (주일설교 ${entries.length}건, 최신: ${entries[entries.length - 1].date})`);

  try {
    const status = execFileSync('git', ['status', '--porcelain', 'sunday-word-data.js'], { cwd: PROJECT_DIR }).toString();
    if (!status.trim()) {
      log('git 변경사항 없음');
      return;
    }
    execFileSync('git', ['add', 'sunday-word-data.js'], { cwd: PROJECT_DIR });
    execFileSync('git', ['commit', '-m',
      `이주의 말씀 자동 갱신 (${entries[entries.length - 1].date} 기준 ${entries.length}건)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
    ], { cwd: PROJECT_DIR });
    execFileSync('git', ['push'], { cwd: PROJECT_DIR });
    log('git commit/push 완료');
  } catch (err) {
    log('git 처리 중 오류: ' + err.message);
  }
}

main();
