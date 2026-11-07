// 이름 · 전화번호 · 사번을 [이름] [전화번호] [사번] 으로 바꾼다.
// 분류는 가린 문장으로 한다. 이 파일은 브라우저에서만 돈다.
(function () {
  var SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부";
  // 이름처럼 보이지만 이름이 아닌 말
  var NOT_NAME = ["전화", "고객", "원본", "사본", "본인", "문의", "신청", "민원", "신고"];

  var PHONE = /(?:\+82[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
  var SABUN = /(사번\s*[:：]?\s*)([A-Za-z]{0,3}-?\d{3,})/g;
  // 성 + 이름 한두 글자 + (고객) + 입니다/이에요/예요
  var NAME = new RegExp("([" + SURNAMES + "][가-힣]{1,2})(\\s?고객)?(?=\\s?(?:입니다|이에요|예요))", "g");

  function maskText(text) {
    var s = String(text);
    s = s.replace(PHONE, "[전화번호]");
    s = s.replace(SABUN, "$1[사번]");
    s = s.replace(NAME, function (m, name, gogaek) {
      if (NOT_NAME.indexOf(name) !== -1) return m;
      return "[이름]" + (gogaek || "");
    });
    return s;
  }

  window.maskText = maskText;
})();
