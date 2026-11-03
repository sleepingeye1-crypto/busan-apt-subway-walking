// 개발 단위 7: 검색할 단지 목록과 검색 규칙.
// 단지 목록은 DB(complexes 표)에서 읽는다 (개발 단위 13). 동 좌표가 있는 단지는 dongs 표에 행이 있다.

import { cacheLife } from "next/cache";
import { getDb } from "@/lib/supabase";

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
  buildingCount: number | null; // 공공데이터상의 동 수 (모르면 null)
};

type ComplexRow = {
  name: string;
  gu: string | null;
  dong: string | null;
  address: string | null;
  building_count: number | null;
  dongs: { count: number }[];
};

// 단지 목록은 단지 이름 가나다순으로 둔다 (검색 결과도 이 순서를 따른다).
// 데이터는 스크립트가 가끔 바꾸므로 몇 시간 동안 결과를 재사용한다
async function loadComplexes(): Promise<Complex[]> {
  "use cache";
  cacheLife("hours");

  const { data, error } = await getDb().from("complexes").select("name, gu, dong, address, building_count, dongs(count)");
  if (error) throw new Error(`단지 목록을 읽지 못했습니다: ${error.message}`);

  return (data as unknown as ComplexRow[])
    .map((c) => ({
      id: c.name,
      name: c.name,
      gu: c.gu ?? "",
      dong: c.dong ?? "",
      area: c.gu && c.dong ? `부산 ${c.gu} ${c.dong}` : "위치 정보 없음",
      address: c.address ?? "",
      hasDongCoordinates: (c.dongs[0]?.count ?? 0) > 0,
      buildingCount: c.building_count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export async function listComplexes(): Promise<Complex[]> {
  return loadComplexes();
}

export async function getComplex(id: string): Promise<Complex | undefined> {
  return (await loadComplexes()).find((c) => c.id === id);
}

// 띄어쓰기와 대소문자를 무시하고 비교한다 ("대연 힐스테이트" = "대연힐스테이트")
const normalize = (text: string) => text.replace(/\s+/g, "").toLowerCase();

// 이름의 일부만 맞아도 결과에 넣는다 (예: "센텀" → 더샵센텀포레, 더샵센텀파크1차)
export async function searchComplexes(query: string): Promise<Complex[]> {
  const q = normalize(query);
  if (!q) return [];
  return (await loadComplexes()).filter((c) => normalize(c.name).includes(q));
}
