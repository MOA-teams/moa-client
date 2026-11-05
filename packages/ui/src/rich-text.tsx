import { Fragment, type ReactNode } from "react";
import { cn } from "@moa/shared/utils";

/** **굵게** 만 인라인으로 처리 (HTML 주입 없이 React 노드로) */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * AI 초안·답변의 간단한 마크다운 표시: **굵게**, "- 목록", "# 제목", 빈 줄.
 * 그 밖의 문법은 글자 그대로 둔다.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return (
    <span className={cn("block", className)}>
      {lines.map((ln, i) => {
        if (!ln.trim()) return <span key={i} className="block h-2" aria-hidden />;
        const bullet = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        const heading = ln.match(/^\s*#{1,6}\s+(.*)$/);
        if (heading) {
          return (
            <span key={i} className="block font-semibold">
              {inline(heading[1])}
            </span>
          );
        }
        if (bullet) {
          const marker = /^\s*\d/.test(ln) ? ln.trim().split(/\s/)[0] : "•";
          return (
            <span key={i} className="flex gap-1.5">
              <span className="shrink-0">{marker}</span>
              <span>{inline(bullet[1])}</span>
            </span>
          );
        }
        return (
          <span key={i} className="block">
            {inline(ln)}
          </span>
        );
      })}
    </span>
  );
}
