// 게시판 공용 스크립트 (부서 소식: 엘리사마 찬양단 / 마하나님 청년부, 로고스: 맥체인성경공부).
// 로그인 시스템이 없으므로, 부서 비밀번호는 스팸을 줄이기 위한 최소한의 문턱일 뿐
// 실제 보안이 아니다(이 저장소는 공개 저장소라 이 파일의 비밀번호 값도 누구나 볼 수 있음).
// Firestore 컬렉션 boardPosts/{dept}/posts 하나에만 공개 read/write를 허용한다
// (firestore.rules 참고, syncCodes/pageComments와 같은 개방 방식).

var BOARD_DEPTS = {
  worship: { name: '엘리사마 찬양단', writePass: '2539' },
  youth:   { name: '마하나님 청년부', writePass: '2539' },
  mccheyne: {
    name: '맥체인성경공부', writePass: '2539', pageTitle: '맥체인성경공부',
    desc: '맥체인 성경읽기표를 따라 함께 읽고 나눈 말씀과 묵상을 기록하는 게시판입니다.',
    backHref: 'logos.html', backLabel: '← 로고스', passLabel: '모임'
  }
};
var BOARD_ADMIN_PASS = 'tjdrhkd5012';

function extractYouTubeId(url) {
  if (!url) return null;
  var m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// 글 내용 속 링크를 눌러서 열 수 있게 바꿔 붙인다.
//  - [다운로드](https://...) 처럼 쓰면 "다운로드" 글자에 링크가 걸린다.
//  - 그냥 쓴 http(s) 주소도 링크가 된다.
// innerHTML을 쓰지 않고 텍스트 노드와 <a>만 만들어서, 글 내용의 HTML은 그대로 글자로 보인다.
function appendLinkedText(el, text) {
  var re = /\[([^\]\n]{1,40})\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s<>"']+/g;
  var last = 0, m;
  while ((m = re.exec(text)) !== null) {
    var label, url, end;
    if (m[1]) {
      label = m[1];
      url = m[2];
      end = m.index + m[0].length;
    } else {
      url = m[0].replace(/[.,!?)\]]+$/, '');
      try { label = decodeURI(url); } catch (e) { label = url; }
      end = m.index + url.length;
    }
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
    var a = document.createElement('a');
    a.className = 'board-text-link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    el.appendChild(a);
    last = end;
    re.lastIndex = end;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
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

  document.title = (deptInfo.pageTitle || deptInfo.name + ' 소식') + ' · 성광감리교회';
  if (titleEl) titleEl.textContent = deptInfo.name;
  if (descEl) descEl.textContent = deptInfo.desc || deptInfo.name + '의 소식과 영상을 나누는 게시판입니다.';
  var backEl = document.getElementById('board-back');
  if (backEl && deptInfo.backHref) {
    backEl.href = deptInfo.backHref;
    backEl.textContent = deptInfo.backLabel;
  }
  var passLabel = deptInfo.passLabel || '부서';
  var passEl = document.getElementById('board-write-pass');
  if (passEl) passEl.placeholder = passLabel + ' 비밀번호';
  var hintEl = document.getElementById('board-pass-hint');
  if (hintEl) hintEl.textContent = passLabel + '원끼리 공유하는 글쓰기 비밀번호입니다. 모르시면 ' + passLabel + ' 담당자에게 문의해 주세요.';

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
      meta.textContent = (p.author || '익명') + ' · ' + d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }) + (p.editedAt ? ' · 수정됨' : '');
      item.appendChild(meta);

      var h3 = document.createElement('h3');
      h3.className = 'board-item-title';
      h3.textContent = p.title;
      item.appendChild(h3);

      if (p.content) {
        var body = document.createElement('p');
        body.className = 'board-item-text';
        appendLinkedText(body, p.content);
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

      // 첨부 파일: 주소는 글에 드러내지 않고 "다운로드" 버튼 하나로 보여 준다.
      if (p.attachUrl && /^https?:\/\//.test(p.attachUrl)) {
        var attach = document.createElement('a');
        attach.className = 'board-attach';
        attach.href = p.attachUrl;
        attach.setAttribute('download', '');
        attach.textContent = '📥 ' + (p.attachName || '첨부 파일') + ' 다운로드';
        item.appendChild(attach);
      }

      var actions = document.createElement('div');
      actions.className = 'board-actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'board-action-btn';
      editBtn.textContent = '수정';
      editBtn.addEventListener('click', function () {
        var pass = window.prompt('관리자 비밀번호를 입력하세요.');
        if (pass === null) return;
        if (pass !== BOARD_ADMIN_PASS) { window.alert('비밀번호가 올바르지 않습니다.'); return; }
        showEditForm(item, doc.id, p);
      });
      actions.appendChild(editBtn);

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'board-action-btn';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', function () {
        var pass = window.prompt('관리자 비밀번호를 입력하세요.');
        if (pass === null) return;
        if (pass !== BOARD_ADMIN_PASS) { window.alert('비밀번호가 올바르지 않습니다.'); return; }
        colRef.doc(doc.id).delete().then(loadPosts).catch(function (err) {
          window.alert('삭제에 실패했습니다: ' + err.message);
        });
      });
      actions.appendChild(delBtn);

      item.appendChild(actions);

      listEl.appendChild(item);
    });
  }

  function showEditForm(item, postId, p) {
    item.innerHTML = '';

    var form = document.createElement('form');
    form.className = 'board-form board-edit-form';

    var titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.maxLength = 60;
    titleInput.placeholder = '제목';
    titleInput.value = p.title || '';
    titleInput.required = true;

    var contentInput = document.createElement('textarea');
    contentInput.rows = 4;
    contentInput.maxLength = 1000;
    contentInput.placeholder = '내용을 입력해 주세요.';
    contentInput.value = p.content || '';

    var videoInput = document.createElement('input');
    videoInput.type = 'url';
    videoInput.placeholder = '영상 링크 (선택, 유튜브 주소)';
    videoInput.value = p.videoUrl || '';

    var row = document.createElement('div');
    row.className = 'board-form-row';

    var errorSpan = document.createElement('span');
    errorSpan.className = 'board-error';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'board-action-btn';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', loadPosts);

    var saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.textContent = '저장';

    row.appendChild(errorSpan);
    row.appendChild(cancelBtn);
    row.appendChild(saveBtn);

    form.appendChild(titleInput);
    form.appendChild(contentInput);
    form.appendChild(videoInput);
    form.appendChild(row);
    item.appendChild(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorSpan.textContent = '';
      var newTitle = titleInput.value.trim();
      var newContent = contentInput.value.trim();
      var newVideo = videoInput.value.trim();
      if (!newTitle) { errorSpan.textContent = '제목을 입력해 주세요.'; return; }
      if (newTitle.length > 60) { errorSpan.textContent = '제목은 60자 이내로 작성해 주세요.'; return; }
      if (newContent.length > 1000) { errorSpan.textContent = '내용은 1000자 이내로 작성해 주세요.'; return; }

      saveBtn.disabled = true;
      colRef.doc(postId).update({
        title: newTitle,
        content: newContent,
        videoUrl: newVideo || null,
        editedAt: Date.now()
      }).then(loadPosts).catch(function (err) {
        errorSpan.textContent = '저장에 실패했습니다: ' + err.message;
        saveBtn.disabled = false;
      });
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
    var pass = document.getElementById('board-write-pass').value.trim();

    if (!title) { errorEl.textContent = '제목을 입력해 주세요.'; return; }
    if (title.length > 60) { errorEl.textContent = '제목은 60자 이내로 작성해 주세요.'; return; }
    if (content.length > 1000) { errorEl.textContent = '내용은 1000자 이내로 작성해 주세요.'; return; }
    if (pass !== deptInfo.writePass) { errorEl.textContent = passLabel + ' 비밀번호가 올바르지 않습니다.'; return; }

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
