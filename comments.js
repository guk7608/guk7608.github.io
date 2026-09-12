// 댓글(묵상 나눔) 기능 — devotion.html, sunday-word.html 공용.
// 로그인 없이 이름(선택)+텍스트로 남기는 방명록 형태이며, Firestore의 'pageComments'
// 컬렉션 하나에만 공개 read/write를 허용한다 (성경통독 "동기화 코드"와 같은 개방 방식 —
// firestore.rules 참고). 문서 하나(페이지별)가 comments 배열을 담는 구조라 별도 인덱스가 필요 없다.
//
// 스팸 방지는 클라이언트 단어 목록 검사와 링크 차단뿐이다 — 개발자 도구로 Firestore를 직접
// 호출하면 우회할 수 있는 최소한의 장치임을 인지할 것. 더 강한 차단이 필요해지면 Firestore
// 보안 규칙 또는 Cloud Function(유료 Blaze 요금제 필요) 단으로 옮겨야 한다.

var COMMENT_SPAM_WORDS = [
  '도박', '카지노', '토토', '바카라', '먹튀',
  '대출상담', '대부업', '캐피탈대출', '급전',
  '비아그라', '시알리스', '발기부전',
  '출장마사지', '풀싸롱', '오피사이트',
  '비트코인투자', '코인리딩방', '리딩방', '무료지급', '가입즉시',
  'viagra', 'casino', 'porn'
];

function commentTextBlocked(text) {
  var normalized = text.toLowerCase().replace(/\s+/g, '');
  var hitsWord = COMMENT_SPAM_WORDS.some(function (w) {
    return normalized.indexOf(w.toLowerCase().replace(/\s+/g, '')) !== -1;
  });
  var hitsLink = /https?:\/\//i.test(text) || /www\./i.test(text);
  return hitsWord || hitsLink;
}

function initCommentBox(containerId, pageKey) {
  var host = document.getElementById(containerId);
  if (!host) return;

  host.innerHTML =
    '<p class="kicker">묵상 나눔</p>' +
    '<div class="comment-list" id="' + containerId + '-list"><p class="comment-empty">불러오는 중…</p></div>' +
    '<form class="comment-form" id="' + containerId + '-form">' +
      '<input type="text" maxlength="20" placeholder="이름 (선택, 기본 익명)" id="' + containerId + '-name">' +
      '<textarea maxlength="500" rows="3" placeholder="말씀을 묵상하며 나누고 싶은 이야기를 남겨주세요." required id="' + containerId + '-text"></textarea>' +
      '<div class="comment-form-row">' +
        '<span class="comment-error" id="' + containerId + '-error"></span>' +
        '<button type="submit">나눔 남기기</button>' +
      '</div>' +
    '</form>';

  var listEl = document.getElementById(containerId + '-list');
  var formEl = document.getElementById(containerId + '-form');
  var nameEl = document.getElementById(containerId + '-name');
  var textEl = document.getElementById(containerId + '-text');
  var errorEl = document.getElementById(containerId + '-error');
  var submitBtn = formEl.querySelector('button');

  var db = null;
  try {
    if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
  } catch (e) { db = null; }

  function renderList(comments) {
    listEl.innerHTML = '';
    if (!comments || comments.length === 0) {
      listEl.innerHTML = '<p class="comment-empty">아직 남긴 나눔이 없습니다. 첫 나눔을 남겨보세요.</p>';
      return;
    }
    comments.slice().sort(function (a, b) { return a.createdAt - b.createdAt; }).forEach(function (c) {
      var item = document.createElement('div');
      item.className = 'comment-item';
      var meta = document.createElement('div');
      meta.className = 'comment-meta';
      var d = new Date(c.createdAt);
      meta.textContent = (c.nickname || '익명') + ' · ' + d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
      var body = document.createElement('div');
      body.className = 'comment-text';
      body.textContent = c.text;
      item.appendChild(meta);
      item.appendChild(body);
      listEl.appendChild(item);
    });
  }

  if (!db) {
    listEl.innerHTML = '<p class="comment-empty">댓글을 불러올 수 없습니다.</p>';
    formEl.style.display = 'none';
    return;
  }

  var docRef = db.collection('pageComments').doc(pageKey);
  docRef.get().then(function (snap) {
    renderList(snap.exists ? snap.data().comments : []);
  }).catch(function () {
    listEl.innerHTML = '<p class="comment-empty">댓글을 불러오지 못했습니다.</p>';
  });

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';
    var text = textEl.value.trim();
    if (!text) return;
    if (text.length > 500) {
      errorEl.textContent = '500자 이내로 작성해 주세요.';
      return;
    }
    if (commentTextBlocked(text)) {
      errorEl.textContent = '게시할 수 없는 내용이 포함되어 있습니다.';
      return;
    }
    var nickname = nameEl.value.trim().slice(0, 20) || '익명';
    var newComment = { nickname: nickname, text: text, createdAt: Date.now() };

    submitBtn.disabled = true;
    docRef.set({
      comments: firebase.firestore.FieldValue.arrayUnion(newComment)
    }, { merge: true }).then(function () {
      textEl.value = '';
      nameEl.value = '';
      return docRef.get();
    }).then(function (snap) {
      renderList(snap.data().comments);
    }).catch(function (err) {
      errorEl.textContent = '저장에 실패했습니다: ' + err.message;
    }).finally(function () {
      submitBtn.disabled = false;
    });
  });
}
