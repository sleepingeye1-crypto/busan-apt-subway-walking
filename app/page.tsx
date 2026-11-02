import Form from "next/form";
import { Suspense } from "react";
import { searchComplexes } from "@/lib/complexes";

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
  const query = typeof q === "string" ? q.trim() : "";
  const results = searchComplexes(query);

  return (
    <>
      <SearchForm defaultValue={query} />
      {query && (
        <section className="mt-6" aria-live="polite">
          <p className="mb-3 text-sm text-zinc-500">
            &ldquo;{query}&rdquo; 검색 결과 {results.length}개
          </p>
          {results.length > 0 ? (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {results.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-zinc-500">
                    부산 {c.gu} {c.dong}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              검색 결과가 없습니다.
            </p>
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
        부산 해운대구·수영구·남구 아파트의 동별 지하철 입구 도보 거리
      </p>
      <Suspense fallback={<SearchForm />}>
        <SearchSection searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
