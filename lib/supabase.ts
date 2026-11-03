// 개발 단위 13: 화면(서버 컴포넌트)에서 DB를 읽을 때 쓰는 클라이언트.
// 읽기 전용 키(anon)만 쓴다. 쓰기용 키(service_role)는 scripts/ 에서만 쓰며 여기서는 절대 쓰지 않는다.

import { createClient } from "@supabase/supabase-js";

export function getDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error(".env에 SUPABASE_URL 과 SUPABASE_ANON_KEY 가 필요합니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}
