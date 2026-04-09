# text-to-strudel

**아무 텍스트나 입력하면 라이브 코딩 음악이 됩니다. 서버 없이. 설치 없이. 브라우저만 있으면.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

**text-to-strudel**은 텍스트를 [Strudel](https://strudel.cc)(TidalCycles의 JavaScript 구현체)을 사용해 재생 가능한 음악으로 변환하는 브라우저 기반 도구입니다. 단어, 문장, 느낌을 입력하고 장르를 선택하면 음악이 시작됩니다. 생성된 코드는 라이브 에디터에 표시되어 실시간으로 수정할 수 있습니다.

> **두 가지 모드:** 브라우저만으로 동작하는 완전 결정론적 **알고리즘 모드**와, 텍스트를 느낌과 이미지로 해석하는 **AI 창의 모드** (Gemini 3.1 Flash Lite, Claude Haiku 4.5, OpenAI GPT-5.4 Nano) 중 선택할 수 있습니다.

---

## 목차

- [기능](#기능)
- [빠른 시작](#빠른-시작)
- [작동 원리](#작동-원리)
- [DJ 믹서](#dj-믹서)
- [자연어 편집](#자연어-편집)
- [장르 가이드](#장르-가이드)
- [아키텍처](#아키텍처)
- [API 설정](#api-설정)
- [테마](#테마)
- [키보드 단축키](#키보드-단축키)
- [라이선스](#라이선스)
- [크레딧](#크레딧)

---

## 기능

- **9개 장르 모드:** EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World (5개 서브장르), Random, Fusion
- **Fusion 토글:** Fusion 체크박스를 선택한 뒤 여러 장르를 조합. 개수 제한 없음.
- **인터랙티브 Strudel 에디터:** 생성된 코드를 직접 편집, `Ctrl+Enter`로 즉시 반영
- **DJ 믹서:** 13개 채널 스트립 (BPM, gain, cutoff, resonance, highpass, octave, reverb, delay, feedback, density, swing, distortion, bitcrush) + tone (6개 스케일) + mood (4개 프리셋). 2열 그리드. 길게 누르면 연속 조절.
- **자연어 편집:** 원하는 변경사항을 자연어로 입력. LLM이 구조를 보존하면서 코드를 정밀 수정. (API 키 필요)
- **Mood 버튼:** dark / euphoric / dreamy / aggressive. 알고리즘 모드에서는 복합 파라미터 변경, AI 모드에서는 LLM이 창의적으로 재해석.
- **Regenerate:** 같은 입력, 다른 결과. 알고리즘 모드는 seed 증가, AI 모드는 temperature/topP 조정.
- **동적 오류 복구:** 생성된 코드에 오류가 있으면 자동 감지 후 LLM에 코드+오류를 보내 수정, 최대 3회 재시도. API 키가 없으면 알고리즘 패턴 매칭으로 폴백.
- **결정론적 출력:** 알고리즘 모드에서 동일한 `텍스트 + 장르 + seed`는 항상 동일한 음악을 생성.
- **6-12개 레이어:** drums, percussion, bass, lead, countermelody, chords, arp, texture/noise.
- **두 가지 테마:** Matrix (초록색 on 검정, 2열, JetBrains Mono)와 Amber (따뜻한 어두운 톤, 단일 열, Outfit + Red Hat Mono).
- **제로 마찰:** 서버 없음, npm 없음, 빌드 없음. HTML 파일을 열면 끝.

---

## 빠른 시작

1. `index.html`을 아무 모던 브라우저에서 엽니다 (또는 정적 HTTP 서버로 제공).
2. 텍스트 입력란에 아무거나 입력합니다 -- 단어, 문장, 기억, 느낌.
3. 장르를 선택합니다 (기본값: EDM). **Fusion**을 체크하면 여러 장르를 조합.
4. **Generate & Play**를 클릭합니다. 음악이 자동으로 시작됩니다.
5. **DJ 믹서**로 파라미터를 조절하거나, **Edit** 필드에 변경사항을 입력합니다.
6. **Regen**으로 같은 입력에서 다른 해석을 들어봅니다.
7. **Stop** 또는 **Ctrl+.**으로 정지합니다.

> AI 창의 모드를 사용하려면? **API**를 클릭하고, 프로바이더를 선택하고, 키를 입력한 뒤 Enter를 누르세요. [API 설정](#api-설정) 참조.

---

## 작동 원리

### 알고리즘 모드 (API 키 없음)

알고리즘 파이프라인은 완전히 결정론적입니다. 동일한 입력 텍스트, 장르, seed 카운터가 주어지면 항상 동일한 결과를 생성합니다.

**1. 텍스트 분석** -- 입력을 다섯 가지 품질로 분석합니다 (0-1):

| 품질 | 산출 기준 |
|:---|:---|
| **에너지(Energy)** | 고유 문자 밀도, 구두점, 대문자, 단어 수 |
| **밝기(Brightness)** | 모음 대 자음 비율 |
| **무게(Weight)** | 평균 단어 길이 |
| **공간(Space)** | 공백 비율, 짧은 문구 보너스 |
| **복잡도(Complexity)** | 고유 문자 비율 |

**2. 장르 결정** -- 각 장르는 템포 범위, 스케일 풀, 사운드 셋, 드럼 패턴, 코드 진행, 레이어별 FX 함수를 정의합니다. **Random**은 3개 장르를 혼합합니다. **Fusion**은 선택된 N개 장르를 블렌딩합니다 (템포 평균, 스케일 결합, 사운드 혼합).

**3. 코드 생성** -- 모티프 기반 멜로디 (콜-리스폰스), 워킹 베이스 (8종), 6가지 코드 보이싱, 장르별 드럼, 12가지 아티스트 영감 기법의 확률적 적용 (.off, .superimpose, .jux, .echoWith, .degradeBy, Perlin 필터 등).

**4. 어레인지먼트** -- `.mask()`를 이용한 레이어 단계적 진입, `.every()`를 통한 주기적 변주, 필터 페이드인, 호흡하는 디그레이드.

### AI 창의 모드 (API 키 있음)

**Gemini 3.1 Flash Lite**, **Claude Haiku 4.5**, 또는 **OpenAI GPT-5.4 Nano**에 입력을 전송합니다.

- **시스템 프롬프트 (~1300 토큰):** 창의적 프로세스 프레임워크, 음악 이론 원칙, 무드 파라미터, 17개 핵심 주의사항.
- **사용자 메시지 (~3100 토큰):** 입력 텍스트, 장르 컨텍스트 및 어레인지먼트 구조, 완전한 Strudel 컴포넌트 레퍼런스 (92개 스케일, 100개 이상 악기, 58개 이펙트), 29개 구조적 이디엄.
- **오류 복구:** 생성된 코드에 런타임 오류가 있으면 `repl.state.evalError`로 감지, 코드+오류를 LLM에 재전송하여 수정, 최대 3회 재시도. LLM 수정 실패 시 알고리즘 `tryFixFromError`로 폴백.

---

## DJ 믹서

첫 번째 생성 후 표시됩니다. 모든 믹서 컨트롤은 API 키 설정 여부와 관계없이 **알고리즘 regex 수정** (즉시, 무료, API 호출 없음)을 사용합니다.

**채널 스트립** (2열 그리드, 각각 [-][+]):

| 채널 | 효과 | 범위 |
|:---|:---|:---|
| BPM | 템포 | 40 - 400 |
| Gain | 볼륨 | 0.05 - 1.0 |
| Cutoff | 로우패스 필터 | 100 - 12000 Hz |
| Resonance | 필터 Q | 0 - 50 |
| Highpass | 하이패스 필터 | 20 - 8000 Hz |
| Octave | 피치 시프트 | 1 - 7 |
| Reverb | 룸 크기 | 0 - 1.0 |
| Delay | 딜레이 센드 | 0 - 1.0 |
| Feedback | 딜레이 피드백 | 0 - 0.95 |
| Density | 유클리드 히트 | 1 - N |
| Swing | 셔플 필 | off / on |
| Distortion | 웨이브셰이프 | 0 - 1.0 |
| Bitcrush | 비트 뎁스 | 1 - 16 |

**Tone:** major, minor, dorian, phrygian, lydian, pentatonic (모든 레이어의 스케일 변경)

**Mood:** dark, euphoric, dreamy, aggressive (복합: 템포 + 필터 + 리버브 + 게인 동시 조정. API 키가 있으면 LLM 사용.)

**길게 누르기:** +/- 버튼을 400ms 이상 누르면 연속 조절 시작 (150ms 간격 반복).

**클릭 피드백:** 초록 플래시 = 값 변경됨. 빨강 플래시 = 코드에 해당 파라미터 없음.

LLM 모드에서는 Edit 행의 **[mixer]**를 클릭하여 믹서를 표시/숨김합니다.

---

## 자연어 편집

AI 모드에서 표시됩니다 (API 키 필요). 지시사항을 입력하고 Enter 또는 Apply를 클릭합니다.

```
> remove drums and add piano          [Apply]
> make the bass more complex
> change everything to Japanese style
> add a breakdown at cycle 16
```

별도의 편집 전용 시스템 프롬프트를 사용합니다: "관련 없는 코드와 주석을 보존. 전체 재작성보다 최소한의 수정을 선호." Temperature 0.2로 정밀도 확보. LLM이 기존 코드를 처음부터 다시 쓰지 않고 정밀하게 수정합니다.

---

## 장르 가이드

| 장르 | BPM | 레이어 |
|:---|:---|:---|
| **EDM** | 124-140 | drums, perc, bass, lead, countermelody, chords, arp, texture |
| **Jazz** | 84-148 | drums, perc, bass, lead, countermelody, chords, texture |
| **Classical** | 62-116 | bass, lead, countermelody, chords, arp, texture |
| **Blues** | 72-108 | drums, perc, bass, lead, countermelody, chords, texture |
| **Ambient** | 50-76 | bass, pad, lead, arp, texture |
| **Lo-fi** | 68-86 | drums, perc, bass, lead, countermelody, chords, texture |
| **World** | 78-126 | drums, perc, bass, lead, countermelody, chords, texture |
| **Random** | 가변 | 3개 랜덤 장르에서 혼합 |
| **Fusion** | 평균화 | N개 선택된 장르에서 블렌딩 |

**World 서브장르:** 플라멩코, 일본, 인도, 동유럽, 아랍 -- 각각 전통 스케일, 키, 악기 사용.

---

## 아키텍처

```
text-to-strudel/
  index.html          Matrix 테마 (초록 on 검정, 2열, JetBrains Mono)
  index.amber.html    Amber 테마 (따뜻한 어두운 톤, 단일 열, Outfit + Red Hat Mono)
  app.js              전체 로직 (양쪽 테마 공유)
  LICENSE             AGPL-3.0
  README.md
  README-ko.md        한국어 문서
```

- **index.html** (~570줄) -- 2열 레이아웃: 왼쪽 패널 (컨트롤, 믹서) 고정, 오른쪽 패널 (코드 에디터) 독립 스크롤. Matrix 초록 미학, CRT 스캔라인 오버레이. CodeMirror 구문 색상을 초록 스펙트럼으로 오버라이드.
- **index.amber.html** (274줄) -- 단일 열 레이아웃, 앰버 액센트, 필름 그레인 오버레이, 알약형 버튼. 동일한 HTML 구조와 ID -- `app.js`와 완전 호환.
- **app.js** (~2060줄) -- Seeded PRNG, 텍스트 분석, 7개 장르 정의, 멜로디/베이스/코드/아르페지오 생성기, 13개 믹서 채널 스트립 핸들러, 3개 LLM 프로바이더 통합, 동적 오류 복구 루프, 자연어 편집, 시스템 프롬프트 + 컴포넌트 레퍼런스.

---

## API 설정

| 프로바이더 | 모델 | 키 형식 | 문서 |
|:---|:---|:---|:---|
| **Gemini** (기본) | gemini-3.1-flash-lite-preview | `AIza...` | [aistudio.google.com](https://aistudio.google.com) |
| **Claude** | claude-haiku-4-5-20251001 | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | gpt-5.4-nano | `sk-...` | [platform.openai.com](https://platform.openai.com) |

1. 앱에서 **API**를 클릭합니다.
2. 드롭다운에서 프로바이더를 선택합니다.
3. 키를 붙여넣고 **Enter**를 누릅니다 (자동 검증).
4. 초록 체크마크 = 검증됨. 빨강 X = 유효하지 않음.

키는 프로바이더별로 `localStorage`에 저장됩니다. 프로바이더를 전환하면 해당 프로바이더의 저장된 키가 자동으로 로드됩니다. 검증 상태는 세션 간 유지됩니다. API 패널 바깥을 클릭하면 닫힙니다.

**프로바이더별 Temperature 처리:**
- **Gemini:** 1.0 고정 (Google은 Gemini 3+ 모델에서 낮추지 않을 것을 권장). `topP`로 변주 (0.9 -> 0.99, regen마다 증가).
- **Claude:** 0.9 -> 1.2, regen마다 증가. 범위 0.0-1.2.
- **OpenAI:** 0.9 -> 1.2, regen마다 증가. temperature 지원을 위해 `reasoning: {effort: "none"}` 필요.

---

## 테마

| 테마 | 파일 | 미학 |
|:---|:---|:---|
| **Matrix** | `index.html` | 검정 바탕 초록, JetBrains Mono, 2열, CRT 스캔라인, 날카로운 모서리 |
| **Amber** | `index.amber.html` | 따뜻한 앰버 on 다크, Outfit + Red Hat Mono, 단일 열, 필름 그레인, 둥근 알약형 |

두 테마 모두 동일한 `app.js`를 공유합니다. 모든 기능이 동일하게 작동합니다. 다른 HTML 파일을 열면 테마가 전환됩니다.

---

## 키보드 단축키

| 단축키 | 동작 |
|:---|:---|
| `Enter` | Generate & Play (텍스트 입력란) / API 키 저장 / 편집 적용 |
| `Shift+Enter` | 텍스트 입력란에서 줄바꿈 |
| `Ctrl+Enter` | 에디터에서 코드 재실행 |
| `Ctrl+.` | 재생 정지 |
| `Ctrl+Z` | 에디터에서 실행 취소 |

---

## 라이선스

**AGPL-3.0**

이 프로젝트는 `@strudel/repl` 의존성이 AGPL-3.0 라이선스이므로 GNU Affero General Public License v3.0에 따라 라이선스가 부여됩니다. 라이브러리는 CDN을 통해 수정 없이 로드됩니다.

---

## 크레딧

- **[Strudel](https://strudel.cc)** -- Alex McLean과 기여자들이 만든 라이브 코딩 환경.
- **Google Gemini API** -- Gemini 3.1 Flash Lite를 통한 AI 창의 모드.
- **Anthropic Claude API** -- Claude Haiku 4.5를 통한 AI 창의 모드.
- **OpenAI API** -- GPT-5.4 Nano를 통한 AI 창의 모드.

이 프로젝트에 복사된 제3자 코드는 없습니다. 29개 코드 구조 패턴은 모두 기존 작곡물의 복제가 아닌 오리지널 구조적 이디엄입니다.
