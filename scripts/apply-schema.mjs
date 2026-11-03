// 개발 단위 13: supabase/schema.sql 을 Supabase에 적용해 표를 만든다.
//
// 실행: node scripts/apply-schema.mjs
// .env 의 SUPABASE_ACCESS_TOKEN(관리용)과 SUPABASE_URL(프로젝트 주소)을 쓴다.

import { readFile } from "node:fs/promises";

process.loadEnvFile(".env");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
if (!token || !ref) {
  console.error(".env에 SUPABASE_ACCESS_TOKEN 과 SUPABASE_URL 이 필요합니다.");
  process.exitCode = 1;
} else {
  const query = await readFile("supabase/schema.sql", "utf8");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`표 만들기 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
    process.exitCode = 1;
  } else {
    console.log("표 5개를 만들었습니다: complexes, dongs, subway_exits, walking_distances, data_meta");
  }
}
