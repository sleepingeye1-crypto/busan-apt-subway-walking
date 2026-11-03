# subway-walking Design Document

> **Summary**: 미리 계산한 동별 도보 거리 데이터(JSON)를 Next.js 화면이 읽어 검색·상세·지도로 보여주는 정적 구조
>
> **Project**: my-app
> **Version**: 0.1.0
> **Author**: 허재혁
> **Date**: 2026-11-02
> **Status**: Draft (원본: [PRD.md](../../../PRD.md) 8~9번 항목에서 분리, 이미 구현된 코드를 기준으로 작성)
> **Planning Doc**: [subway-walking.plan.md](../../01-plan/features/subway-walking.plan.md)

### Pipeline References (if applicable)

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 | Schema Definition | N/A |
| Phase 2 | Coding Conventions ([CLAUDE.md](../../../CLAUDE.md)로 대신함) | N/A |
| Phase 3 | Mockup | N/A |
| Phase 4 | API Spec | N/A (자체 API 없음) |

---

## Context Anchor

> Copied from Plan document. Ensures strategic context survives Design→Do handoff.

| Key | Value |
|-----|-------|
| **WHY** | 정문 기준 거리만으로는 대단지에서 내 동의 지하철 접근성을 알 수 없다 |
| **WHO** | 부산 해운대·수영·남구 아파트의 매매·전세를 알아보는 사람 |
| **RISK** | OpenStreetMap에 단지 안 보행로가 없으면 도보 거리가 실제와 50m 넘게 달라질 수 있다 |
| **SUCCESS** | 단지의 모든 동마다 거리가 따로 나오고, 실제 도보 거리와 오차 50m 이내 |
| **SCOPE** | 1단계: 단지 3개(동 좌표 보유) → 2단계: 대상 지역 700세대 이상 전체(단지 대표 좌표 포함) |

---

## 1. Overview

### 1.1 Design Goals

- 화면은 **미리 계산한 데이터 파일만** 읽는다. 외부 API는 데이터 수집 스크립트에서만 부른다.
- PRD의 "AI가 지킬 규칙"(반올림, "불가능", 지어내지 않기)은 **한 곳(`lib/walking.ts`)**에 모아 모든 화면이 같은 규칙을 쓴다.
- 단지 목록이 늘어나도(3개 → 대상 지역 전체) 화면 코드는 바꾸지 않고 데이터만 더하면 되게 한다.

### 1.2 Design Principles

- **지어내지 않는다**: 좌표·거리는 카카오·OpenStreetMap이 준 값만 쓴다. 없으면 "불가능"이나 "동별 좌표 없음"으로 표시한다.
- **수집과 표시를 나눈다**: `scripts/`(네트워크, 느림) → `data/`(파일) → `lib/`·`app/`(빠름, 오프라인)
- **과하게 나누지 않는다**: Starter 수준의 폴더 구조를 유지한다.

---

## 2. Architecture Options (v1.7.0)

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | 지금 구조를 그대로 기록 | `types/`·`domain/`·`repositories/`로 계층 분리 | 지금 구조 + 공용 타입 파일 + npm 데이터 명령 |
| **New Files** | 0 | 약 5 | 1 |
| **Modified Files** | 0 | 약 6 | 4 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium | High | High |
| **Effort** | Low | High | Medium |
| **Risk** | Low (coupled) | Low (clean) | Low (balanced) |
| **Recommendation** | Quick wins, hotfixes | Long-term projects | **Default choice** |

**Selected**: Option C — **Rationale**: 이미 동작하는 구조를 유지하면서, 단지 목록 확장(FR-12) 때 데이터 타입이 여러 파일에 흩어지는 문제와 스크립트 실행 순서를 외워야 하는 문제만 정리한다.

> Option C에서 새로 할 일(§11.3의 `module-5`): `lib/types.ts`로 데이터 타입 모으기, `package.json`에 `data:*` 명령 추가.

### 2.1 Component Diagram

```
[데이터 수집 — 개발할 때 한 번 실행]
  공공데이터포털 ──┐
  카카오 장소 검색 ─┼─▶ scripts/*.mjs ──▶ data/*.json (Git에 커밋)
  OpenStreetMap ───┘

[화면 — 사용자가 볼 때]
  브라우저 ──▶ Next.js (app/) ──▶ lib/ ──▶ data/*.json
     │
     └──▶ 카카오맵 JS SDK (지도 그리기만)
```

### 2.2 Data Flow

```
collect-complexes ─▶ data/complexes.json ─┐ (승인 대기)
collect-exits ─────▶ data/subway-exits.json ─┼─▶ calc-walking ─▶ data/walking-distances.json
collect-dongs ─────▶ data/dong-coordinates.json ─┘                         │
                                                                           ▼
사용자 검색어(?q=) ─▶ lib/complexes.ts(검색) ─▶ 단지 선택 ─▶ lib/walking.ts(규칙 적용) ─▶ 화면
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `scripts/calc-walking.mjs` | `data/subway-exits.json`, `data/dong-coordinates.json`, (`data/complexes.json`) | 출발점·출구 목록 |
| `lib/complexes.ts` | `data/dong-coordinates.json`, (`data/complexes.json`) | 검색 대상 단지 |
| `lib/walking.ts` | `data/walking-distances.json` | 동별 거리와 규칙 |
| `app/complex/[id]/complex-map.tsx` | 카카오맵 JS SDK, `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` | 지도 표시 |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
// data/subway-exits.json — 역과 출구 (카카오 장소 검색)
interface Station {
  id: string;            // 카카오 장소 ID
  name: string;          // "해운대역 부산2호선"
  line: "부산2호선" | "부산3호선" | "동해선";
  lat: number; lng: number;
  exitCount: number;
  exits: Exit[];
  sharedFrom?: string;   // 환승역: 출구를 빌려온 역 이름
}
interface Exit { id: string; name: string; number: number | null; lat: number; lng: number }

// data/dong-coordinates.json — 동별 좌표 (카카오 "아파트 동")
interface ComplexWithDongs {
  name: string;          // "더샵센텀포레"
  kakaoName: string;     // "부산더샵센텀포레아파트"
  address: string;       // 도로명 주소
  jibunAddress: string;  // 지번 주소 (구·동 표시용)
  lat: number; lng: number;
  dongCount: number;
  dongs: {
    dong: string; lat: number; lng: number;
    kakaoId: string | null;  // 직접 찍은 동은 null
    source: string;          // "카카오" 또는 "OpenStreetMap 건물 ref=113" 등
  }[];
}
// 파일 전체: { generatedAt, source, complexes: ComplexWithDongs[] }
// 카카오에 동별로 없는 동은 scripts/collect-dongs.mjs의 MANUAL_DONGS에 직접 찍은 좌표로 둔다

// data/complexes.json — 대상 단지 목록 (공공데이터, 승인 대기)
interface ComplexSummary {
  kaptCode: string; name: string; gu: string; dong: string | null;
  households: number;    // 700 이상만 저장
  buildingCount: number;
  roadAddress: string | null; jibunAddress: string | null;
  lat: number | null; lng: number | null;   // 카카오 주소 검색
}

// data/walking-distances.json — 동별 도보 거리 (OpenStreetMap)
interface WalkingItem {
  complex: string; dong: string | null;
  basis: "dong" | "complex";               // 동 좌표 / 단지 대표 좌표
  lat: number | null; lng: number | null;
  status: "ok" | "failed" | "no-route" | "no-exit-nearby" | "no-coordinate";
  walkingMeters?: number;                  // 서버 값 그대로 (반올림 전)
  walkingSeconds?: number;                 // 서버가 준 보행 시간 (화면은 쓰지 않고 분당 기준으로 다시 계산)
  snapMeters?: { start: number; end: number };  // 길 위로 옮겨진 거리 (정확도 점검용)
  exit?: { station: string; line: string; name: string; number: number | null; lat: number; lng: number };
  kaptCode?: string;                       // 단지 대표 좌표로 계산한 단지만 (공공데이터 단지 코드)
  reason?: string;                         // status가 "failed"일 때 오류 내용
}
// 파일 전체: { generatedAt, source, exitDataDate, count, items: WalkingItem[] }
// 화면은 generatedAt(도보 거리 계산일)과 exitDataDate(출입구 데이터 기준일)를 하단에 표시한다
```

### 3.2 Entity Relationships

```
[Complex] 1 ──── N [Dong] ──── 1 [WalkingItem] ──── 1 [Exit] N ──── 1 [Station]
   (동 좌표가 없으면 Complex 1 ──── 1 [WalkingItem], basis = "complex")
```

### 3.3 Database Schema (if applicable)

데이터베이스를 쓰지 않는다. 모든 데이터는 `data/*.json` 파일로 Git에 함께 저장한다.

---

## 4. API Specification

이 앱은 **자체 API가 없다.** 화면은 서버 컴포넌트에서 JSON 파일을 직접 읽는다. 아래는 데이터 수집 스크립트가 부르는 외부 API다.

### 4.1 Endpoint List

| Method | URL | 호출 위치 | 용도 | 인증 |
|--------|-----|-----------|------|------|
| GET | `apis.data.go.kr/1613000/AptListService4/getSigunguAptList4` | collect-complexes | 구별 단지 코드 | `DATA_GO_KR_SERVICE_KEY` |
| GET | `apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5` | collect-complexes | 단지 이름·주소·세대수 | `DATA_GO_KR_SERVICE_KEY` |
| GET | `dapi.kakao.com/v2/local/search/address.json` | collect-complexes | 주소 → 좌표 | `KAKAO_REST_API_KEY` |
| GET | `dapi.kakao.com/v2/local/search/category.json` (SW8) | collect-exits | 지역 안 지하철역 | `KAKAO_REST_API_KEY` |
| GET | `dapi.kakao.com/v2/local/search/keyword.json` | collect-exits, collect-dongs | "OO역 N번출구", "OO아파트 101동" | `KAKAO_REST_API_KEY` |
| GET | `routing.openstreetmap.de/routed-foot/table/v1/foot/...` | calc-walking | 후보 출구까지 도보 거리 (1초에 1건) | 없음 (User-Agent 명시) |

### 4.2 Detailed Specification

#### `GET /routed-foot/table/v1/foot/{출발;후보1;…;후보5}?sources=0&destinations=1;…;5&annotations=distance,duration`

**Response (200):**
```json
{ "code": "Ok", "distances": [[518.9, 1831.2]], "durations": [[417, 1464.9]],
  "sources": [{ "distance": 14 }], "destinations": [{ "distance": 6 }, { "distance": 49 }] }
```

**Error Handling:** HTTP 오류나 `code !== "Ok"` → 해당 동 `status: "failed"` → 화면에서 "불가능"

---

## 5. UI/UX Design (if applicable)

### 5.1 Screen Layout

```
[검색 화면 /]                      [단지 화면 /complex/{단지 이름}]
┌──────────────────────────┐      ┌──────────────────────────┐
│ 우리 동에서 지하철까지      │      │ ← 검색으로 돌아가기        │
│ (대상 범위 안내)            │      │ 단지 이름 / 구·동 · 주소   │
│ [검색어      ] [검색]       │      │ (동별 좌표 없음 표시)       │
│ "OO" 검색 결과 N개          │      │ ┌──────── 지도 ────────┐ │
│ ┌──────────────────────┐ │      │ │ 동(빨강) 출구(파랑)    │ │
│ │ 단지 이름 / 부산 구 동  │ │      │ └──────────────────────┘ │
│ └──────────────────────┘ │      │ [동 순][거리 순]           │
│ (없으면 "불가능" + 범위)   │      │ 101동 / 출구     480m      │
└──────────────────────────┘      │              도보 8분      │
                                  │ … 기준일 · 출처 안내 …     │
                                  └──────────────────────────┘
```

### 5.2 User Flow

```
검색 화면 → 이름 검색(또는 빈칸 검색) → 단지 선택 → 지도·동별 도보 거리 확인 → (동 순 ↔ 거리 순)
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `Home`, `SearchSection`, `SearchForm` | `app/page.tsx` | 검색 화면 (서버 컴포넌트, 검색어는 Suspense 안에서 읽음) |
| `ComplexPage`, `ComplexDetail`, `DataNotice` | `app/complex/[id]/page.tsx` | 단지 화면, 빌드 때 단지별로 미리 생성 |
| `ComplexMap` | `app/complex/[id]/complex-map.tsx` | 카카오맵 표시 (클라이언트) |
| `DongList` | `app/complex/[id]/dong-list.tsx` | 동 목록과 정렬 버튼 (클라이언트) |
| `searchComplexes`, `listComplexes`, `getComplex` | `lib/complexes.ts` | 검색 규칙, 단지 목록 |
| `toWalkingResult`, `walkingTimeLabel`, `getDongDistances` | `lib/walking.ts` | 거리·시간 규칙 |

### 5.4 Page UI Checklist (v2.1.0)

#### 검색 화면 (`/`)

- [x] Heading: "우리 동에서 지하철까지"와 대상 범위 안내 문구
- [x] Input: 아파트 이름 검색창 (placeholder "아파트 이름 (예: 센텀)")
- [x] Button: 검색 (주소에 `?q=` 로 전달)
- [x] Text: "“{검색어}” 검색 결과 N개" / 빈칸 검색 시 "전체 단지 N개"
- [x] List: 단지 이름 + "부산 {구} {동}", 단지 이름 가나다순
- [x] Link: 결과를 누르면 단지 화면으로 이동
- [x] Empty: 결과가 없으면 "불가능" + "{대상 범위}만 조회할 수 있습니다."

#### 단지 화면 (`/complex/{id}`)

- [x] Link: "← 검색으로 돌아가기"
- [x] Heading: 단지 이름, "부산 {구} {동} · {도로명 주소}"
- [x] Badge: "동별 좌표 없음" (동 좌표 없는 단지만)
- [x] Map: 카카오맵, 동 번호(빨강) + 가장 가까운 출구 이름(파랑)
- [x] Sort: "동 순"(기본) / "거리 순" 버튼
- [x] List row: 동 이름, 출구 이름, 거리(10m 단위, m), "도보 N분 N초"
- [x] List row: "단지 대표 위치 기준" (단지 대표 좌표로 계산한 경우)
- [x] List row: "불가능" (회색, 거리·시간 없음)
- [x] Footer: 출입구 데이터 기준일 · 도보 거리 계산일
- [x] Footer: 출입구 정보가 다를 수 있다는 안내, 도보 시간 기준(분당 60m)
- [x] Footer: "© OpenStreetMap contributors" 링크 · "출구·동 위치: 카카오 장소 검색 (일부 동은 OpenStreetMap 건물 위치)"
- [x] Not found: 없는 단지 주소는 404

---

## 6. Error Handling

### 6.1 Error Code Definition

| 상황 | 화면 표시 | 처리 위치 |
|------|-----------|-----------|
| 대상 외 단지 검색 (다른 구, 700세대 미만, 없는 이름) | "불가능" + 대상 범위 안내 | `app/page.tsx` |
| 경로 서버 실패·사용량 초과 (`status: "failed"`) | "불가능" | `lib/walking.ts` |
| 경로 없음·근처 출구 없음·좌표 없음 | "불가능" | `lib/walking.ts` |
| 가장 가까운 입구까지 1.5km 초과 (반올림 전 값 기준) | "불가능" | `lib/walking.ts` |
| 동 좌표 없음 | "동별 좌표 없음" + "단지 대표 위치 기준" | `app/complex/[id]` |
| 계산 결과가 아예 없는 단지 | "불가능" | `app/complex/[id]/page.tsx` |
| 지도 SDK 로드 실패 (도메인 미등록 등) | "지도를 불러오지 못했습니다." | `complex-map.tsx` |
| 없는 단지 주소 | 404 페이지 | `notFound()` |

### 6.2 Error Response Format

자체 API가 없어 응답 형식은 없다. 모든 예외는 다른 값(직선거리 등)으로 대신하지 않고 위 표의 문구로만 보여준다.

---

## 7. Security Considerations

- [x] 검색어는 화면 표시와 문자열 비교에만 쓴다 (DB·명령 실행 없음, React가 자동으로 이스케이프)
- [x] 인증 없음 (로그인 기능 비범위)
- [x] API 키는 `.env`에만 저장, `.gitignore`의 `.env*`로 커밋 차단, `.env.example`에는 이름만
- [x] 브라우저에 노출되는 키는 카카오 JS 키 하나 — 카카오 콘솔의 JavaScript SDK 도메인(`http://localhost:3000`)으로 사용처 제한
- [ ] HTTPS: Vercel 배포 시 자동. 배포 주소를 카카오 SDK 도메인에 추가해야 함
- [x] 공개 서버 이용 조건: 1초에 1건, User-Agent 명시, 출처 표시

---

## 8. Test Plan (v2.3.0)

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L1: API Tests | 해당 없음 (자체 API 없음) | — | — |
| L2: UI Action Tests | 검색·정렬·지도 | 브라우저 직접 확인 (CLAUDE.md 검증 루프), 필요 시 Playwright | Do |
| L3: E2E Scenario Tests | 검색 → 단지 → 정렬 | 브라우저 직접 확인 | Do |
| Rule Tests | `lib/walking.ts` 경계값 | Node 스크립트로 직접 호출 | Do |

### 8.2 L1: API Test Scenarios

자체 API가 없어 해당 없음.

### 8.3 L2: UI Action Test Scenarios

| # | Page | Action | Expected Result | Data Verification |
|---|------|--------|----------------|-------------------|
| 1 | `/` | "센텀" 검색 | 결과 2개, 구·동 표시 | 더샵센텀파크1차, 더샵센텀포레 |
| 2 | `/` | "대연 힐스테이트" 검색 | 띄어쓰기 무시하고 1개 | 대연힐스테이트푸르지오 |
| 3 | `/` | 빈칸 검색 | "전체 단지 N개", 가나다순 | N = 데이터 단지 수 |
| 4 | `/` | "래미안" 검색 | "불가능" + 범위 안내 | — |
| 5 | `/complex/{id}` | "거리 순" 클릭 | 가까운 동부터 정렬 | 더샵센텀파크1차: 112동 460m 첫 줄 |
| 6 | `/complex/{id}` | 페이지 열기 | 지도에 동·출구 표시 | 카카오 SDK 200 응답 |

### 8.4 L3: E2E Scenario Test Scenarios

| # | Scenario | Steps | Success Criteria |
|---|----------|-------|-----------------|
| 1 | 동별 거리 확인 | `/` → 검색 → 결과 클릭 → 단지 화면 | 모든 동에 거리·시간 또는 "불가능" 표시 |
| 2 | 정렬 왕복 | 단지 화면 → 거리 순 → 동 순 | 원래 순서로 돌아옴 |
| 3 | 예외 | 없는 단지 주소 접속 | 404 |

### 8.5 Seed Data Requirements

| Entity | Minimum Count | Key Fields Required |
|--------|:------------:|---------------------|
| Station (출구 포함) | 41 역 / 215 출구 | lat, lng, line |
| ComplexWithDongs | 3 | dongs[].lat/lng, jibunAddress |
| WalkingItem | 40 | status, walkingMeters, exit |

---

## 9. Clean Architecture

### 9.1 Layer Structure

| Layer | Responsibility | Location |
|-------|---------------|----------|
| **Presentation** | 화면, 클라이언트 컴포넌트 | `app/` |
| **Application** | 검색·거리 규칙, 데이터 조회 함수 | `lib/complexes.ts`, `lib/walking.ts` |
| **Domain** | 데이터 타입 (Option C에서 모음) | `lib/types.ts` (예정) |
| **Infrastructure** | 외부 API 호출과 데이터 파일 생성 | `scripts/`, `data/` |

### 9.2 Dependency Rules

```
app/ ──▶ lib/ ──▶ data/*.json ◀── scripts/
화면(app/)은 외부 API를 직접 부르지 않는다 (예외: 카카오맵 SDK로 지도 그리기)
```

### 9.3 File Import Rules

| From | Can Import | Cannot Import |
|------|-----------|---------------|
| `app/` | `lib/` | `scripts/`, `data/` 직접 |
| `lib/` | `data/*.json`, `lib/types.ts` | `app/` |
| `scripts/` | Node 내장, `data/*.json` | `app/`, `lib/` |

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| 검색·단지 화면, 지도, 동 목록 | Presentation | `app/` |
| 검색 규칙, 거리·시간 규칙 | Application | `lib/` |
| Station, WalkingItem 등 타입 | Domain | `lib/types.ts` (예정) |
| 수집·계산 스크립트 | Infrastructure | `scripts/` |

---

## 10. Coding Convention Reference

### 10.1 Naming Conventions

| Target | Rule | Example |
|--------|------|---------|
| Components | PascalCase | `ComplexMap`, `DongList` |
| Functions | camelCase | `toWalkingResult()`, `searchComplexes()` |
| Constants | UPPER_SNAKE_CASE | `MAX_WALKING_METERS`, `WALKING_METERS_PER_MINUTE` |
| Types | PascalCase | `WalkingItem`, `DongDistance` |
| Files | kebab-case (create-next-app 기본에 맞춤) | `complex-map.tsx`, `calc-walking.mjs` |
| Folders | kebab-case / Next.js 규칙 | `complex/[id]/` |

### 10.2 Import Order

```typescript
// 1. 외부 라이브러리 (next, react)
// 2. @/ 경로 (lib)
// 3. 상대 경로 (./complex-map)
```

### 10.3 Environment Variables

| Variable | Scope | Used In |
|----------|-------|---------|
| `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` | Browser | `complex-map.tsx` |
| `KAKAO_REST_API_KEY` | Server (scripts) | `collect-*.mjs` |
| `DATA_GO_KR_SERVICE_KEY` | Server (scripts) | `collect-complexes.mjs` |

### 10.4 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| Comment language | 한국어 (CLAUDE.md) |
| File organization | 화면 전용 컴포넌트는 해당 경로 폴더 안에 둔다 |
| State management | `useState` (정렬 버튼) |
| Error handling | 예외는 모두 "불가능", 다른 값으로 대신하지 않음 |

---

## 11. Implementation Guide

### 11.1 File Structure

```
app/
├── page.tsx                      검색 화면
├── layout.tsx
└── complex/[id]/
    ├── page.tsx                  단지 화면
    ├── complex-map.tsx           지도
    └── dong-list.tsx             동 목록 + 정렬
lib/
├── complexes.ts                  검색 규칙, 단지 목록
├── walking.ts                    거리·시간 규칙
└── types.ts                      (예정) 데이터 타입
scripts/
├── collect-complexes.mjs         단지 목록 (공공데이터)
├── collect-exits.mjs             지하철 출구 (카카오)
├── collect-dongs.mjs             동 좌표 (카카오)
└── calc-walking.mjs              도보 거리 (OpenStreetMap)
data/
├── complexes.json                (승인 대기)
├── subway-exits.json
├── dong-coordinates.json
└── walking-distances.json
```

### 11.2 Implementation Order

PRD 9번 "개발 단위"와 같은 순서다.

1. [x] API 키 발급, `.env` 등록 (단위 1)
2. [ ] 단지 목록 수집 (단위 2) — 스크립트 완성, 공공데이터 승인 대기
3. [x] 지하철 출구 좌표 수집 (단위 3)
4. [x] 동 좌표 수집 (단위 4)
5. [x] 도보 거리 계산 (단위 5)
6. [x] 거리 규칙 적용 (단위 6)
7. [x] 검색 화면 (단위 7)
8. [x] 대상 외 단지 "불가능" (단위 8)
9. [x] 단지 화면 (단위 9)
10. [x] 기준일·출처·좌표 없음 표시 (단위 10)
11. [ ] 오차 50m 점검 (단위 11) — 실제 도보 거리 기준값 필요
12. [x] 지도 화면 (단위 12)
13. [x] 추가: 빈칸 검색 전체 목록, 동 순·거리 순 정렬, 도보 시간

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Status |
|--------|-----------|-------------|:------:|
| 데이터 수집 | `module-1` | 출구·동 좌표 수집, 도보 거리 계산 스크립트 | Done |
| 규칙 | `module-2` | `lib/walking.ts`, `lib/complexes.ts` | Done |
| 검색 화면 | `module-3` | `app/page.tsx` | Done |
| 단지 화면 | `module-4` | `app/complex/[id]/` (지도, 정렬, 도보 시간) | Done |
| 구조 정리 (Option C) | `module-5` | `lib/types.ts`로 타입 모으기, `npm run data:*` 명령 추가 | Pending |
| 단지 목록 확장 | `module-6` | `data/complexes.json` 연결, 단지 대표 좌표 거리 계산, 3개 단지 중복 제거 | Pending (승인 대기) |
| 정확도 점검 | `module-7` | 실제 도보 거리 6개와 비교, 오차 50m 판정 | Pending (기준값 필요) |

#### Recommended Session Plan

| Session | Phase | Scope | Note |
|---------|-------|-------|------|
| Session 1 | Plan + Design | 전체 | 이 문서 (완료) |
| Session 2 | Do | `--scope module-5,module-6` | 단지 목록 승인 후 |
| Session 3 | Do | `--scope module-7` | 실제 거리 6개 받은 후 |
| Session 4 | Check + Report | 전체 | `/pdca analyze subway-walking` → `/pdca report subway-walking` |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-11-02 | PRD.md 8~9번 항목과 구현된 코드를 바탕으로 초안 작성, Option C 선택 | 허재혁 |
