import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { listComplexes, SERVICE_SCOPE, searchComplexes } from "@/lib/complexes";
import { IMPOSSIBLE_LABEL } from "@/lib/walking";

// 개발 단위 7: 아파트 검색 화면.
// 검색어는 주소의 ?q= 로 전달되고, 결과에는 단지 이름과 구·동을 함께 보여준다.

function SearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <Form action="/" className="flex gap-2">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="아파트 이름 (예: 센텀)"
        aria-label="아파트 이름"
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-100"
      />
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        검색
      </button>
    </Form>
  );
}

// 검색어(searchParams)는 요청할 때만 알 수 있으므로 Suspense 안에서 읽는다
async function SearchSection({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { q } = await searchParams;
  // 검색 버튼을 누르면 빈칸이어도 주소에 ?q= 가 붙는다. 처음 들어왔을 때(q 없음)와 구분한다
  const submitted = typeof q === "string";
  const query = submitted ? q.trim() : "";
  // 빈칸으로 검색하면 전체 단지 목록을 보여준다
  const showAll = submitted && query === "";
  const results = showAll ? listComplexes() : searchComplexes(query);

  return (
    <>
      <SearchForm defaultValue={query} />
      {submitted && (
        <section className="mt-6" aria-live="polite">
          <p className="mb-3 text-sm text-zinc-500">
            {showAll ? <>전체 단지 {results.length}개</> : <>&ldquo;{query}&rdquo; 검색 결과 {results.length}개</>}
          </p>
          {results.length > 0 ? (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {results.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/complex/${encodeURIComponent(c.id)}`}
                    className="block px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-zinc-500">
                      {c.area}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            // 개발 단위 8: 대상 단지에 없는 이름(다른 구, 700세대 미만 등)은 "불가능"을 돌려준다
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-lg font-bold">{IMPOSSIBLE_LABEL}</p>
              <p className="mt-1 text-sm text-zinc-500">{SERVICE_SCOPE}만 조회할 수 있습니다.</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-2xl font-bold">우리 동에서 지하철까지</h1>
      <p className="mb-6 mt-2 text-zinc-500">
        {SERVICE_SCOPE}의 동별 지하철 입구 도보 거리
      </p>
      <Suspense fallback={<SearchForm />}>
        <SearchSection searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
