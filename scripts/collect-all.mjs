// 남은 데이터를 한 번에 모은다: 단지 목록 수집 → 전체 단지 동 좌표 수집 → 동(또는 단지)별 도보 거리 계산.
// 각 단계는 끝날 때 JSON 백업과 DB 저장을 함께 한다.
//
// 실행: node scripts/collect-all.mjs
// 앞 단계가 실패하면 뒤 단계는 하지 않는다 (불완전한 단지 목록으로 거리를 계산하지 않기 위함).
// 공공데이터포털이 불안정해 실패하면, 다시 실행하면 받아 둔 결과(.cache/)부터 이어서 받는다.

import { spawnSync } from "node:child_process";

const STEPS = [
  ["단지 목록 수집", "scripts/collect-complexes.mjs"],
  ["동 좌표 수집", "scripts/collect-dongs.mjs"],
  ["도보 거리 계산", "scripts/calc-walking.mjs"],
];

for (const [label, file] of STEPS) {
  console.log(`\n=== ${label} ===`);
  const { status } = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (status !== 0) {
    console.error(`\n${label} 단계가 실패해 멈춥니다.`);
    process.exitCode = 1;
    break;
  }
}
