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
  area: string; // 화면 표시용 "부산 수영구 민락동" (주소가 없으면 "위치 정보 없음")
  address: string;
  hasDongCoordinates: boolean;
};

// 지번 주소 "부산 수영구 민락동 765" → { gu: "수영구", dong: "민락동", area: "부산 수영구 민락동" }
// 주소가 비어 있으면 빈 칸("부산  ")을 보여주지 않도록 "위치 정보 없음"으로 둔다
function guDongOf(jibunAddress: string): { gu: string; dong: string; area: string } {
  const [, gu = "", dong = ""] = jibunAddress.split(/\s+/);
  return { gu, dong, area: gu && dong ? `부산 ${gu} ${dong}` : "위치 정보 없음" };
}

// 단지 목록은 단지 이름 가나다순으로 둔다 (검색 결과도 이 순서를 따른다)
const COMPLEXES: Complex[] = dongData.complexes
  .map((c) => ({
    id: c.name,
    name: c.name,
    ...guDongOf(c.jibunAddress ?? ""),
    address: c.address ?? "",
    hasDongCoordinates: c.dongs.length > 0,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));

export function listComplexes(): Complex[] {
  return COMPLEXES;
}

export function getComplex(id: string): Complex | undefined {
  return COMPLEXES.find((c) => c.id === id);
}

// 띄어쓰기와 대소문자를 무시하고 비교한다 ("대연 힐스테이트" = "대연힐스테이트")
const normalize = (text: string) => text.replace(/\s+/g, "").toLowerCase();

// 이름의 일부만 맞아도 결과에 넣는다 (예: "센텀" → 더샵센텀포레, 더샵센텀파크1차)
export function searchComplexes(query: string): Complex[] {
  const q = normalize(query);
  if (!q) return [];
  return COMPLEXES.filter((c) => normalize(c.name).includes(q));
}
