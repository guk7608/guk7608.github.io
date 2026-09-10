// 성경 66권을 정경 순서대로 1189장 전체를, 365일에 균등 배분하여
// bible-plan-data.js (1년 성경통독 계획표)를 생성하는 1회성 스크립트입니다.
// 매일 배정되는 장 수는 총 장수(1189) ÷ 365일 ≈ 하루 3~4장이며, 책 경계에서는
// 한 날짜에 두 책이 걸쳐 나올 수 있습니다(예: "룻기 4장 · 사무엘상 1~2장").
// 실제 성경 본문 내용은 다루지 않고 책 이름과 장수(공인된 목차 정보)만 사용하므로
// 새벽설교/주일설교의 "본문 대조 검증" 규칙과는 무관합니다.
// 수동 실행: node scripts/generate-bible-plan.js (결과물은 손으로 수정하지 마세요)

const fs = require('fs');
const path = require('path');

// book code는 대한성서공회(bskorea.or.kr) "성경듣기" 서비스의 실제 <select name="book"> 값과
// 동일하게 맞춰, 각 날짜의 본문을 해당 공식 오디오 성경으로 바로 연결할 수 있도록 한다.
const BOOKS = [
  ['창세기', 'gen', 50], ['출애굽기', 'exo', 40], ['레위기', 'lev', 27], ['민수기', 'num', 36], ['신명기', 'deu', 34],
  ['여호수아', 'jos', 24], ['사사기', 'jdg', 21], ['룻기', 'rut', 4], ['사무엘상', '1sa', 31], ['사무엘하', '2sa', 24],
  ['열왕기상', '1ki', 22], ['열왕기하', '2ki', 25], ['역대상', '1ch', 29], ['역대하', '2ch', 36], ['에스라', 'ezr', 10],
  ['느헤미야', 'neh', 13], ['에스더', 'est', 10], ['욥기', 'job', 42], ['시편', 'psa', 150], ['잠언', 'pro', 31],
  ['전도서', 'ecc', 12], ['아가', 'sng', 8], ['이사야', 'isa', 66], ['예레미야', 'jer', 52], ['예레미야애가', 'lam', 5],
  ['에스겔', 'ezk', 48], ['다니엘', 'dan', 12], ['호세아', 'hos', 14], ['요엘', 'jol', 3], ['아모스', 'amo', 9],
  ['오바댜', 'oba', 1], ['요나', 'jnh', 4], ['미가', 'mic', 7], ['나훔', 'nam', 3], ['하박국', 'hab', 3],
  ['스바냐', 'zep', 3], ['학개', 'hag', 2], ['스가랴', 'zec', 14], ['말라기', 'mal', 4],
  ['마태복음', 'mat', 28], ['마가복음', 'mrk', 16], ['누가복음', 'luk', 24], ['요한복음', 'jhn', 21], ['사도행전', 'act', 28],
  ['로마서', 'rom', 16], ['고린도전서', '1co', 16], ['고린도후서', '2co', 13], ['갈라디아서', 'gal', 6], ['에베소서', 'eph', 6],
  ['빌립보서', 'php', 4], ['골로새서', 'col', 4], ['데살로니가전서', '1th', 5], ['데살로니가후서', '2th', 3], ['디모데전서', '1ti', 6],
  ['디모데후서', '2ti', 4], ['디도서', 'tit', 3], ['빌레몬서', 'phm', 1], ['히브리서', 'heb', 13], ['야고보서', 'jas', 5],
  ['베드로전서', '1pe', 5], ['베드로후서', '2pe', 3], ['요한1서', '1jn', 5], ['요한2서', '2jn', 1], ['요한3서', '3jn', 1],
  ['유다서', 'jud', 1], ['요한계시록', 'rev', 22]
];

const TOTAL_CHAPTERS = BOOKS.reduce((sum, b) => sum + b[2], 0);
const DAYS = 365;

// 전역 장 인덱스(1..TOTAL_CHAPTERS) -> {book, code, chapter} 매핑 생성
const flat = [];
for (const [name, code, count] of BOOKS) {
  for (let c = 1; c <= count; c++) flat.push({ book: name, code, chapter: c });
}
if (flat.length !== TOTAL_CHAPTERS) throw new Error('flat length mismatch');

function jsStringLiteral(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

const entries = [];
let prevTarget = 0;
for (let day = 1; day <= DAYS; day++) {
  const target = Math.round((day * TOTAL_CHAPTERS) / DAYS);
  const startIdx = prevTarget; // 0-based, inclusive
  const endIdx = target - 1; // 0-based, inclusive
  prevTarget = target;

  // startIdx..endIdx 구간을 책별로 묶어서 세그먼트 생성 (표시용 텍스트 + 오디오 링크용 book/from/to)
  const segments = [];
  const segTexts = [];
  let i = startIdx;
  while (i <= endIdx) {
    const book = flat[i].book;
    const code = flat[i].code;
    const from = flat[i].chapter;
    let j = i;
    while (j + 1 <= endIdx && flat[j + 1].book === book) j++;
    const to = flat[j].chapter;
    segTexts.push(from === to ? `${book} ${from}장` : `${book} ${from}~${to}장`);
    segments.push({ book, code, from, to });
    i = j + 1;
  }

  var d = new Date(2027, 0, 1);
  d.setDate(d.getDate() + (day - 1));
  var label = (d.getMonth() + 1) + '월 ' + d.getDate() + '일';

  entries.push({ day, month: d.getMonth() + 1, label, text: segTexts.join(' · '), segs: segments });
}

if (prevTarget !== TOTAL_CHAPTERS) throw new Error('coverage mismatch: ' + prevTarget + ' vs ' + TOTAL_CHAPTERS);

function segLiteral(s) {
  return `{book:${jsStringLiteral(s.book)}, code:${jsStringLiteral(s.code)}, from:${s.from}, to:${s.to}}`;
}

const lines = entries.map((e, idx) => {
  const comma = idx === entries.length - 1 ? '' : ',';
  const segsLit = '[' + e.segs.map(segLiteral).join(', ') + ']';
  return `  {day:${e.day}, month:${e.month}, label:${jsStringLiteral(e.label)}, text:${jsStringLiteral(e.text)}, segs:${segsLit}}${comma}`;
});

const output = '// 이 파일은 scripts/generate-bible-plan.js가 생성한 1년 성경통독 계획표입니다. 손으로 고치지 마세요.\n'
  + 'var biblePlan = [\n' + lines.join('\n') + '\n];\n';

fs.writeFileSync(path.join(__dirname, '..', 'bible-plan-data.js'), output, 'utf8');
console.log('총 장수:', TOTAL_CHAPTERS, '| 총 일수:', entries.length, '| 검증:', prevTarget === TOTAL_CHAPTERS ? '통과' : '실패');
