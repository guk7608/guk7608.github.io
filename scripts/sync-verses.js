// 새벽설교 폴더를 읽어 index.html의 새벽묵상 구절 목록을 자동으로 갱신하고,
// 변경이 있으면 커밋 후 GitHub에 push합니다.
// 작업 스케줄러가 주기적으로 이 스크립트를 실행합니다. 수동 실행도 가능합니다: node scripts/sync-verses.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SERMON_DIR = 'N:\\개인\\0.클로드 에이전트\\설교집\\새벽설교';
const PROJECT_DIR = path.join(__dirname, '..');
const INDEX_HTML = path.join(PROJECT_DIR, 'index.html');

const FILENAME_RE = /^(\d{4}-\d{2}-\d{2}), (\d+)강 (.+)\.md$/;
const BODY_LINE_RE = /^>\s*본문:\s*([^\s0-9][^\s]*)\s+(\d+):(\d+)/m;
const TAG_LINE_RE = /^>\s*새벽묵상:\s*([^\s0-9][^\s]*)\s+(\d+):(\d+)/m;
const VERSE_LINE_RE = /^(?:(\d+):)?(\d+)\.\s+(.+)$/gm;

// "## 본문" 섹션의 번호 매김 줄들을 {chapter, verse, text} 목록으로 파싱한다.
// "N. 텍스트" 줄은 현재 장(章)을 따르고, "장:절. 텍스트" 줄은 장이 바뀔 때 등장한다.
function parseVerseList(sectionText, startChapter) {
  const list = [];
  let currentChapter = startChapter;
  let m;
  VERSE_LINE_RE.lastIndex = 0;
  while ((m = VERSE_LINE_RE.exec(sectionText))) {
    const [, chapterPart, versePart, text] = m;
    if (chapterPart) currentChapter = chapterPart;
    list.push({ chapter: currentChapter, verse: versePart, text: text.trim() });
  }
  return list;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(__dirname, 'sync.log'), line + '\n');
}

function parseSermon(filePath, fileName) {
  const m = FILENAME_RE.exec(fileName);
  if (!m) return null;
  const [, date, gang, title] = m;

  const text = fs.readFileSync(filePath, 'utf8');

  const bodyMatch = BODY_LINE_RE.exec(text);
  if (!bodyMatch) {
    log(`경고: ${fileName} 에서 "> 본문:" 줄을 찾지 못함 — 건너뜀`);
    return null;
  }
  const [, book, startChapter, startVerse] = bodyMatch;

  const bodySectionIdx = text.indexOf('## 본문');
  const searchArea = bodySectionIdx >= 0 ? text.slice(bodySectionIdx) : text;
  const verseList = parseVerseList(searchArea, startChapter);
  if (verseList.length === 0) {
    log(`경고: ${fileName} 에서 본문 구절 목록을 찾지 못함 — 건너뜀`);
    return null;
  }

  // "> 새벽묵상: 책 장:절" 태그가 있으면 그 구절을, 없으면 본문의 첫 절을 사용한다.
  const tagMatch = TAG_LINE_RE.exec(text);
  let chosen = null;
  if (tagMatch) {
    const [, , tagChapter, tagVerse] = tagMatch;
    chosen = verseList.find(v => v.chapter === tagChapter && v.verse === tagVerse);
    if (!chosen) {
      log(`경고: ${fileName} 의 "> 새벽묵상: ${tagChapter}:${tagVerse}" 태그와 일치하는 절을 본문에서 찾지 못함 — 첫 절로 대체`);
    }
  } else {
    log(`안내: ${fileName} 에 "> 새벽묵상:" 태그가 없어 본문 첫 절을 사용함 (더 나은 절을 고르려면 태그를 추가하세요)`);
  }
  if (!chosen) chosen = verseList[0];

  return {
    date,
    series: `새벽설교 ${gang}강 · ${title}`,
    verse: chosen.text,
    ref: `${book} ${chosen.chapter}:${chosen.verse}`
  };
}

function jsStringLiteral(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function buildArrayBlock(entries) {
  const lines = entries.map((e, i) => {
    const comma = i === entries.length - 1 ? '' : ',';
    return `    {date:${jsStringLiteral(e.date)}, series:${jsStringLiteral(e.series)}, verse:${jsStringLiteral(e.verse)}, ref:${jsStringLiteral(e.ref)}}${comma}`;
  });
  return 'var sermonVerses = [\n' + lines.join('\n') + '\n  ];';
}

function main() {
  if (!fs.existsSync(SERMON_DIR)) {
    log(`설교 폴더를 찾을 수 없음: ${SERMON_DIR} (N드라이브 연결 확인 필요) — 중단`);
    return;
  }

  const files = fs.readdirSync(SERMON_DIR).filter(f => FILENAME_RE.test(f));
  const entries = [];
  for (const f of files) {
    const parsed = parseSermon(path.join(SERMON_DIR, f), f);
    if (parsed) entries.push(parsed);
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length === 0) {
    log('파싱된 새벽설교가 없음 — 중단');
    return;
  }

  let html = fs.readFileSync(INDEX_HTML, 'utf8');
  const startMarker = '// AUTO-GENERATED SERMON VERSES START';
  const endMarker = '// AUTO-GENERATED SERMON VERSES END';
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    log('index.html에서 AUTO-GENERATED 마커를 찾지 못함 — 중단');
    return;
  }

  const before = html.slice(0, startIdx + startMarker.length);
  const after = html.slice(endIdx);
  const newHtml = before + '\n  ' + buildArrayBlock(entries) + '\n  ' + after;

  if (newHtml === html) {
    log(`변경 없음 (설교 ${entries.length}건, 최신: ${entries[entries.length - 1].date})`);
    return;
  }

  fs.writeFileSync(INDEX_HTML, newHtml, 'utf8');
  log(`index.html 갱신 완료 (설교 ${entries.length}건, 최신: ${entries[entries.length - 1].date})`);

  try {
    const status = execFileSync('git', ['status', '--porcelain', 'index.html'], { cwd: PROJECT_DIR }).toString();
    if (!status.trim()) {
      log('git 변경사항 없음');
      return;
    }
    execFileSync('git', ['add', 'index.html'], { cwd: PROJECT_DIR });
    execFileSync('git', ['commit', '-m',
      `새벽묵상 자동 갱신 (${entries[entries.length - 1].date} 기준 ${entries.length}개 구절)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
    ], { cwd: PROJECT_DIR });
    execFileSync('git', ['push'], { cwd: PROJECT_DIR });
    log('git commit/push 완료');
  } catch (err) {
    log('git 처리 중 오류: ' + err.message);
  }
}

main();
