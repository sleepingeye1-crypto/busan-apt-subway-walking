-- 개발 단위 13: 수집한 데이터를 담는 표(테이블) 설계.
-- 적용: node scripts/apply-schema.mjs  (여러 번 실행해도 안전하다)
--
-- 읽기는 누구나(anon 키), 쓰기는 서버 전용 키(service_role)만 가능하다.

-- 단지 목록 (700세대 이상, 해운대·수영·남구)
create table if not exists complexes (
  name          text primary key,        -- 화면에서 단지를 가리키는 이름 (주소창 id로도 쓴다)
  kapt_code     text,                    -- 공공데이터 단지 코드
  gu            text,
  dong          text,
  households    integer,
  address       text,                    -- 도로명 주소
  jibun_address text,                    -- 지번 주소 ("부산 수영구 민락동 765")
  lat           double precision,        -- 단지 대표 좌표
  lng           double precision,
  source        text
);
-- 공공데이터상의 동 수. 좌표가 있는 동 수보다 많으면 화면에서 "동별 좌표 없음" 동이 있다고 알린다
alter table complexes add column if not exists building_count integer;

-- 단지 안 동별 좌표 (없는 단지는 행이 없다)
create table if not exists dongs (
  complex_name text not null references complexes(name) on delete cascade,
  dong         text not null,
  lat          double precision not null,
  lng          double precision not null,
  kakao_id     text,
  source       text,
  primary key (complex_name, dong)
);

-- 지하철 출입구 좌표 (2·3호선, 동해선)
create table if not exists subway_exits (
  id         text primary key,
  station_id text not null,
  station    text not null,
  line       text not null,
  name       text not null,
  number     integer,
  lat        double precision not null,
  lng        double precision not null
);

-- 동(또는 단지 대표 위치)마다 가장 가까운 출구까지의 도보 거리. 서버가 준 값(m) 그대로 저장한다
create table if not exists walking_distances (
  id             bigint generated always as identity primary key,
  complex_name   text not null,
  dong           text,                   -- 단지 대표 위치 기준이면 비어 있다
  basis          text not null,          -- 'dong' | 'complex'
  lat            double precision,
  lng            double precision,
  status         text not null,          -- 'ok' | 'failed' | 'no-route' | 'no-exit-nearby' | 'no-coordinate'
  reason         text,
  walking_meters double precision,
  walking_seconds double precision,
  snap_start     double precision,
  snap_end       double precision,
  exit_station   text,
  exit_line      text,
  exit_name      text,
  exit_number    integer,
  exit_lat       double precision,
  exit_lng       double precision
);
create unique index if not exists walking_distances_unique
  on walking_distances (complex_name, coalesce(dong, ''));

-- 데이터 기준일·출처 (화면 아래에 보여준다)
create table if not exists data_meta (
  key          text primary key,         -- 'subway_exits' | 'walking_distances' | 'complexes' | 'dongs'
  generated_at date not null,
  source       text
);

-- 읽기 전용 공개: 로그인 없는 서비스이고 모두 공개 데이터라서 누구나 읽을 수 있다
alter table complexes         enable row level security;
alter table dongs             enable row level security;
alter table subway_exits      enable row level security;
alter table walking_distances enable row level security;
alter table data_meta         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['complexes', 'dongs', 'subway_exits', 'walking_distances', 'data_meta'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'public read') then
      execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
    end if;
  end loop;
end $$;
