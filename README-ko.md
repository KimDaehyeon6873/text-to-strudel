# text-to-strudel

<img width="1362" height="212" alt="text-to-strudel banner" src="https://github.com/user-attachments/assets/94cafa96-096d-443e-85ec-9a0a35a93f12" />

**아무 텍스트나 입력하면 라이브 코딩 음악이 됩니다. 서버 없이. 설치 없이. 브라우저만 있으면.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Tests](https://img.shields.io/badge/tests-32%2F32-brightgreen.svg)](#테스트--타입-체크)
[![Type Check](https://img.shields.io/badge/tsc-0%20errors-brightgreen.svg)](#테스트--타입-체크)

---

**text-to-strudel**은 [Strudel](https://strudel.cc)(TidalCycles의 JavaScript 포트)을 사용해 임의의 텍스트를 재생·편집 가능한 음악으로 변환하는 단일 페이지 브라우저 도구입니다. 단어 한 줄, 문장, 느낌을 입력 — 장르 선택 — 듣기. 생성된 코드는 라이브 에디터에 들어가 실시간으로 계속 수정할 수 있습니다.

> **UI는 영어로 통일되어 있습니다.** 이 한국어 문서는 번역본이며, 앱 자체는 영어 인터페이스로 동작합니다.

> **두 가지 모드.** 브라우저만으로 동작하는 완전 결정론적 **Algorithmic Mode**와, 텍스트를 *느낌과 이미지*로 해석하는 **AI Creative Mode** (Gemini 3.1 Flash Lite, Claude Haiku 4.5, OpenAI GPT-5.4 Nano).

---

## 목차

- [기능](#기능)
- [빠른 시작](#빠른-시작)
- [작동 원리](#작동-원리)
- [DJ 믹서](#dj-믹서)
- [자연어 편집](#자연어-편집)
- [장르 가이드](#장르-가이드)
- [API 설정](#api-설정)
- [보안 모델](#보안-모델)
- [테마](#테마)
- [키보드 단축키](#키보드-단축키)
- [아키텍처](#아키텍처)
- [테스트 & 타입 체크](#테스트--타입-체크)
- [라이선스](#라이선스)
- [크레딧](#크레딧)

---

## 기능

- **9개 장르:** EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World (5개 서브장르), Random, Fusion.
- **Fusion 토글:** Fusion 체크 후 여러 장르 다중 선택 — 개수 제한 없음.
- **라이브 Strudel 에디터:** 생성된 코드를 직접 수정, `Ctrl+Enter`로 즉시 재평가.
- **DJ 믹서:** 13개 채널 스트립 (BPM, gain, cutoff, resonance, highpass, octave, reverb, delay, feedback, density, swing, distortion, bitcrush) + tone (6 스케일) + mood (4 프리셋). 2열 그리드. 길게 누르면 연속 조절.
- **자연어 편집:** 변경 내용을 자연어로 입력. LLM이 무관한 구조는 보존하면서 정밀 수정. (API 키 필요)
- **Mood 버튼:** dark / euphoric / dreamy / aggressive — 알고리즘 모드에선 복합 파라미터 시프트, AI 모드에선 LLM이 창의적 재해석.
- **재생성:** 같은 입력, 다른 결과. 알고리즘은 seed 증가, AI는 regen마다 temperature/topP 조정.
- **동적 에러 복구:** 런타임 에러 시 `repl.state.evalError` 감지 → 코드+에러를 LLM에 전송해 수정 → 최대 3회 재시도 → 실패 시 알고리즘 `tryFixFromError`로 폴백.
- **결정론적 알고리즘 출력:** `텍스트 + 장르 + seed` 동일 → 동일한 코드 (바이트 단위).
- **레이어당 6–12개:** drums, percussion, bass, lead, countermelody, chords, arp, texture/noise.
- **두 가지 테마:** Matrix (초록 위 검정, 2열, JetBrains Mono)와 Amber (따뜻한 다크, 단일 열, Outfit + Red Hat Mono).
- **기본 강화:** API 키는 `sessionStorage` (탭 닫으면 삭제), 디스크 영속화는 옵트인. CSP는 `frame-ancestors`, `base-uri`, `form-action`, `object-src`를 잠그고 모든 Strudel 샘플 호스트만 명시 허용. Strudel REPL 번들에 SRI 적용.
- **취소 + 타임아웃:** 모든 LLM 호출은 `AbortController` + 60초 하드 타임아웃. 새 generate가 진행 중인 호출을 자동 취소.
- **마찰 0, 빌드 0:** 서버, npm, 번들러 없음. HTML 파일을 열면 끝. `npm test`와 `npm run typecheck`는 *선택적* 개발 도구.

---

## 빠른 시작

1. `index.html`을 모던 브라우저로 열거나, 정적 HTTP 서버로 디렉터리를 서빙 (`python3 -m http.server 8000`).
2. 텍스트 입력란에 아무거나 — 단어, 문장, 기억, 느낌.
3. 장르 선택 (기본 EDM). **Fusion** 체크하면 여러 장르 결합.
4. **Generate & Play** 클릭. 음악 자동 시작.
5. **DJ 믹서**로 파라미터 조정, 또는 (AI 모드) **Edit** 입력란에 변경 사항 입력.
6. **Regen**으로 같은 입력의 다른 해석.
7. **Stop** 또는 **Ctrl+.** 으로 무음.

> AI Creative Mode가 필요하면 **api** 클릭 → 프로바이더 선택 → 키 붙여넣기 → Enter. [API 설정](#api-설정) 참고.

---

## 작동 원리

### Algorithmic Mode (API 키 없이)

파이프라인은 완전 결정론적. 동일한 입력 + 장르 + seed → 항상 동일한 출력.

**1. 텍스트 분석** — 5가지 특성 (각 0–1):

| 특성 | 산출 방식 |
|:---|:---|
| **Energy** | 고유 문자 밀도, 구두점, 대문자, 단어 수 |
| **Brightness** | 모음/자음 비율 (ASCII 모음 + 한글 음절 기여) |
| **Weight** | 평균 단어 길이 |
| **Space** | 공백 비율, 짧은 구절 보너스 |
| **Complexity** | 고유 문자 비율 |

> **한글 처리:** 각 한글 음절은 모음 카운트에 0.5를 기여합니다 (음절마다 정확히 하나의 중성 모음 + 1~2개 자음). 따라서 순한글 입력도 0이 아닌 의미 있는 brightness 값을 만들어냅니다.

**2. 장르 해석** — 각 장르가 템포 범위, 스케일 풀, 사운드 셋, 드럼 패턴, 코드 진행, 레이어별 FX 함수를 정의. **Random**은 3개 장르 혼합. **Fusion**은 N개 선택 장르 블렌드 (템포 평균, 스케일 결합, 사운드 혼합).

**3. 코드 생성** — 모티프 기반 멜로디 (콜&리스폰스), walking bass (8종), 6가지 코드 보이싱, 장르별 드럼, 12가지 아티스트 영감 기법 (`.off`, `.superimpose`, `.jux`, `.echoWith`, `.degradeBy`, Perlin filter 등) 확률적 적용.

**4. 어레인지** — `.mask()`로 레이어 시차 등장, `.every()`로 주기적 변주, 필터 페이드인, 호흡하는 degrade.

### AI Creative Mode (API 키 있음)

입력을 **Gemini 3.1 Flash Lite**, **Claude Haiku 4.5**, 또는 **OpenAI GPT-5.4 Nano**로 전송.

- **시스템 프롬프트 (~1300 토큰):** 창작 프로세스 프레임워크, 음악 이론 원칙, mood 파라미터, 17개 critical reminder.
- **유저 메시지 (~3100 토큰):** 입력 텍스트, 어레인지 구조 포함 장르 컨텍스트, 완전한 Strudel 컴포넌트 레퍼런스 (스케일 92, 악기 100+, 이펙트 58), 29개 구조 idiom.
- **에러 복구:** 런타임 에러 발생 시 코드 + 에러를 LLM에 다시 보내 수정, 최대 3회, 실패 시 알고리즘 복구로 폴백.
- **Refusal 처리:** Claude `stop_reason: 'refusal'`, OpenAI `finish_reason: 'content_filter'`, Gemini `finishReason: SAFETY|RECITATION|BLOCKLIST` 모두 명시적 에러로 surface — 빈 코드를 silent injection 하지 않음.

---

## DJ 믹서

첫 generate 이후 등장. 모든 믹서 컨트롤은 **알고리즘 regex 변환** (즉시, 무료, API 호출 없음) — API 키 유무 무관.

**채널 스트립** (2열 그리드, 각 `[-][+]`):

| 채널 | 효과 | 범위 |
|:---|:---|:---|
| BPM | 템포 | 40 – 400 |
| Gain | 볼륨 | 0.05 – 1.0 |
| Cutoff | 로우패스 필터 | 100 – 12000 Hz |
| Resonance | 필터 Q | 0 – 50 |
| Highpass | 하이패스 필터 | 20 – 8000 Hz |
| Octave | 피치 시프트 | 1 – 7 |
| Reverb | 룸 사이즈 | 0 – 1.0 |
| Delay | 딜레이 send | 0 – 1.0 |
| Feedback | 딜레이 피드백 | 0 – 0.95 |
| Density | 유클리드 hits | 1 – N |
| Swing | 셔플 | off / on |
| Distortion | 웨이브셰이프 | 0 – 1.0 |
| Bitcrush | 비트 깊이 | 1 – 16 |

**Tone:** major, minor, dorian, phrygian, lydian, pentatonic — 모든 레이어의 스케일을 일괄 교체.

**Mood:** dark, euphoric, dreamy, aggressive — 복합: tempo + filter + reverb + gain 동시 조정. API 키가 있으면 LLM 사용.

**롱프레스:** ± 버튼을 400 ms 누르면 연속 조절 시작 (150 ms 반복). 믹서 컨테이너에 단일 위임 mousedown/touchstart — 30개 버튼 전체에 리스너 1개.

**클릭 피드백:** 초록 플래시 = 값 변경됨. 빨강 플래시 = 코드에 매칭되는 파라미터 없음.

AI 모드에서 Edit 행의 **mixer** 클릭으로 믹서 토글.

---

## 자연어 편집

AI 모드 한정. 명령어 입력 후 Enter 또는 **apply** 클릭.

```
> remove drums and add piano          [apply]
> make the bass more complex
> change everything to Japanese style
> add a breakdown at cycle 16
```

별도의 편집 전용 시스템 프롬프트 사용: *"Preserve unrelated code and comments. Prefer minimal edits over full rewrites."* Temperature 0.2로 정밀도 우선 (Gemini는 1.0 — Google 권고로 못 낮춤). LLM은 처음부터 다시 쓰는 게 아니라 기존 코드를 외과적으로 수정.

---

## 장르 가이드

| 장르 | BPM | 레이어 |
|:---|:---|:---|
| **EDM** | 124 – 140 | drums, perc, bass, lead, countermelody, chords, arp, texture |
| **Jazz** | 84 – 148 | drums, perc, bass, lead, countermelody, chords, texture |
| **Classical** | 62 – 116 | bass, lead, countermelody, chords, arp, texture |
| **Blues** | 72 – 108 | drums, perc, bass, lead, countermelody, chords, texture |
| **Ambient** | 50 – 76 | bass, pad, lead, arp, texture |
| **Lo-fi** | 68 – 86 | drums, perc, bass, lead, countermelody, chords, texture |
| **World** | 78 – 126 | drums, perc, bass, lead, countermelody, chords, texture |
| **Random** | 가변 | 무작위 3개 장르 혼합 |
| **Fusion** | 평균 | 선택한 N개 장르 블렌드 |

**World 서브장르:** Flamenco, Japanese, Indian, Eastern European, Arabic — 각각 전통별 스케일·키·악기.

---

## API 설정

| Provider | 모델 | 키 형식 | 콘솔 |
|:---|:---|:---|:---|
| **Gemini** (기본) | `gemini-3.1-flash-lite-preview` | `AIza...` | [aistudio.google.com](https://aistudio.google.com) |
| **Claude** | `claude-haiku-4-5-20251001` | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | `gpt-5.4-nano` | `sk-...` | [platform.openai.com](https://platform.openai.com) |

1. 사이드 패널 **api** 클릭.
2. 드롭다운에서 프로바이더 선택.
3. 키 붙여넣고 Enter (각 프로바이더 `/v1/models` 엔드포인트로 자동 검증).
4. 초록 = 검증됨. 빨강 = 무효 (HTTP 상태 포함). 느린 네트워크엔 타임아웃 메시지.

**검증 동작**

- 검증 ping은 `AbortController` + 10초 타임아웃.
- 검증 성공 시 `tts_verified_at_<provider>`에 타임스탬프 기록. 이후 호출은 **24시간** 동안 신뢰, 만료되면 재검증.
- 실제 `callLLM()`이 `401`/`403`을 받으면 즉시 타임스탬프 무효화 → UI가 재입력 유도.
- `429` (rate limit), `403` (billing/region) 모두 명시적 안내.

**Temperature 처리**

- **Gemini:** 1.0 고정 (Google이 Gemini 3+에선 낮추지 말라고 권고). regen마다 `topP`로 변주 (0.9 → 0.99).
- **Claude:** regen마다 0.9 → 1.2. 범위 0.0 – 1.2.
- **OpenAI:** regen마다 0.9 → 1.2. Temperature 지원을 위해 `reasoning: {effort: 'none'}` 필수.

---

## 보안 모델

정적 클라이언트 사이트로서 트레이드오프를 가시화하고 명시.

| 표면 | 완화책 |
|:---|:---|
| Strudel REPL이 `unsafe-eval`로 사용자 코드 평가 | Strudel 필수 사항. 라이브 에디터 포기 없이는 제거 불가. |
| 브라우저 저장소의 LLM API 키 | 기본 = `sessionStorage` (탭 닫으면 삭제). 옵트인 = `localStorage` (API 패널 토글). |
| 끈끈한 verified 플래그 (구 동작) | 24시간 TTL + 실 호출 401/403 자동 무효화로 교체. |
| `@strudel/repl` CDN 공급망 침해 | `<script>` 태그에 SRI 해시. 번들은 `@1.3.0`에 핀. |
| `connect-src` / `media-src` 샘플·데이터 호스트 | 명시 allow-list: `raw.githubusercontent.com`, `*.githubusercontent.com`, `felixroos.github.io`, `cdn.freesound.org`, `shabda.ndre.gr`, `kabel.salat.dev`, `strudel.cc`, `*.strudel.cc`. |
| Clickjacking, base-tag injection, form hijacking | CSP `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'none'`, `object-src 'none'`. |
| API로의 referrer 누출 | `<meta name="referrer" content="no-referrer">`. |
| 네트워크 행 / 폭주 요청 | LLM 호출당 60초 하드 타임아웃 (검증은 10초). |
| Generate 연타 race | 채널 기반 취소 (`generate` / `refine` / `edit` / `fix` / `verify`). 새 요청이 진행 중 요청 abort. `Stop`은 모두 취소. |
| 빈 / 거부 LLM 응답이 정상 코드 덮어쓰기 | `refusal`, `content_filter`, `SAFETY`, 빈 응답 명시 검사. status 에러로 surface — 쓰레기 주입 안 함. |

Strudel 업그레이드 시 핀 + grep 레시피:

```bash
curl -s https://unpkg.com/@strudel/repl@<버전>/dist/index.js \
  | grep -oE 'https?://[a-zA-Z0-9.-]+' | sort -u
```

새 호스트가 보이면 `index.html`과 `index.amber.html`의 `connect-src` + `media-src`에 추가. `<script>` 태그의 integrity 해시도 갱신.

---

## 테마

| 테마 | 파일 | 미학 |
|:---|:---|:---|
| **Matrix** | `index.html` | 초록 위 검정, JetBrains Mono, 2열, CRT 스캔라인, 직각 |
| **Amber** | `index.amber.html` | 따뜻한 어둠 위 amber, Outfit + Red Hat Mono, 단일 열, 필름 그레인, 둥근 pill |

둘 다 동일한 `app.js` 공유. 모든 기능 동일 작동. 다른 HTML 파일 열기로 전환.

---

## 키보드 단축키

| 단축키 | 동작 |
|:---|:---|
| `Enter` | Generate & Play (텍스트 입력 시) / API 키 저장 / Edit 적용 |
| `Shift+Enter` | 텍스트 입력란 줄바꿈 |
| `Ctrl+Enter` | 에디터 코드 재평가 |
| `Ctrl+.` | 재생 정지 |
| `Ctrl+Z` | 에디터 undo |

---

## 아키텍처

```
text-to-strudel/
  index.html           Matrix 테마 (~585 lines)
  index.amber.html     Amber 테마  (~294 lines)
  app.js               전체 로직   (~2330 lines, // @ts-check, JSDoc)
  package.json         선택적 개발 도구 (test + typecheck 스크립트)
  test/
    smoke.test.mjs     32개 node:test 케이스
  README.md            영문 (정본)
  README-ko.md         한국어 번역 (이 문서)
  LICENSE              AGPL-3.0
```

**`app.js`** 단일 파일 — `index.html` 열고 F12 누르면 5분 안에 어떤 기능이든 추적 가능하게 의도. 섹션은 `// ---- HEADER ----` 코멘트로 표시.

| 섹션 | 내용 |
|:---|:---|
| `TUNING` / `MODELS` / `NET` | 튜닝 상수 (BPM/gain/filter 범위, 모델 ID, fetch 타임아웃, 검증 TTL) |
| `createRNG`, `analyzeText` | seeded PRNG + 5-feature 텍스트 분석 (한글 인지) |
| `GENRES`, `TECHNIQUES`, `GENRE_CONTEXT` | 장르 정의 + 12개 아티스트 영감 기법 + LLM 컨텍스트 |
| `generateCode` | 알고리즘 파이프라인: 모티프 → bass → chords → arp → texture → 어레인지 |
| `callLLM` | Gemini/OpenAI/Claude 통합 디스패치 — 타임아웃 + 취소 + refusal 처리 |
| `setCodeAndPlay` + `tryFixFromError` + `fixWithLLM` | 에러 복구 루프 |
| `REFINERS` 테이블 + `algoRefine` | 믹서 +/- 버튼용 30-entry regex 변환 테이블 |
| API 키 UI IIFE | sessionStorage 기본, opt-in persist, TTL 검증 |
| 믹서 이벤트 위임 IIFE | 믹서 위 단일 mousedown/touchstart로 30개 버튼 모두 처리 |

**두 HTML**은 동일한 DOM ID/클래스명 공유. 테마 선택은 다른 파일을 여는 것일 뿐.

---

## 테스트 & 타입 체크

```bash
npm test           # 32개 node:test 스모크
npm run typecheck  # JSDoc 어노테이션 기반 tsc --checkJs (0 errors)
```

`app.js`는 최상단의 `// @ts-check` + 전반의 JSDoc `@type` / `@typedef` 어노테이션으로 TypeScript 검사를 옵트인. 검사 범위: DOM 타입 narrowing (`HTMLInputElement` placeholder, `HTMLButtonElement.disabled`, `HTMLElement.dataset`), `callLLM()`의 `Provider` / `Channel` enum, `analyzeText()`의 `Analysis` shape, Strudel REPL 커스텀 element 증강. JSDoc만 — `tsconfig.json` 없음, `.ts` 파일 없음, 컴파일 단계 없음. 동일한 `app.js`가 그대로 브라우저에 들어감.

32개 스모크 테스트가 커버하는 순수 함수:

- `analyzeText` — 빈 입력 기본값, 영어 [0, 1] 범위 finite, **한글 brightness regression guard**, 한·영 혼합
- `createRNG` — seed 결정성, 무관 seed의 발산
- `stripFences` — 트리플 백틱 제거
- `stripFnCall` — `.foo(x.bar(1,2)).baz()` **중첩 paren regression guard**
- `nameOnlyInsideStrings` — 문자열 전용 vs 실 호출 구분
- `tryFixFromError` — `'X is not defined'` 주석 처리가 **mini-notation 문자열 멘션 보존**, `setBPM → setcpm`, `line(a,b,n) → saw.range`, `'X is not a function'` 치환
- `normalize` — gm_pad 번호 이름 재작성
- `algoRefine` — TUNING.BPM 클램프 포함 BPM 증감, gain factor 클램프, 미지 direction은 변경 없음
- `generateCode` — **결정성 스냅샷 regression guard** + seed 발산
- `saveApiKey` / `getApiKey` — persist=false (sessionStorage 단독), persist=true (양쪽 저장), `''` 양쪽 삭제, sessionStorage 우선 + localStorage 폴백 시 세션 캐시 워밍
- `isVerified` / `invalidateVerified` — 24h TTL 윈도우, 타임스탬프 클리어
- `cancelInflight` — 컨트롤러 정리
- `isAbortError` — AbortError 이름 + 'aborted' 메시지 감지

테스트는 `vm.runInContext`에서 `document`, `localStorage`, `sessionStorage`, `fetch`, `AbortController`, `CustomEvent` 스텁으로 `app.js`를 그대로 로드. 트랜스파일 없음, 테스트 프레임워크 의존성 없음 (Node 내장 `node:test`).

---

## 라이선스

**AGPL-3.0**

`@strudel/repl` (AGPL-3.0)에 의존하므로 GNU Affero General Public License v3.0. 라이브러리는 CDN으로 무수정 로드.

---

## 크레딧

- **[Strudel](https://strudel.cc)** by Alex McLean and contributors — 라이브 코딩 환경.
- **Google Gemini API** — Gemini 3.1 Flash Lite로 AI 창의 모드.
- **Anthropic Claude API** — Claude Haiku 4.5로 AI 창의 모드.
- **OpenAI API** — GPT-5.4 Nano로 AI 창의 모드.

이 프로젝트에 외부 코드는 복사되지 않았습니다. LLM 컨텍스트 메시지에 문서화된 29개 코드 구조 패턴은 모두 원본 구조 idiom이며 기존 곡의 재현이 아닙니다.
