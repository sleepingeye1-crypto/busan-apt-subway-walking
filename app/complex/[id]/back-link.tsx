"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// "검색으로 돌아가기": 검색 결과에서 들어왔으면 그때의 검색어(주소의 ?from=)로 돌아가
// 보던 결과를 다시 보여준다. 주소를 직접 입력해 들어온 경우(?from= 없음)는 처음 검색 화면(/)으로 간다.
export default function BackLink() {
  const from = useSearchParams().get("from");
  const href = from === null ? "/" : `/?q=${encodeURIComponent(from)}`;

  return (
    <Link href={href} className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
      ← 검색으로 돌아가기
    </Link>
  );
}
