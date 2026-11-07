// 화면. criteria.json · keywords.json · data/answer.json 을 읽어서 그린다.
// AI(Gemini)는 서버 함수 api/classify 가 부른다. 열쇠는 이 화면에 없다.
(function () {
  var criteria = null, keywords = null;
  var BATCH = 10; // AI 채점은 10개씩 보낸다

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + " 을(를) 읽지 못했습니다 (" + r.status + ")");
      return r.json();
    });
  }

  function showError(msg) {
    var box = $("error");
    box.textContent = msg;
    box.hidden = false;
  }

  function addRow(parent, label, value) {
    var row = el("div", "row");
    row.appendChild(el("span", "label", label));
    row.appendChild(el("span", "value", value));
    parent.appendChild(row);
  }

  // ---- AI 부르기 ----
  // items: [{id, text(가린 문장)}]  →  {모델, results:[{id, 칸, 긴급도, 이유} | {id, 오류}]}
  function callAI(items) {
    return fetch("api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok || !data.results) {
          throw new Error(data["오류"] || ("AI 서버가 답하지 않았습니다 (" + r.status + ")"));
        }
        return data;
      });
    });
  }

  // ---- 탭 ----
  function selectTab(name) {
    ["classify", "grade"].forEach(function (n) {
      $("tab-" + n).setAttribute("aria-selected", n === name ? "true" : "false");
      $("panel-" + n).hidden = n !== name;
    });
  }

  // ---- 분류 탭 ----
  function onClassify() {
    var raw = $("input").value.trim();
    var out = $("result");
    out.textContent = "";
    if (!raw) { out.appendChild(el("p", "hint", "문장을 먼저 넣어 주세요.")); return; }
    var masked = window.maskText(raw);

    $("go").disabled = true;
    out.appendChild(el("p", "hint", "AI로 가르는 중…"));

    callAI([{ id: "q", text: masked }]).then(function (data) {
      var r = data.results[0];
      if (!r || r["오류"]) throw new Error((r && r["오류"]) || "AI가 답을 주지 않았습니다");
      out.textContent = "";
      addRow(out, "가린 문장", masked);
      addRow(out, "칸", r["칸"]);
      addRow(out, "긴급도", r["긴급도"]);
      addRow(out, "이유", r["이유"]);
      out.appendChild(el("p", "hint", "AI(" + data["모델"] + ")가 갈랐습니다."));
    }).catch(function (e) {
      var rr = window.classifyByRules(masked, criteria, keywords);
      out.textContent = "";
      out.appendChild(el("p", "notice", "AI 없이 규칙으로 갈랐습니다."));
      addRow(out, "가린 문장", masked);
      addRow(out, "칸", rr["칸"]);
      addRow(out, "긴급도", rr["긴급도"]);
      addRow(out, "이유", rr["이유"]);
      out.appendChild(el("p", "hint", "AI가 답하지 못한 까닭: " + e.message));
    }).then(function () { $("go").disabled = false; });
  }

  // ---- 채점 탭 ----
  function pct(n, total) { return total ? (Math.round(n / total * 1000) / 10) + "%" : "-"; }

  function setGradeButtons(disabled) {
    $("grade-go").disabled = disabled;
    $("grade-ai-go").disabled = disabled;
  }

  // 정답 문장마다 가린 문장과 규칙 판정을 붙인다.
  function prepare(answers) {
    return answers.map(function (a) {
      var masked = window.maskText(a.text);
      return { a: a, masked: masked, rules: window.classifyByRules(masked, criteria, keywords), ai: null };
    });
  }

  function tally(rows, pick) {
    // pick(row) → {칸, 긴급도} 또는 null(답을 못 받음 = 오답)
    var kan = 0, lv = 0, both = 0;
    rows.forEach(function (x) {
      var p = pick(x);
      var k = !!p && p["칸"] === x.a["칸"], l = !!p && p["긴급도"] === x.a["긴급도"];
      if (k) kan++;
      if (l) lv++;
      if (k && l) both++;
    });
    return { kan: kan, lv: lv, both: both, total: rows.length };
  }

  // 가장 나쁜 실수 둘 (CLAUDE.md): criteria.json 맨 앞 칸을 놓친 것 · 맨 앞 긴급도를 낮게 본 것
  function worst(rows, pick) {
    var topKan = criteria["칸"][0]["이름"], topLv = criteria["긴급도"][0]["이름"];
    var missedKan = 0, lowLv = 0;
    rows.forEach(function (x) {
      var p = pick(x);
      if (x.a["칸"] === topKan && !(p && p["칸"] === topKan)) missedKan++;
      if (x.a["긴급도"] === topLv && !(p && p["긴급도"] === topLv)) lowLv++;
    });
    return { topKan: topKan, topLv: topLv, missedKan: missedKan, lowLv: lowLv };
  }

  function summaryBox(t) {
    var sum = el("div", "summary");
    addRow(sum, "칸 정확도", pct(t.kan, t.total) + " (" + t.kan + "/" + t.total + ")");
    addRow(sum, "긴급도 정확도", pct(t.lv, t.total) + " (" + t.lv + "/" + t.total + ")");
    addRow(sum, "둘 다 맞은 수", t.both + "/" + t.total);
    return sum;
  }

  function wrongList(rows, pick, title) {
    var wrong = rows.filter(function (x) {
      var p = pick(x);
      return !(p && p["칸"] === x.a["칸"] && p["긴급도"] === x.a["긴급도"]);
    });
    var frag = document.createDocumentFragment();
    frag.appendChild(el("h2", null, title + " (" + wrong.length + ")"));
    var list = el("ul", "wrong");
    wrong.forEach(function (x) {
      var p = pick(x);
      var li = el("li");
      li.appendChild(el("div", "sentence", x.masked));
      var parts = [];
      if (!p) parts.push("답을 못 받음");
      else {
        if (x.a["칸"] !== p["칸"]) parts.push("칸: " + x.a["칸"] + " → " + p["칸"]);
        if (x.a["긴급도"] !== p["긴급도"]) parts.push("긴급도: " + x.a["긴급도"] + " → " + p["긴급도"]);
      }
      li.appendChild(el("div", "diff", "정답 → 판정   " + parts.join(" / ")));
      list.appendChild(li);
    });
    frag.appendChild(list);
    return frag;
  }

  // 규칙 채점
  function onGrade() {
    var out = $("grade-result");
    out.textContent = "";
    out.appendChild(el("p", "hint", "채점 중…"));
    setGradeButtons(true);
    loadJSON("data/answer.json").then(function (answers) {
      var rows = prepare(answers);
      var pick = function (x) { return x.rules; };
      out.textContent = "";
      out.appendChild(summaryBox(tally(rows, pick)));
      out.appendChild(el("p", "hint", "조건: 규칙만 · AI 없음 · 가린 문장으로 분류 · 정답 " + rows.length + "개 한 번 채점"));
      out.appendChild(wrongList(rows, pick, "틀린 문장"));
    }).catch(function (e) {
      out.textContent = "";
      showError("채점 실패: " + e.message);
    }).then(function () { setGradeButtons(false); });
  }

  // AI 채점: 10개씩 보낸다. 답을 못 받은 문장은 오답으로 센다.
  function onGradeAI() {
    var out = $("grade-result");
    out.textContent = "";
    var progress = el("p", "hint", "AI 채점 중… 0/0");
    out.appendChild(progress);
    setGradeButtons(true);

    loadJSON("data/answer.json").then(function (answers) {
      var rows = prepare(answers);
      var total = rows.length, done = 0, model = "", firstError = "";
      progress.textContent = "AI 채점 중… 0/" + total;

      var chain = Promise.resolve();
      for (var start = 0; start < total; start += BATCH) {
        (function (chunk) {
          chain = chain.then(function () {
            var items = chunk.map(function (x) { return { id: x.a.id, text: x.masked }; });
            return callAI(items).then(function (data) {
              model = data["모델"] || model;
              chunk.forEach(function (x) {
                var r = data.results.filter(function (q) { return q.id === x.a.id; })[0];
                if (r && !r["오류"]) x.ai = { "칸": r["칸"], "긴급도": r["긴급도"], "이유": r["이유"] };
                else {
                  x.aiError = (r && r["오류"]) || "답이 없음";
                  if (!firstError) firstError = x.aiError;
                }
              });
            }).catch(function (e) {
              chunk.forEach(function (x) { x.aiError = e.message; });
              if (!firstError) firstError = e.message;
            }).then(function () {
              done += chunk.length;
              progress.textContent = "AI 채점 중… " + done + "/" + total;
            });
          });
        })(rows.slice(start, start + BATCH));
      }
      return chain.then(function () { renderAIResult(out, rows, model, firstError); });
    }).catch(function (e) {
      out.textContent = "";
      showError("AI 채점 실패: " + e.message);
    }).then(function () { setGradeButtons(false); });
  }

  function renderAIResult(out, rows, model, firstError) {
    var pickRules = function (x) { return x.rules; };
    var pickAI = function (x) { return x.ai; };
    var tr = tally(rows, pickRules), ta = tally(rows, pickAI);
    var wr = worst(rows, pickRules), wa = worst(rows, pickAI);
    var noAnswer = rows.filter(function (x) { return !x.ai; }).length;

    out.textContent = "";

    // 규칙과 AI 나란히
    var table = el("table", "compare");
    var head = el("tr");
    ["", "칸", "긴급도", "둘 다"].forEach(function (h) { head.appendChild(el("th", null, h)); });
    table.appendChild(head);
    [["규칙", tr], ["AI", ta]].forEach(function (p) {
      var tr1 = el("tr");
      tr1.appendChild(el("th", null, p[0]));
      tr1.appendChild(el("td", null, p[1].kan + "/" + p[1].total));
      tr1.appendChild(el("td", null, p[1].lv + "/" + p[1].total));
      tr1.appendChild(el("td", null, p[1].both + "/" + p[1].total));
      table.appendChild(tr1);
    });
    out.appendChild(table);

    var note = el("div", "summary");
    addRow(note, "답 못 받음", noAnswer + "건 (오답으로 센 수)");
    addRow(note, wr.topKan + " 놓침", "규칙 " + wr.missedKan + " · AI " + wa.missedKan);
    addRow(note, wr.topLv + "을 낮게 봄", "규칙 " + wr.lowLv + " · AI " + wa.lowLv);
    out.appendChild(note);
    if (noAnswer > 0 && firstError) out.appendChild(el("p", "notice", "AI가 답하지 못한 까닭(첫 번째): " + firstError));
    out.appendChild(el("p", "hint", "조건: 가린 문장 · 정답 " + rows.length + "개 · " + BATCH + "개씩 보냄 · 모델 " + (model || "(답 없음)") + " · 한 번 잼"));

    var dl = el("button", "secondary", "AI 채점 결과 내려받기");
    dl.addEventListener("click", function () { download(rows, model, tr, ta, noAnswer); });
    out.appendChild(dl);

    out.appendChild(wrongList(rows, pickAI, "AI가 틀린 문장"));
  }

  function download(rows, model, tr, ta, noAnswer) {
    var data = {
      "조건": "가린 문장 · 정답 " + rows.length + "개 · " + BATCH + "개씩 보냄 · 한 번 잼",
      "모델": model,
      "잰 때": new Date().toISOString(),
      "요약": {
        "규칙": { "칸": tr.kan, "긴급도": tr.lv, "둘 다": tr.both, "전체": tr.total },
        "AI": { "칸": ta.kan, "긴급도": ta.lv, "둘 다": ta.both, "전체": ta.total, "답 못 받음": noAnswer }
      },
      "문장": rows.map(function (x) {
        return {
          "id": x.a.id,
          "가린 문장": x.masked,
          "정답": { "칸": x.a["칸"], "긴급도": x.a["긴급도"] },
          "규칙": { "칸": x.rules["칸"], "긴급도": x.rules["긴급도"] },
          "AI": x.ai ? { "칸": x.ai["칸"], "긴급도": x.ai["긴급도"], "이유": x.ai["이유"] } : { "오류": x.aiError || "답이 없음" }
        };
      })
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai_채점결과.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // ---- 시작 ----
  function init() {
    $("tab-classify").addEventListener("click", function () { selectTab("classify"); });
    $("tab-grade").addEventListener("click", function () { selectTab("grade"); });
    $("go").addEventListener("click", onClassify);
    $("grade-go").addEventListener("click", onGrade);
    $("grade-ai-go").addEventListener("click", onGradeAI);

    Promise.all([loadJSON("criteria.json"), loadJSON("keywords.json")]).then(function (v) {
      criteria = v[0];
      keywords = v[1];
      // «어떤 칸으로 나뉘나요?» — criteria.json 에서 칸 이름과 뜻을 읽어 채운다
      var guide = $("kan-guide");
      criteria["칸"].forEach(function (k) {
        var li = el("li");
        li.appendChild(el("b", null, k["이름"]));
        li.appendChild(document.createTextNode(" — " + k["뜻"]));
        guide.appendChild(li);
      });
      guide.parentNode.appendChild(el("p", "hint", "두 칸에 걸치면 위 순서에서 앞 칸으로 가릅니다."));
      $("go").disabled = false;
      setGradeButtons(false);
    }).catch(function (e) {
      showError("기준 파일을 읽지 못했습니다. 파일을 그냥 더블클릭해 열면 읽히지 않습니다. 웹 주소(서버)로 열어야 합니다. (" + e.message + ")");
    });
  }

  init();
})();
