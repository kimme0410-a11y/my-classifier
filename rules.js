// 규칙으로만 가른다 (AI 없음). 칸의 이름 · 순서는 criteria.json, 낱말은 keywords.json 에서 읽는다.
(function () {
  function squash(s) { return String(s).replace(/\s+/g, ""); }

  function hits(textSq, words) {
    var found = [];
    for (var i = 0; i < words.length; i++) {
      if (textSq.indexOf(squash(words[i])) !== -1) found.push(words[i]);
    }
    return found;
  }

  function quote(list) {
    return list.slice(0, 3).map(function (w) { return "‘" + w + "’"; }).join("·");
  }

  // criteria: criteria.json 내용, kw: keywords.json 내용
  function classify(maskedText, criteria, kw) {
    var t = squash(maskedText);

    // 칸: criteria.json 의 순서에서 낱말이 하나라도 걸린 첫 칸 (두 칸에 걸치면 앞 칸)
    var kan = null, kanWords = [];
    for (var i = 0; i < criteria["칸"].length; i++) {
      var name = criteria["칸"][i]["이름"];
      var h = hits(t, (kw["칸"][name] || { "낱말": [] })["낱말"]);
      if (h.length > 0) { kan = name; kanWords = h; break; }
    }
    var kanReason;
    if (kan === null) {
      kan = criteria["칸"][criteria["칸"].length - 1]["이름"]; // 맨 끝 칸(기타)
      kanReason = "맞는 낱말이 없어 " + kan;
    } else {
      kanReason = quote(kanWords) + " → " + kan;
    }

    // 긴급도: 높음 낱말이 있으면 높음. 아니면 낮음 낱말이 보통 낱말보다 많을 때만 낮음. 그 밖에는 보통.
    var levels = criteria["긴급도"].map(function (x) { return x["이름"]; });
    var HIGH = levels[0], MID = levels[1], LOW = levels[2];
    var hHigh = hits(t, kw["긴급도"][HIGH]["낱말"]);
    var hMid = hits(t, kw["긴급도"][MID]["낱말"]);
    var hLow = hits(t, kw["긴급도"][LOW]["낱말"]);
    var level, levelReason;
    if (hHigh.length > 0) { level = HIGH; levelReason = quote(hHigh) + " → " + HIGH; }
    else if (hLow.length > hMid.length) { level = LOW; levelReason = quote(hLow) + " → " + LOW; }
    else if (hMid.length > 0) { level = MID; levelReason = quote(hMid) + " → " + MID; }
    else { level = MID; levelReason = "맞는 낱말이 없어 " + MID; }

    return {
      "칸": kan,
      "긴급도": level,
      "이유": "칸: " + kanReason + " / 긴급도: " + levelReason
    };
  }

  window.classifyByRules = classify;
})();
