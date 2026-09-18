// 부서 소식 게시판 (엘리사마 찬양단 / 마하나님 청년부) 공용 스크립트.
// 로그인 시스템이 없으므로, 부서 비밀번호는 스팸을 줄이기 위한 최소한의 문턱일 뿐
// 실제 보안이 아니다(이 저장소는 공개 저장소라 이 파일의 비밀번호 값도 누구나 볼 수 있음).
// Firestore 컬렉션 boardPosts/{dept}/posts 하나에만 공개 read/write를 허용한다
// (firestore.rules 참고, syncCodes/pageComments와 같은 개방 방식).

var BOARD_DEPTS = {
  worship: { name: '엘리사마 찬양단', writePass: 'tjdrhkd2539' },
  youth:   { name: '마하나님 청년부', writePass: 'tjdrhkd2539' }
};
var BOARD_ADMIN_PASS = 'tjdrhkd5012';

function extractYouTubeId(url) {
  if (!url) return null;
  var m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function initBoard(dept) {
  var deptInfo = BOARD_DEPTS[dept];
  var titleEl = document.getElementById('board-title');
  var descEl = document.getElementById('board-desc');
  var listEl = document.getElementById('board-list');
  var formEl = document.getElementById('board-form');
  var errorEl = document.getElementById('board-error');

  if (!deptInfo) {
    if (titleEl) titleEl.textContent = '부서를 찾을 수 없습니다';
    if (listEl) listEl.innerHTML = '';
    if (formEl) formEl.style.display = 'none';
    return;
  }

  document.title = deptInfo.name + ' 소식 · 성광감리교회';
  if (titleEl) titleEl.textContent = deptInfo.name;
  if (descEl) descEl.textContent = deptInfo.name + '의 소식과 영상을 나누는 게시판입니다.';

  var db = null;
  try {
    if (typeof firebaseConfig !== 'undefined' && firebaseConfig.apiKey) {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    }
  } catch (e) { db = null; }

  if (!db) {
    listEl.innerHTML = '<p class="board-empty">게시글을 불러올 수 없습니다.</p>';
    formEl.style.display = 'none';
    return;
  }

  var colRef = db.collection('boardPosts').doc(dept).collection('posts');

  function renderPosts(docs) {
    listEl.innerHTML = '';
    if (!docs || docs.length === 0) {
      listEl.innerHTML = '<p class="board-empty">아직 등록된 글이 없습니다. 첫 소식을 남겨보세요.</p>';
      return;
    }
    docs.forEach(function (doc) {
      var p = doc.data();
      var item = document.createElement('article');
      item.className = 'board-item';

      var meta = document.createElement('div');
      meta.className = 'board-meta';
      var d = new Date(p.createdAt);
      meta.textContent = (p.author || '익명') + ' · ' + d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
      item.appendChild(meta);

      var h3 = document.createElement('h3');
      h3.className = 'board-item-title';
      h3.textContent = p.title;
      item.appendChild(h3);

      if (p.content) {
        var body = document.createElement('p');
        body.className = 'board-item-text';
        body.textContent = p.content;
        item.appendChild(body);
      }

      if (p.videoUrl) {
        var ytId = extractYouTubeId(p.videoUrl);
        if (ytId) {
          var wrap = document.createElement('div');
          wrap.className = 'board-video';
          var iframe = document.createElement('iframe');
          iframe.src = 'https://www.youtube.com/embed/' + ytId;
          iframe.title = p.title;
          iframe.loading = 'lazy';
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          wrap.appendChild(iframe);
          item.appendChild(wrap);
        } else {
          var link = document.createElement('a');
          link.className = 'board-video-link';
          link.href = p.videoUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = '영상 보러가기 →';
          item.appendChild(link);
        }
      }

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'board-delete';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', function () {
        var pass = window.prompt('관리자 비밀번호를 입력하세요.');
        if (pass === null) return;
        if (pass !== BOARD_ADMIN_PASS) { window.alert('비밀번호가 올바르지 않습니다.'); return; }
        colRef.doc(doc.id).delete().then(loadPosts).catch(function (err) {
          window.alert('삭제에 실패했습니다: ' + err.message);
        });
      });
      item.appendChild(delBtn);

      listEl.appendChild(item);
    });
  }

  function loadPosts() {
    listEl.innerHTML = '<p class="board-empty">불러오는 중…</p>';
    colRef.orderBy('createdAt', 'desc').get().then(function (snap) {
      renderPosts(snap.docs);
    }).catch(function () {
      listEl.innerHTML = '<p class="board-empty">게시글을 불러오지 못했습니다.</p>';
    });
  }

  loadPosts();

  formEl.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';

    var author = document.getElementById('board-author').value.trim().slice(0, 20);
    var title = document.getElementById('board-post-title').value.trim();
    var content = document.getElementById('board-content').value.trim();
    var videoUrl = document.getElementById('board-video-url').value.trim();
    var pass = document.getElementById('board-write-pass').value;

    if (!title) { errorEl.textContent = '제목을 입력해 주세요.'; return; }
    if (title.length > 60) { errorEl.textContent = '제목은 60자 이내로 작성해 주세요.'; return; }
    if (content.length > 1000) { errorEl.textContent = '내용은 1000자 이내로 작성해 주세요.'; return; }
    if (pass !== deptInfo.writePass) { errorEl.textContent = '부서 비밀번호가 올바르지 않습니다.'; return; }

    var submitBtn = formEl.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    colRef.add({
      author: author || '익명',
      title: title,
      content: content,
      videoUrl: videoUrl || null,
      createdAt: Date.now()
    }).then(function () {
      formEl.reset();
      loadPosts();
    }).catch(function (err) {
      errorEl.textContent = '저장에 실패했습니다: ' + err.message;
    }).finally(function () {
      submitBtn.disabled = false;
    });
  });
}
