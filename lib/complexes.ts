// 개발 단위 7: 검색할 단지 목록과 검색 규칙.
// 지금은 동 좌표가 있는 단지 3개(data/dong-coordinates.json)만 검색한다.
// 단지 목록(data/complexes.json, 개발 단위 2)이 생기면 여기에 합친다.

import dongData from "@/data/dong-coordinates.json";

// 이 서비스가 다루는 단지 범위 (PRD 6번)
export const SERVICE_SCOPE = "부산 해운대구·수영구·남구의 700세대 이상 아파트";

export type Complex = {
  id: string;
  name: string;
  gu: string;
  dong: string;
  address: string;
  hasDongCoordinates: boolean;
};

// 지번 주소 "부산 수영구 민락동 765" → { gu: "수영구", dong: "민락동" }
function guDongOf(jibunAddress: string): { gu: string; dong: string } {
  const [, gu = "", dong = ""] = jibunAddress.split(/\s+/);
  return { gu, dong };
}

const COMPLEXES: Complex[] = dongData.complexes.map((c) => ({
  id: c.name,
  name: c.name,
  ...guDongOf(c.jibunAddress ?? ""),
  address: c.address ?? "",
  hasDongCoordinates: c.dongs.length > 0,
}));

// 띄어쓰기와 대소문자를 무시하고 비교한다 ("대연 힐스테이트" = "대연힐스테이트")
const normalize = (text: string) => text.replace(/\s+/g, "").toLowerCase();

// 이름의 일부만 맞아도 결과에 넣는다 (예: "센텀" → 더샵센텀포레, 더샵센텀파크1차)
export function searchComplexes(query: string): Complex[] {
  const q = normalize(query);
  if (!q) return [];
  return COMPLEXES.filter((c) => normalize(c.name).includes(q));
}
