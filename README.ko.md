# @kyntra/claude-hook

[English](./README.md) · [한국어](./README.ko.md)

> **[Kyntra AIMOps Control Tower](https://kyntra.ai.kr)의 하네스 엔지니어링 계층** — 오픈소스 클라이언트(MIT), 서버는 특허 출원 중.

Claude Code용 거버넌스 훅. 결정론적 규칙 엔진과 LLM 판단 계층이 모든 도구 호출 앞단에 서서 **허용 / 차단 / 경고**를 1초 이내 반환합니다 — 파괴적 명령, 환각성 "완료" 보고, 소프트 규칙 위반을 **실행 전에** 막습니다.

```
$ claude
> 버그 고치고 push 해줘

[KYNTRA] BLOCKED — main/master 브랜치 force push 차단됨
         Principle: rule-no-force-push-main
         Layer: rules
```

이 저장소는 오픈소스 클라이언트 어댑터입니다. 매 훅 이벤트를 HTTPS로 Kyntra 서버 거버넌스 엔진(특허 출원)에 전송하고 판정에 따라 종료됩니다.

## 누구를 위한 도구인가

Kyntra가 맞는 상황:
- Claude가 검증도 없이 "완료"라고 하는 상황(`curl OK → 사이트는 깨져있음` 패턴)을 계속 겪고 있다.
- `CLAUDE.md`에 적어둔 규칙이 **힌트**가 아니라 **강제**되길 원한다.
- 훅 계층에서 force-push, `rm -rf /`, 맨몸 `wrangler deploy` 같은 파괴적 명령을 Claude가 쉘로 빠져나가기 **전에** 차단하고 싶다.
- 여러 Claude Code 사용자/프로젝트를 운영하며 계정별 신뢰도 프로필과 승격 후보를 관리하고 싶다.

맞지 않는 경우:
- 단순 regex 필터만 필요 — `~/.claude/settings.json`에 shell hook 한 줄이면 충분합니다.
- 작업 흐름에 파괴·배포·비밀값 관련 명령이 전혀 없습니다.
- 에어갭 환경 — Kyntra는 `api.kyntra.ai.kr`로 아웃바운드 HTTPS 연결이 필요합니다.

---

## 왜 훅인가

"내 규칙 따라줘"라고 Claude에게 말해뒀습니다. 세션마다 리마인더를 붙여넣었습니다. 그런데도 `curl OK — 사이트 살아있음`이라는 보고를 받고 보니 사이트는 깨져있었습니다.

문제는 모델이 아닙니다 — 리마인더는 *권고*이고, 훅은 *강제*입니다. Kyntra는 모든 AI 도구 호출 앞단에 서서 1초 이내에 **허용 / 차단 / 경고**를 반환합니다.

- **결정론 우선** — 내장 regex 규칙 엔진이 명백한 케이스를 잡습니다. LLM 호출 없음, 비용 없음, 지연 없음.
- **LLM은 애매한 나머지 처리** — Kyntra Layer 2(Haiku)가 regex로 표현 안 되는 문맥 판단을 맡습니다.
- **당신의 규칙, 강제로** — 커스텀 규칙을 대시보드에서 등록하거나 CLAUDE.md에서 가져옵니다.
- **반자동 원칙 진화(사람 승인 루프)** — 반복 위반은 *승격 후보*로 누적되고, 신뢰도 높은 원칙은 감쇠합니다. Kyntra가 후보를 자동 산출하되 **승격은 당신이 승인** — 말 없는 규칙 변경은 없습니다. 신뢰도 조정 엔진은 특허 출원 중(KR 청구항 1 & 2).

## Kyntra vs. 직접 만든 훅

**직접 Claude Code 훅을 쓸지**와 이 도구를 쓸지 고민 중이라면, 솔직한 비교:

| 항목 | 직접 만든 shell 훅 | Kyntra |
|---|---|---|
| `rm -rf /`, `git push --force main` 차단 | regex로 해결 | 동일 (Layer 1, <1ms, API 비용 0) |
| "배포 완료" 보고가 *거짓일 때* 잡기 | 직접 LLM 호출 설계 필요 | 내장 Layer 1 규칙이 검증 없는 완료 주장을 플래그, Layer 2(Haiku)가 애매한 문맥 케이스 처리 |
| `CLAUDE.md` 규칙을 강제 규칙으로 | 각 규칙을 regex/prompt로 수작업 이식 | CLAUDE.md를 붙여넣으면 Kyntra가 강제 가능한 규칙으로 추출 |
| 어떤 규칙이 실제 발동하고 어떤 게 노이즈인지 신뢰 신호 | 대시보드 직접 구축 | 대시보드 + 사람 승인 승격 후보 내장 |
| Claude Code가 이벤트 형식 바꿀 때 유지보수 | 당신 몫 | 서버에서 업데이트, 클라이언트는 약 200줄 유지 |
| 비용 | 지속적인 개발 시간 | Starter $15/월 · Pro $29/월 (14일 환불 보장) |

하네스는 오픈(MIT, 약 200줄 — 신뢰하기 전에 전 줄 읽기 권장). 서버 엔진(3계층: KV 캐시 → regex 규칙 → Haiku LLM)은 직접 만들면 며칠치 작업입니다.

## 설치

```bash
npx @kyntra/claude-hook install
```

`~/.claude/settings.json`에 훅을 등록하고, 기존 설정은 백업하고, 복붙 가능한 다음 단계를 출력합니다. 그 다음:

```bash
export KYNTRA_API_KEY=ky_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

…Claude Code를 재시작. `git push --force origin main`을 시도해보세요 — Claude가 쉘로 빠져나가기 전에 훅 계층에서 거부되어야 합니다.

## API 키 받기

Kyntra 구독이 필요합니다. **월 $15**부터 시작, **첫 달 50% 할인**, **14일 환불 보장**.

1. **[app.kyntra.ai.kr](https://app.kyntra.ai.kr)** 접속 후 GitHub 로그인
2. 요금제 구독 (Starter 또는 Pro)
3. 대시보드에서 API 키 복사

- **[요금제](https://kyntra.ai.kr/pricing)** — Starter $15/월, Pro $29/월
- **[이용약관](https://kyntra.ai.kr/terms)** · **[개인정보처리방침](https://kyntra.ai.kr/privacy)** · **[환불정책](https://kyntra.ai.kr/refund)**

## 내장 규칙

이 규칙들은 LLM 호출 **전에** 실행됩니다 — 비용 0, 지연 0. 대표적인 파괴 패턴을 기본 제공으로 잡습니다:

| 규칙 | 판정 | 무엇을 잡는가 |
|------|------|---------------|
| main force push 금지 | **BLOCK** | `git push --force main`, `git push -f master` |
| 루트 재귀 삭제 금지 | **BLOCK** | `rm -rf /`, `rm -rf ~`, `rm -rf $HOME` |
| git 훅 건너뛰기 금지 | **BLOCK** | `git commit --no-verify`, `--no-gpg-sign` |
| .env 추가 금지 | **WARN** | `echo >> .env` (실수로 비밀값 노출) |
| 맨몸 wrangler deploy 금지 | **WARN** | `npm run deploy` 없이 `wrangler deploy` |
| 비밀값 노출 탐지 | **WARN** | 명령어에 API 키·토큰 (`sk-`, `ghp-`, `eyJ`) |
| 검증 없는 완료 | **BLOCK** | grep/테스트/브라우저 증거 없이 "완료" 주장 |

어느 것도 매치 안 되면 이벤트는 **Layer 2 (Haiku LLM)** 으로 넘겨져 문맥 분석됩니다.

## 커스텀 규칙

내장 규칙과 함께 강제되는 자체 거버넌스 규칙을 정의할 수 있습니다. 커스텀 규칙은 LLM 평가 계층에 주입됩니다 — regex가 아니라 자연어로 동작합니다.

### 대시보드를 통해

1. **[app.kyntra.ai.kr](https://app.kyntra.ai.kr)** 로그인
2. 사이드바의 **Custom Rules**로 이동
3. **+ Add Rule** 또는 **Import from CLAUDE.md** 클릭

각 규칙은:
- **이름** — 짧은 제목 (예: "커밋 전 lint 실행")
- **설명** — AI가 따라야 할 규칙 본문
- **카테고리** — security, quality, workflow, general
- **심각도** — critical (→ 차단), warning (→ 경고), info (→ 메모와 함께 허용)

### CLAUDE.md 가져오기

CLAUDE.md 내용을 붙여넣으면 Kyntra AI가 실행 가능한 규칙을 자동 추출합니다. 수작업 입력 없음 — 기존 프로젝트 지침을 강제 가능한 거버넌스 규칙으로 파싱합니다.

### 한도

| 요금제 | 최대 규칙 수 |
|--------|--------------|
| Starter ($15/월) | 10 |
| Pro ($29/월) | 50 |

## 환경 변수

| 변수 | 필수 | 기본값 |
|---|---|---|
| `KYNTRA_API_KEY` | 예 | — |
| `KYNTRA_ENDPOINT` | 아니오 | `https://app.kyntra.ai.kr/api/governance/check` |

## 동작 방식

```
Claude Code 세션
  │
  │ 1. 도구 호출 (Bash / Edit / Write / Stop)
  ▼
훅: node bridge.js   ← 이 패키지 (MIT, 약 200줄)
  │
  │ 2. POST /api/governance/check  {event, tool, command, ...}
  ▼
api.kyntra.ai.kr     ← 서버 엔진 (비공개, 특허 출원)
  │
  │ 3. Layer 0 KV 캐시 → Layer 1 규칙 → Layer 2 Haiku → 판정
  ▼
훅: exit 0 (allow) | exit 2 (block)
```

**클라이언트 어댑터는 원칙 로직을 전혀 담고 있지 않습니다.** 세 가지만 합니다: stdin 읽기, Kyntra API에 POST, 판정에 따라 exit. 전체 소스는 이게 전부입니다.

## 장애 시 허용 (Fail-open)

`api.kyntra.ai.kr`에 연결이 안 되거나 타임아웃(기본 5초)이면 훅은 stderr에 메모를 남기고 **0 (allow)** 으로 종료합니다. Kyntra는 자기 버그나 네트워크 문제로 정당한 작업을 절대 막지 않습니다.

## CLI

```bash
npx @kyntra/claude-hook install        # ~/.claude/settings.json에 훅 설치
npx @kyntra/claude-hook uninstall      # 제거
npx @kyntra/claude-hook print-config   # 수동 설정용 훅 스니펫 출력
npx @kyntra/claude-hook --help
```

## 수동 설정

`~/.claude/settings.json`을 직접 편집하고 싶다면:

```bash
npx @kyntra/claude-hook print-config
```

…출력을 기존 `hooks` 키에 병합하세요.

## Kyntra가 실제로 보는 것

매 도구 호출에서 훅이 전송하는 내용:

- `event_type` — `pre_tool_use` / `post_tool_use` / `stop` / …
- `tool` — `Bash` / `Edit` / `Write` / …
- `command` — 명령 문자열의 첫 800자 (Bash 전용)
- `file_path` — 편집 중인 파일 경로
- `response_text` — Stop 이벤트 시 AI 마지막 메시지의 첫 1,500자

이게 전부입니다. **소스 코드 내용, 저장소 목록, 비밀값, 환경변수는 절대 전송되지 않습니다.** 자세한 내용은 [개인정보처리방침](https://kyntra.ai.kr/privacy).

## 라이선스

MIT — [LICENSE](./LICENSE) 참조.

> MIT 라이선스는 이 클라이언트 어댑터만 적용됩니다. `api.kyntra.ai.kr`의 서버 거버넌스 엔진은 Flowlabs 독점이며, 한국 특허 출원(청구항 1: 컴플라이언스 검증 엔진 · 청구항 2: 신뢰도 조정 엔진) 보호 하에 있습니다.

## 연락처

- 홈페이지: https://kyntra.ai.kr
- 앱: https://app.kyntra.ai.kr
- 이슈: https://github.com/YBPartners/kyntra-claude-hook/issues
- 이메일: contact@kyntra.ai.kr

---

*[Flowlabs](https://kyntra.ai.kr)가 만들었습니다. "배포 완료"라고 말해놓고 실제론 아닌 경우를 지긋지긋하게 봐서 시작했습니다.*
