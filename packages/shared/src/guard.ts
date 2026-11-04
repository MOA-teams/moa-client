/** S-04: 고객 발송 답변에 코드·파일 경로·커밋 SHA가 섞였는지 검사 (서버·클라이언트 공용) */
export function detectCodeExposure(text: string): string[] {
  const hits = new Set<string>();
  const patterns: RegExp[] = [
    /\b[\w-]+(?:\/[\w.-]+)+\.(?:ts|tsx|js|jsx|py|java|kt|go|rb|sql)\b/g, // 파일 경로
    /\b(?:const|let|function|import|export|return)\s+[\w{]/g, // 코드 키워드
    /\b[A-Z][A-Z0-9_]{3,}\s*=/g, // 상수 대입
    /`[^`]+`/g, // 인라인 코드
    /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g, // 커밋 SHA
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) hits.add(m[0].trim());
  }
  return [...hits];
}
