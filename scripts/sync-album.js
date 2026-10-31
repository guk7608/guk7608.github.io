// 앨범 폴더(N드라이브)의 사진을 읽어 웹용으로 축소해 photos/ 에 저장하고(썸네일은 photos/thumbs/),
// album-data.js를 자동으로 갱신한 뒤, 변경이 있으면 커밋 후 GitHub에 push합니다.
// 파일명이 "YYYY-MM-DD_설명.jpg" 형태면 그 날짜를, 아니면 파일의 수정일을 날짜로 사용합니다.
// 작업 스케줄러가 주기적으로 이 스크립트를 실행합니다. 수동 실행도 가능합니다: node scripts/sync-album.js
//
// 축소: 큰 사진은 긴 변 1600px, 썸네일은 긴 변 480px의 JPEG로 저장합니다(EXIF 회전 반영, 위치정보 등 메타데이터 제거).
// 원본은 N드라이브에만 남고 홈페이지에는 올라가지 않습니다.
// 축소에는 sharp 라이브러리가 필요합니다. 프로젝트 폴더에서 한 번만 실행: npm install
// sharp가 없으면 예전처럼 원본을 그대로 복사하고 로그에 경고를 남깁니다.
// 이미 처리한 사진은 scripts/.album-cache.json에 기록해 두고, 원본이 바뀌었을 때만 다시 처리합니다.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ALBUM_DIR = process.env.ALBUM_DIR || 'N:\\개인\\0.클로드 에이전트\\앨범';
const PROJECT_DIR = path.join(__dirname, '..');
const PHOTOS_DIR = path.join(PROJECT_DIR, 'photos');
const DATA_JS = path.join(PROJECT_DIR, 'album-data.js');
const THUMBS_DIR = path.join(PHOTOS_DIR, 'thumbs');
const CACHE_FILE = path.join(__dirname, '.album-cache.json');

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})[_\-\s]*(.*)$/;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(__dirname, 'sync.log'), line + '\n');
}

function jsStringLiteral(s) {
  return '"' + String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n') + '"';
}

function safeFileName(name) {
  return name.replace(/[^\w.\-가-힣 ]/g, '_');
}

function ymd(d) {
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

function buildDataFile(entries) {
  const lines = entries.map((e, i) => {
    const comma = i === entries.length - 1 ? '' : ',';
    const thumb = e.thumb ? `, thumb:${jsStringLiteral(e.thumb)}` : '';
    return `  {date:${jsStringLiteral(e.date)}, file:${jsStringLiteral(e.file)}${thumb}, caption:${jsStringLiteral(e.caption)}}${comma}`;
  });
  return '// 이 파일은 scripts/sync-album.js가 앨범 폴더를 읽어 자동으로 재생성합니다. 손으로 고치지 마세요.\n'
    + 'var albumPhotos = [\n' + (lines.length ? lines.join('\n') + '\n' : '') + '];\n';
}

// 축소 설정 — 값을 바꾸면 PROCESS_VERSION도 올려야 기존 사진이 다시 처리됩니다.
const PROCESS_VERSION = 1;
const FULL_MAX = 1600;
const FULL_QUALITY = 80;
const THUMB_MAX = 480;
const THUMB_QUALITY = 72;

let sharp = null;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { return {}; }
}

// 원본 파일명 → photos/ 에 저장할 파일명. jpg/gif는 이름 유지, png/webp는 .jpg로 바꿈.
function outputName(file, used) {
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  const lower = ext.toLowerCase();
  let name;
  if (!sharp || lower === '.jpg' || lower === '.jpeg' || lower === '.gif') name = safeFileName(file);
  else name = safeFileName(base) + '.jpg';
  if (used.has(name.toLowerCase())) {
    const e2 = path.extname(name);
    name = path.basename(name, e2) + '_' + lower.slice(1) + e2;
  }
  used.add(name.toLowerCase());
  return name;
}

async function processPhoto(srcPath, outName, cache, stat) {
  const fullPath = path.join(PHOTOS_DIR, outName);
  const thumbName = path.basename(outName, path.extname(outName)) + '.jpg';
  const thumbPath = path.join(THUMBS_DIR, thumbName);
  const key = path.basename(srcPath);
  const sig = { out: outName, size: stat.size, mtimeMs: Math.round(stat.mtimeMs), v: sharp ? PROCESS_VERSION : 0 };
  const prev = cache[key];
  const upToDate = prev && prev.out === sig.out && prev.size === sig.size && prev.mtimeMs === sig.mtimeMs && prev.v === sig.v
    && fs.existsSync(fullPath) && (!sharp || fs.existsSync(thumbPath));

  if (!upToDate) {
    if (sharp) {
      const isGif = path.extname(outName).toLowerCase() === '.gif';
      if (isGif) {
        fs.copyFileSync(srcPath, fullPath); // 움직이는 GIF는 그대로 둔다
      } else {
        await sharp(srcPath).rotate()
          .resize(FULL_MAX, FULL_MAX, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: FULL_QUALITY, mozjpeg: true })
          .toFile(fullPath);
      }
      await sharp(srcPath).rotate()
        .resize(THUMB_MAX, THUMB_MAX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
        .toFile(thumbPath);
      log(`사진 축소: ${key} (${Math.round(stat.size / 1024)}KB → ${Math.round(fs.statSync(fullPath).size / 1024)}KB, 썸네일 ${Math.round(fs.statSync(thumbPath).size / 1024)}KB)`);
    } else {
      fs.copyFileSync(srcPath, fullPath);
    }
    cache[key] = sig;
  }
  return sharp ? 'photos/thumbs/' + thumbName : null;
}

async function main() {
  if (!fs.existsSync(ALBUM_DIR)) {
    log(`앨범 폴더를 찾을 수 없음: ${ALBUM_DIR} (N드라이브 연결 확인 필요) — 중단`);
    return;
  }
  if (!sharp) log('경고: sharp가 설치되어 있지 않아 사진을 축소하지 않고 원본 그대로 복사합니다. 프로젝트 폴더에서 "npm install"을 실행하세요.');
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  if (sharp) fs.mkdirSync(THUMBS_DIR, { recursive: true });

  const files = fs.readdirSync(ALBUM_DIR).filter(f => IMAGE_EXT_RE.test(f)).sort();
  const cache = loadCache();
  const used = new Set();
  const entries = [];

  for (const file of files) {
    const srcPath = path.join(ALBUM_DIR, file);
    const stat = fs.statSync(srcPath);
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    const m = DATE_PREFIX_RE.exec(base);
    let date, caption;
    if (m && m[1]) {
      date = m[1];
      caption = m[2].trim();
    } else {
      date = ymd(stat.mtime);
      caption = base;
    }
    const outName = outputName(file, used);
    let thumb = null;
    try {
      thumb = await processPhoto(srcPath, outName, cache, stat);
    } catch (err) {
      log(`사진 처리 실패, 건너뜀: ${file} — ${err.message}`);
      continue;
    }
    const entry = { date, file: 'photos/' + outName, caption };
    if (thumb) entry.thumb = thumb;
    entries.push(entry);
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));

  // 원본 폴더에서 사라진 사진(과 썸네일) 정리
  const keepNames = new Set(entries.map(e => path.basename(e.file)));
  keepNames.add('.gitkeep');
  keepNames.add('thumbs');
  for (const existing of fs.readdirSync(PHOTOS_DIR)) {
    if (!keepNames.has(existing)) {
      fs.unlinkSync(path.join(PHOTOS_DIR, existing));
      log(`원본 폴더에서 사라진 사진 삭제: ${existing}`);
    }
  }
  if (fs.existsSync(THUMBS_DIR)) {
    const keepThumbs = new Set(entries.filter(e => e.thumb).map(e => path.basename(e.thumb)));
    for (const existing of fs.readdirSync(THUMBS_DIR)) {
      if (!keepThumbs.has(existing)) fs.unlinkSync(path.join(THUMBS_DIR, existing));
    }
  }
  const files_set = new Set(files);
  for (const k of Object.keys(cache)) if (!files_set.has(k)) delete cache[k];
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1), 'utf8');

  const newData = buildDataFile(entries);
  const oldData = fs.existsSync(DATA_JS) ? fs.readFileSync(DATA_JS, 'utf8') : '';

  let dataChanged = newData !== oldData;
  if (dataChanged) {
    fs.writeFileSync(DATA_JS, newData, 'utf8');
  }

  log(`앨범 사진 ${entries.length}장 확인 (변경: ${dataChanged ? '있음' : '없음'})`);

  try {
    execFileSync('git', ['add', 'album-data.js', 'photos'], { cwd: PROJECT_DIR });
    const status = execFileSync('git', ['status', '--porcelain', 'album-data.js', 'photos'], { cwd: PROJECT_DIR }).toString();
    if (!status.trim()) {
      log('git 변경사항 없음');
      return;
    }
    execFileSync('git', ['commit', '-m',
      `앨범 사진 자동 갱신 (총 ${entries.length}장)\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
    ], { cwd: PROJECT_DIR });
    execFileSync('git', ['pull', '--rebase', '--autostash', '-q'], { cwd: PROJECT_DIR });
    execFileSync('git', ['push'], { cwd: PROJECT_DIR });
    log('git commit/push 완료');
  } catch (err) {
    log('git 처리 중 오류: ' + err.message);
  }
}

main().catch(err => log('앨범 동기화 오류: ' + err.message));
