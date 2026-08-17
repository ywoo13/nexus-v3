import { timingSafeEqual } from "crypto";

// 문자열을 그냥 ===로 비교하면 앞에서부터 몇 글자가 일치하는지에 따라 비교 시간이
// 미세하게 달라져서, 이 시간차를 반복 측정해 비밀번호를 한 글자씩 추측하는
// 타이밍 공격(timing attack)이 이론상 가능합니다. crypto.timingSafeEqual은 항상
// 같은 시간이 걸리도록 비교해서 이 문제를 막습니다. (길이가 다르면 그 자체로 바로
// 틀린 것이 확실하므로, 길이 비교는 먼저 해도 안전합니다 — 길이는 비밀번호 내용을
// 드러내지 않습니다.)
function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// /manager, /monitor 같은 개발자 전용 페이지를 비밀번호로 보호하는 미들웨어입니다.
// MANAGER_PASSWORD가 설정되어 있지 않으면 실수로 열어두지 않도록 아예 접근을 막습니다.
export function requireBasicAuth(req, res, next) {
  const username = process.env.MANAGER_USER || "admin";
  const password = process.env.MANAGER_PASSWORD;

  if (!password) {
    res
      .status(503)
      .send("서버에 MANAGER_PASSWORD 환경변수가 설정되어 있지 않아 이 페이지를 열 수 없습니다.");
    return;
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    // 콜론이 아예 없는 잘못된 형식의 헤더도 안전하게 "인증 실패"로 처리합니다
    // (예전엔 indexOf가 -1을 반환할 때 slice 계산이 의도치 않은 값을 만들었습니다).
    if (separatorIndex !== -1) {
      const user = decoded.slice(0, separatorIndex);
      const pass = decoded.slice(separatorIndex + 1);
      if (timingSafeStringEqual(user, username) && timingSafeStringEqual(pass, password)) {
        next();
        return;
      }
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="Nexus Admin"');
  res.status(401).send("인증이 필요합니다.");
}
