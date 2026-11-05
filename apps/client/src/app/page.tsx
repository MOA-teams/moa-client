import Link from "next/link";
import {
  ArrowRight,
  Bug,
  GitCommitHorizontal,
  Headset,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  Star,
} from "lucide-react";
import { ADMIN_URL } from "@moa/shared/urls";
import { Logo } from "@moa/ui";
import { NavAuth } from "@/components/auth/customer-auth";

const SCENES = [
  {
    no: "01",
    icon: MessageCircle,
    title: "채팅 문의 → 근거 있는 초안 → 별점",
    body: "고객이 채팅으로 문의하면 즉시 접수 안내가 가고, 유형·긴급도 분류와 출처가 붙은 초안이 뜹니다. 근거가 없으면 \"직접 확인 필요\". 상담 종료 후 ★5 답변은 우수 답변 후보로.",
    links: [
      { href: "/chat", label: "고객 채팅 열기" },
      { href: `${ADMIN_URL}`, label: "인박스" },
    ],
  },
  {
    no: "02",
    icon: GitCommitHorizontal,
    title: "요금 변경 push → 낡은 답변 재검토",
    body: "요금 9,900원 → 12,900원 커밋을 push하면 diff를 요약하고 연결된 답변 23개를 재검토 큐로 보냅니다. 처리 전까지 검색에서 빠지고 새 초안에는 충돌 경고가 뜹니다.",
    links: [{ href: `${ADMIN_URL}/changes`, label: "변경 감지·재검토" }],
  },
  {
    no: "03",
    icon: Bug,
    title: "버그 문의 급증 → GitHub 이슈",
    body: "\"저장하면 E-502 떠요\" 문의가 몰리면 하나의 그룹으로 묶고 급증 알림을 띄웁니다. 의심 코드 위치 후보와 최근 커밋을 묶어 GitHub 이슈를 자동 생성합니다.",
    links: [{ href: `${ADMIN_URL}/groups`, label: "문의 그룹" }],
  },
];

const PRINCIPLES = [
  { icon: Headset, title: "Human-in-the-loop", body: "사실이 들어간 답변은 항상 담당자가 승인합니다. AI가 바로 보내는 건 접수 안내와 정보 수집 질문뿐." },
  { icon: Star, title: "사실은 최신 문서·코드에서", body: "가격·기간·기능 유무는 현재 유효한 근거에서만. 우수 답변은 톤과 설명 순서만 참고합니다." },
  { icon: ShieldCheck, title: "보안 레벨 직접 선택", body: "기본값은 읽기 전용 + 경로 제한 + 비밀값 제외. 코드는 담당자 화면에만, 고객 답변에는 절대 섞이지 않습니다." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <NavAuth />
          <Link href="/chat" className="rounded-lg px-3 py-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
            고객 채팅
          </Link>
          <a href={ADMIN_URL} className="rounded-lg bg-zinc-900 px-3.5 py-2 font-medium text-white hover:bg-zinc-800">
            어드민 열기
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 md:pt-20">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-[12.5px] text-zinc-600">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            매주 배포하는 IT 스타트업을 위한 CS 레이어
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.2] tracking-tight text-zinc-900 md:text-[52px]">
            코드가 바뀌면,
            <br />
            답변 근거도 따라 바뀝니다.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-zinc-500">
            모아는 흩어진 고객 문의와 제품 정보를 하나로 모읍니다. CS 담당자는 근거 있는 답변 초안을,
            개발자는 정리된 버그 이슈를 받습니다.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-2 md:max-w-3xl">
            <Link
              href="/chat"
              className="group flex items-center justify-between rounded-2xl border border-zinc-200 p-5 transition hover:border-zinc-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                  <MessageCircle className="size-5" />
                </span>
                <div>
                  <p className="font-semibold text-zinc-900">고객 채팅</p>
                  <p className="text-[13px] text-zinc-500">문의·첨부·상태 확인·별점</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:text-zinc-700" />
            </Link>
            <a
              href={ADMIN_URL}
              className="group flex items-center justify-between rounded-2xl border border-zinc-900 bg-zinc-900 p-5 text-white transition hover:bg-zinc-800"
            >
              <div className="flex items-center gap-3.5">
                <span className="grid size-10 place-items-center rounded-xl bg-white/10">
                  <LayoutDashboard className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">담당자 어드민</p>
                  <p className="text-[13px] text-zinc-400">인박스·초안 검토·재검토 큐·이슈</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
            </a>
          </div>
        </section>

        <section className="border-y border-zinc-100 bg-zinc-50/60">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-sm font-semibold text-zinc-500">데모 시나리오</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {SCENES.map((s) => (
                <article key={s.no} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
                      <s.icon className="size-[18px]" />
                    </span>
                    <span className="font-mono text-xs text-zinc-400">{s.no}</span>
                  </div>
                  <h3 className="mt-5 text-[16px] font-semibold text-zinc-900">{s.title}</h3>
                  <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-zinc-500">{s.body}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {s.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        {l.label} <ArrowRight className="size-3.5" />
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 md:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.title}>
                <p.icon className="size-5 text-zinc-400" />
                <h3 className="mt-3 font-semibold text-zinc-900">{p.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-500">{p.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-100">
        <div className="mx-auto max-w-6xl px-6 py-6 text-[12.5px] text-zinc-400">
          해커톤 데모 · 가상 스타트업 &ldquo;싱크노트&rdquo;의 합성 데이터를 사용합니다.
        </div>
      </footer>
    </div>
  );
}
