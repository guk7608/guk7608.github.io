// 앨범 폴더(N드라이브)의 사진을 읽어 photos/ 에 복사하고 album-data.js를 자동으로 갱신한 뒤,
// 변경이 있으면 커밋 후 GitHub에 push합니다.
// 파일명이 "YYYY-MM-DD_설명.jpg" 형태면 그 날짜를, 아니면 파일의 수정일을 날짜로 사용합니다.
// 작업 스케줄러가 주기적으로 이 스크립트를 실행합니다. 수동 실행도 가능합니다: node scripts/sync-album.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ALBUM_DIR = 'N:\\개인\\0.클로드 에이전트\\앨범';
const PROJECT_DIR = path.join(__dirname, '..');
const PHOTOS_DIR = path.join(PROJECT_DIR, 'photos');
const DATA_JS = path.join(PROJECT_DIR, 'album-data.js');

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
    return `  {date:${jsStringLiteral(e.date)}, file:${jsStringLiteral(e.file)}, caption:${jsStringLiteral(e.caption)}}${comma}`;
  });
  return '// 이 파일은 scripts/sync-album.js가 앨범 폴더를 읽어 자동으로 재생성합니다. 손으로 고치지 마세요.\n'
    + 'var albumPhotos = [\n' + (lines.length ? lines.join('\n') + '\n' : '') + '];\n';
}

function main() {
  if (!fs.existsSync(ALBUM_DIR)) {
    log(`앨범 폴더를 찾을 수 없음: ${ALBUM_DIR} (N드라이브 연결 확인 필요) — 중단`);
    return;
  }
  if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

  const files = fs.readdirSync(ALBUM_DIR).filter(f => IMAGE_EXT_RE.test(f));

  const entries = files.map(file => {
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
    const safeName = safeFileName(file);
    fs.copyFileSync(srcPath, path.join(PHOTOS_DIR, safeName));
    return { date, file: 'photos/' + safeName, caption };
  });

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));

  const keepNames = new Set(entries.map(e => path.basename(e.file)));
  keepNames.add('.gitkeep');
  for (const existing of fs.readdirSync(PHOTOS_DIR)) {
    if (!keepNames.has(existing)) {
      fs.unlinkSync(path.join(PHOTOS_DIR, existing));
      log(`원본 폴더에서 사라진 사진 삭제: ${existing}`);
    }
  }

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
    execFileSync('git', ['push'], { cwd: PROJECT_DIR });
    log('git commit/push 완료');
  } catch (err) {
    log('git 처리 중 오류: ' + err.message);
  }
}

main();
