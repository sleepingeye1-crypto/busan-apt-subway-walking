# subway-walking Planning Document

> **Summary**: 부산 해운대·수영·남구 대단지 아파트의 **동마다** 가장 가까운 지하철 입구까지 실제 도보 거리·시간을 보여주는 웹 앱
>
> **Project**: my-app
> **Version**: 0.1.0
> **Author**: 허재혁
> **Date**: 2026-11-02
> **Status**: Draft (원본: [PRD.md](../../../PRD.md) 1~7번 항목에서 분리)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 대단지는 동마다 지하철 입구까지 거리가 크게 다른데, 기존 부동산 서비스는 정문 기준 거리 하나만 보여줘 내가 살 동의 실제 거리를 알 수 없다. |
| **Solution** | 동 좌표와 지하철 출구 좌표를 모으고, 실제 보행 경로로 동마다 가장 가까운 출구까지의 도보 거리를 미리 계산해 보여준다. |
| **Function/UX Effect** | 아파트 이름을 검색해 단지를 고르면, 지도와 함께 동별 도보 거리·시간을 동 순 또는 거리 순으로 비교할 수 있다. |
| **Core Value** | "정문에서 몇 분"이 아니라 "**우리 동에서** 몇 분"을 알려줘 매매·전세 결정을 돕는다. |

---

## Context Anchor

> Auto-generated from Executive Summary. Propagated to Design/Do documents for context continuity.

| Key | Value |
|-----|-------|
| **WHY** | 정문 기준 거리만으로는 대단지에서 내 동의 지하철 접근성을 알 수 없다 |
| **WHO** | 부산 해운대·수영·남구 아파트의 매매·전세를 알아보는 사람 |
| **RISK** | OpenStreetMap에 단지 안 보행로가 없으면 도보 거리가 실제와 50m 넘게 달라질 수 있다 |
| **SUCCESS** | 단지의 모든 동마다 거리가 따로 나오고, 실제 도보 거리와 오차 50m 이내 |
| **SCOPE** | 1단계: 단지 3개(동 좌표 보유) → 2단계: 대상 지역 700세대 이상 전체(단지 대표 좌표 포함) |

---

## 1. Overview

### 1.1 Purpose

아파트를 알아보는 사람이 **동 단위로** 지하철 접근성을 비교할 수 있게 한다. 이번 범위에서는 주변 편의사항 중 **지하철 접근성**에 집중한다.

### 1.2 Background

- **현행 방식**: 기존 부동산 정보 서비스는 아파트 **정문**을 기준으로 지하철역까지의 거리만 보여준다.
- **한계**: 대단지는 동마다 위치 차이가 커서, 정문 기준 거리만으로는 실제로 내가 살 동에서 지하철 **입구**까지 얼마나 걸리는지 알 수 없다.
- 예: 대연힐스테이트푸르지오는 같은 단지 안에서도 가장 가까운 동(280m)과 먼 동(1,070m)의 차이가 약 800m다.

### 1.3 Related Documents

- Requirements: [PRD.md](../../../PRD.md) (원본 기획서)
- Design: [subway-walking.design.md](../../02-design/features/subway-walking.design.md)
- 프로젝트 규칙: [CLAUDE.md](../../../CLAUDE.md)

---

## 2. Scope

### 2.1 In Scope

- [x] 아파트 검색 (이름 일부·띄어쓰기 무시, 빈칸 검색 시 전체 목록)
- [x] 동별 가장 가까운 지하철 입구 도보 거리·시간 표시
- [x] 대상 노선: 부산 지하철 **2·3호선**과 **동해선**
- [x] 동 좌표: 단지 3개(더샵센텀포레, 대연힐스테이트푸르지오, 더샵센텀파크1차)는 카카오 "아파트 동" 좌표 사용
- [x] 목록 화면 + 지도 화면
- [ ] 대상 지역: 부산 **해운대구·수영구·남구**의 **700세대 이상** 아파트 전체 (공공데이터 단지 목록 승인 대기)
- [ ] 동 좌표가 없는 단지는 단지 대표 좌표로 계산

### 2.2 Out of Scope

- 회원가입·로그인
- 시세·매물 가격 정보
- 대상 지역 밖(다른 구·전국)과 700세대 미만 단지
- 모바일 앱 (웹으로만 만듦)
- 결제 기능

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 아파트 이름의 일부만 맞아도 검색 결과에 보여준다. 존재하지 않는 단지를 지어내지 않는다 | High | Done |
| FR-02 | 검색 결과에 단지 이름과 **구·동**을 함께 표시해 이름이 같은 단지를 구분한다 | High | Done |
| FR-03 | 선택한 단지의 동마다 가장 가까운 지하철 입구 **1개**까지의 **실제 도보 경로 거리**를 보여준다 (직선거리 금지, 추측 금지) | High | Done |
| FR-04 | 거리는 **미터(m), 10m 단위 반올림**으로 표시한다 | High | Done |
| FR-05 | 동별 좌표가 없으면 "동별 좌표 없음"과 "단지 대표 위치 기준"을 표시하고 단지 대표 좌표로 계산한다. 동 좌표를 지어내지 않는다 | High | Done (화면) / Pending (데이터) |
| FR-06 | 예외 상황은 모두 **"불가능"**을 돌려준다: 대상 외 단지 검색, 경로 서버 실패·사용량 초과, 가장 가까운 입구까지 1.5km 초과 | High | Done |
| FR-07 | 화면에 데이터 기준일과 "© OpenStreetMap contributors" 출처를 표시한다 | High | Done |
| FR-08 | 동별 도보 시간을 **분당 60m** 기준으로, 올림·반올림 없이 분·초로 표시한다 | Medium | Done |
| FR-09 | 동 목록을 **동 순**(기본)과 **거리 순**으로 정렬할 수 있다 | Medium | Done |
| FR-10 | 빈칸으로 검색하면 전체 단지 목록을 단지 이름 가나다순으로 보여준다 | Medium | Done |
| FR-11 | 지도에 동과 가장 가까운 지하철 출구를 표시한다 | Low | Done |
| FR-12 | 대상 지역 700세대 이상 단지 전체를 검색 대상에 넣는다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Accuracy | 표시 도보 거리와 실제 도보 거리의 오차 50m 이내 | 지도 앱 도보 길찾기 결과와 6개 동 비교 (개발 단위 11) |
| Performance | 화면은 미리 계산한 데이터 파일만 읽는다. 단지 화면은 빌드 때 미리 만든다 | `npm run build` 결과의 정적(○)·부분 정적(◐) 표시 |
| Fair use | OpenStreetMap 공개 서버에 1초에 1건 정도로만 요청한다 | 계산 스크립트의 요청 간격(1,100ms) |
| Security | API 키는 `.env`에만 두고 커밋하지 않는다. 브라우저용 키는 카카오 JS 키 하나뿐이다 | `git check-ignore`, 커밋 전 staged 파일 확인 |
| Privacy | 개인정보를 다루지 않는다 (로그인·사용자 저장 없음) | 기능 목록 검토 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [x] 한 단지의 **모든 동**마다 지하철 입구까지 도보 거리가 **각각 따로** 나온다 (동 좌표 없는 단지는 "동별 좌표 없음" + 단지 대표 위치 기준 거리면 충족)
- [ ] 표시된 도보 거리가 실제 도보 거리와 오차 **50m 이내**다
- [ ] 대상 지역 700세대 이상 단지 전체를 검색할 수 있다
- [x] 규칙 위반 없음: 지어낸 단지·좌표·거리 없음, 예외는 "불가능"

### 4.2 Quality Criteria

- [x] Zero lint errors (`npm run lint`)
- [x] Build succeeds (`npm run build`)
- [x] 화면이 바뀐 작업은 브라우저에서 직접 확인 (CLAUDE.md 검증 루프)
- [ ] 자동 테스트 없음: 이번 실습 범위에서는 검증 루프로 대신한다

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OpenStreetMap에 단지 안 보행로가 없어 좌표가 바깥 도로로 옮겨져 계산됨 (더샵센텀파크1차는 최대 97m) | High | High | 옮겨진 거리(snap)를 결과 파일에 저장하고, 오차 점검(개발 단위 11)에서 해당 단지를 반드시 비교 |
| 공공데이터 단지 목록 서비스 승인 지연 | High | Medium | 수집 스크립트를 미리 만들고 10분마다 자동 재시도. 그동안 단지 3개로 기능 완성 |
| 카카오 장소 검색에 출구·동이 빠짐 (예: 연산역 3호선 출구, 대연힐스테이트푸르지오 113·114동) | Medium | Medium | 환승역은 같은 이름 역의 출구 공유. 빠진 동은 지도에서 직접 찍음 |
| 공개 서버 사용 조건 위반 | Medium | Low | 1초에 1건, User-Agent 명시, 결과를 미리 계산해 저장 |
| 출구 공사·폐쇄 등 실제와 다른 데이터 | Low | Medium | 화면에 데이터 기준일과 안내 문구 표시 |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `data/*.json` | Data file | 단지·출구·동 좌표·도보 거리 데이터 추가 (새로 만듦) |
| `app/page.tsx` | Page | Next.js 기본 첫 화면을 검색 화면으로 교체 |
| `app/layout.tsx` | Layout | 제목·언어(ko) 변경 |
| `.gitignore` | Config | `.env.example`, `trash-can/`, `.bkit/` 규칙 추가 |

### 6.2 Current Consumers

새 프로젝트라 기존 사용처가 없다. 데이터 파일은 아래 코드에서만 읽는다.

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `data/dong-coordinates.json` | READ | `lib/complexes.ts`, `scripts/calc-walking.mjs` | None |
| `data/walking-distances.json` | READ | `lib/walking.ts` | None |
| `data/subway-exits.json` | READ | `scripts/calc-walking.mjs` | None |
| `data/complexes.json` (예정) | READ | `scripts/calc-walking.mjs`, `lib/complexes.ts` (연결 예정) | Needs verification |

### 6.3 Verification

- [x] 모든 사용처가 바뀐 데이터와 함께 동작함 (lint·build·브라우저 확인)
- [x] 인증·권한 변경 없음
- [ ] `data/complexes.json` 연결 시 기존 3개 단지가 중복되지 않는지 확인

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure (`components/`, `lib/`, `types/`) | Static sites, portfolios, landing pages | ☑ |
| **Dynamic** | Feature-based modules, BaaS integration (bkend.ai) | Web apps with backend, SaaS MVPs, fullstack apps | ☐ |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic systems, complex architectures | ☐ |

백엔드·DB·로그인이 없고 미리 계산한 데이터 파일을 읽어 보여주는 구조라 Starter 구조로 충분하다.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Framework | Next.js / React / Vue | Next.js 16 (App Router) | 과정에서 고정 |
| State Management | Context / Zustand / Redux / Jotai | React `useState` | 상태는 정렬 버튼 하나뿐 |
| API Client | fetch / axios / react-query | 없음 (화면은 데이터 파일만 읽음) | 외부 API는 데이터 수집 스크립트에서만 호출 |
| Form Handling | react-hook-form / formik / native | `next/form` | 검색어를 주소(`?q=`)로 넘기는 GET 폼 하나 |
| Styling | Tailwind / CSS Modules / styled-components | Tailwind CSS | create-next-app 기본값 |
| Testing | Jest / Vitest / Playwright | 없음 (검증 루프) | 실습 범위. 필요하면 Playwright 추가 |
| Backend | BaaS (bkend.ai) / Custom Server / Serverless | 없음 | 정적 데이터 + Vercel 배포 |

### 7.3 Clean Architecture Approach

```
Selected Level: Starter

Folder Structure:
  app/            화면 (검색, 단지 상세)
  lib/            규칙과 데이터 읽기 (검색 규칙, 거리 규칙)
  data/           스크립트가 만든 데이터 파일 (JSON)
  scripts/        데이터 수집·계산 스크립트 (Node)
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [ ] `docs/01-plan/conventions.md` exists (Phase 2 output)
- [ ] `CONVENTIONS.md` exists at project root
- [x] ESLint configuration (`eslint.config.mjs`)
- [ ] Prettier configuration (`.prettierrc`)
- [x] TypeScript configuration (`tsconfig.json`)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | exists (CLAUDE.md) | 한국어 주석·설명, 파일명은 kebab-case | High |
| **Folder structure** | exists (CLAUDE.md) | `app/`, `lib/`, `data/`, `scripts/` | High |
| **Import order** | missing | `@/` 경로 사용만 정함 | Medium |
| **Environment variables** | exists (`.env.example`) | 아래 8.3 | Medium |
| **Error handling** | exists (CLAUDE.md 데이터 규칙) | 예외는 모두 "불가능" | Medium |

### 8.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `NEXT_PUBLIC_KAKAO_MAP_JS_KEY` | 카카오맵 지도 표시 | Client | ☑ |
| `KAKAO_REST_API_KEY` | 카카오 장소·주소 검색 (스크립트) | Server | ☑ |
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터 단지 목록·기본 정보 (스크립트) | Server | ☑ |

### 8.4 Pipeline Integration

9단계 개발 파이프라인은 사용하지 않았다. 개발 순서는 Design 문서의 개발 단위를 따른다.

---

## 9. Next Steps

1. [x] Write design document (`subway-walking.design.md`)
2. [ ] 단지 목록 승인 후 FR-12 구현 (단지 대표 좌표 거리 계산 포함)
3. [ ] 실제 도보 거리 6개로 오차 50m 점검 (개발 단위 11)
4. [ ] `/pdca analyze subway-walking`으로 Gap 분석

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-11-02 | PRD.md 1~7번 항목에서 분리해 초안 작성 | 허재혁 |
