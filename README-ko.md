# text-to-strudel

**텍스트를 라이브 코딩 음악으로 변환하는 브라우저 도구**

텍스트를 입력하면 [Strudel](https://strudel.cc) 라이브 코딩 패턴으로 변환합니다. API 키 없이 알고리즘 기반으로 동작하며, API 키를 추가하면 AI가 텍스트의 분위기를 창의적으로 해석합니다.

---

## 기능

- **9개 장르 지원** — EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World, Random, Fusion
- **인터랙티브 Strudel 에디터** — 생성된 코드를 직접 편집하고 `Ctrl+Enter`로 즉시 반영
- **Refine 버튼 8개** — faster / slower / brighter / darker / spacious / dry / louder / quieter (항상 알고리즘 방식, API 비용 없음)
- **Mood 버튼 4개** — dark / euphoric / dreamy / aggressive (AI 모드에서는 LLM이 창의적으로 재해석)
- **6-12개 레이어** — drums, percussion, bass, lead, countermelody, chords, arp, texture/noise
- **길게 누르기 반복** — ± 버튼을 길게 누르면 연속 조절
- **Regenerate** — 같은 입력으로 매번 다른 결과 생성
- **GM pad 이름 자동 정규화** — General MIDI 패드 이름을 올바른 형식으로 변환
- **29개 코드 구조 패턴** — 8개 카테고리에 걸친 다양한 코드 진행
- **Strudel 컴포넌트 레퍼런스** — 92개 스케일, 100개 이상의 악기, 58개 이펙트
- **장르별 arrangement 길이** — 장르 특성에 맞는 구간 배분
- **모티프 기반 멜로디 생성** — 콜-리스폰스, 앵커 포인트, 워킹 베이스, `.mask()` 배치, `.every()` 변주

---

## 빠른 시작

### 1. 파일 다운로드

```
index.html
app.js
```

두 파일을 같은 디렉토리에 배치합니다.

### 2. 브라우저에서 열기

```bash
open index.html
```

서버 설정, `npm install`, 빌드 과정이 필요 없습니다. HTML 파일을 브라우저에서 직접 열면 바로 사용할 수 있습니다.

### 3. 텍스트 입력 및 생성

1. 텍스트 입력란에 원하는 텍스트를 입력합니다.
2. 장르를 선택합니다 (기본값: Random).
3. **Generate** 버튼을 클릭합니다.
4. 생성된 Strudel 코드가 에디터에 표시됩니다.
5. **Play** 버튼 또는 `Ctrl+Enter`로 음악을 재생합니다.

---

## 작동 원리

text-to-strudel은 두 가지 모드로 동작합니다.

### 알고리즘 모드 (API 키 없음)

API 키가 설정되지 않은 상태에서의 기본 모드입니다.

1. **텍스트 분석** — 입력 텍스트를 다섯 가지 차원으로 분석합니다:
   - **에너지(Energy)** — 텍스트의 활력과 강도
   - **밝기(Brightness)** — 톤의 밝고 어두운 정도
   - **무게(Weight)** — 저음역대 비중과 밀도
   - **공간(Space)** — 음향적 넓이와 여백
   - **복잡도(Complexity)** — 패턴과 레이어의 정교함
2. **장르별 코드 생성** — 분석된 특성값을 선택된 장르의 규칙에 매핑하여 Strudel 코드를 생성합니다.
3. **결정론적 출력** — 동일한 텍스트와 장르 조합은 항상 동일한 결과를 반환합니다.
4. **Regenerate** — seed 값을 변경하여 같은 입력에서 다른 변형을 생성합니다.

### AI 창의 모드 (API 키 있음)

Anthropic 또는 Google AI API 키를 설정하면 활성화됩니다.

1. **AI 모델** — Claude Haiku 4.5 또는 Gemini 3.1 Flash Lite가 텍스트를 해석합니다.
2. **창의적 해석** — AI가 텍스트의 느낌, 분위기, 이미지를 읽고 이에 어울리는 Strudel 코드를 생성합니다.
3. **Temperature 증가** — Regenerate를 누를 때마다 temperature 값이 올라가 점점 더 실험적인 결과를 만듭니다.
4. **Strudel 레퍼런스 활용** — AI에게 92개 스케일, 100개 이상의 악기, 58개 이펙트 정보를 제공하여 정확한 Strudel 문법으로 코드를 생성합니다.

---

## 아키텍처

```
text-to-strudel/
  index.html   (558줄) — UI, 레이아웃, 스타일
  app.js     (2001줄) — 전체 로직
```

### index.html

- 텍스트 입력 영역
- 장르 선택 버튼 (장르별 액센트 컬러)
- Generate / Regenerate / Stop 버튼
- Mixer 패널: ± 버튼, tone 태그, mood 버튼
- 인라인 편집 바 (자연어 지시로 코드 수정)
- Strudel REPL 에디터 영역
- API 키 설정 UI

### app.js

- **텍스트 분석 엔진** — 에너지, 밝기, 무게, 공간, 복잡도 산출
- **장르별 코드 생성기** — 9개 장르 각각의 패턴 매핑 로직
- **29개 코드 구조 패턴** — 8개 카테고리 (Organization, Melody & Harmony, Rhythm & Time, Timbre & Texture, Sample Manipulation, Spatial & Dynamics, Transitions & Dynamics, Arrangement)
- **모티프 기반 멜로디 생성** — 콜-리스폰스 구조, 앵커 포인트, 워킹 베이스
- **Strudel 메서드 활용** — `.mask()` 배치, `.every()` 변주, `.legato()`, `.delay()` 등
- **GM pad 이름 정규화** — General MIDI 패드 이름 자동 보정
- **AI API 통신** — Anthropic API 및 Google AI API 호출 처리
- **Refine / Mood 후처리** — 생성된 코드에 대한 파라미터 조정

### 서버리스 구조

- 서버가 필요 없습니다.
- 빌드 도구가 필요 없습니다.
- `npm install`이 필요 없습니다.
- 브라우저에서 HTML 파일을 열면 바로 동작합니다.
- Strudel REPL은 CDN에서 로드됩니다.

---

## 장르 가이드

| 장르 | 특징 | BPM 범위 |
|------|------|----------|
| **EDM** | 4-on-the-floor 킥, saw 리드 + 필터 스윕, 오프비트 스탭, 사이드체인 | 124-140 |
| **Jazz** | 스윙, 도리안/비밥, Rhodes/어쿠스틱 베이스, 유클리드 컴핑 | 84-148 |
| **Classical** | 피아노/스트링/플루트, 긴 프레이즈, 다이나믹스, 룸 리버브 | 62-116 |
| **Blues** | 블루스 스케일, 셔플 리듬, 오버드라이브 기타, 콜-리스폰스 | 72-108 |
| **Ambient** | sine/triangle 패드, 긴 attack/release, 대형 리버브, 스파스 | 50-76 |
| **Lo-fi** | Rhodes EP, 머플드 드럼 (.lpf), degradeBy 테이프 드롭아웃 | 68-86 |
| **World** | 플라멩코/일본/인도/동유럽/아랍 서브장르, 전통 악기+스케일 | 78-126 |
| **Random** | 모든 장르 요소의 무작위 조합 | 가변 |
| **Fusion** | 두 개 이상 장르의 크로스오버, 복합 박자 | 가변 |

---

## API 설정

### Anthropic API (Claude Haiku 4.5)

1. [Anthropic Console](https://console.anthropic.com/)에서 API 키를 발급합니다.
2. text-to-strudel UI의 API 설정 영역에 키를 입력합니다.
3. 모델: `claude-haiku-4-5`

### Google AI API (Gemini 3.1 Flash Lite)

1. [Google AI Studio](https://aistudio.google.com/)에서 API 키를 발급합니다.
2. text-to-strudel UI의 API 설정 영역에 키를 입력합니다.
3. 모델: `gemini-3.1-flash-lite`

### API 키 없이 사용

API 키를 설정하지 않아도 알고리즘 모드로 정상 동작합니다. AI 창의 모드는 선택 사항입니다.

> **참고:** API 키는 브라우저 로컬 스토리지에 저장되며 외부 서버로 전송되지 않습니다. API 호출은 브라우저에서 직접 이루어집니다.

---

## 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+Enter` | Strudel 코드 실행 (에디터 내 편집 후 즉시 반영) |
| `Ctrl+.` | 음악 정지 |

---

## 의존성

| 패키지 | 용도 | 라이선스 |
|--------|------|----------|
| [@strudel/repl](https://strudel.cc) | Strudel 라이브 코딩 REPL (CDN) | AGPL-3.0 |
| [Anthropic API](https://docs.anthropic.com/) | Claude Haiku 4.5 (선택적, 사용자 키) | - |
| [Google AI API](https://ai.google.dev/) | Gemini 3.1 Flash Lite (선택적, 사용자 키) | - |

---

## 라이선스

**AGPL-3.0**

이 프로젝트는 GNU Affero General Public License v3.0에 따라 라이선스가 부여됩니다. Strudel REPL 의존성과 동일한 라이선스를 따릅니다.

---

## 크레딧

- **[Strudel](https://strudel.cc)** — Alex McLean과 Strudel 기여자들이 개발한 라이브 코딩 환경. Tidal Cycles의 웹 구현체.
- **[Tidal Cycles](https://tidalcycles.org)** — Alex McLean이 만든 라이브 코딩 패턴 언어.
- **[Anthropic Claude](https://anthropic.com)** — AI 창의 모드에서 텍스트 해석에 사용되는 AI 모델.
- **[Google Gemini](https://ai.google.dev)** — AI 창의 모드에서 텍스트 해석에 사용되는 AI 모델.
