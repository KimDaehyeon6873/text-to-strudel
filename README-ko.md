# text-to-strudel

<img width="1362" height="212" alt="text-to-strudel" src="https://github.com/user-attachments/assets/94cafa96-096d-443e-85ec-9a0a35a93f12" />

**텍스트를 브라우저에서 라이브 코딩 음악으로 바꿉니다.**

[English](README.md) · [Strudel](https://strudel.cc) · [보안 아키텍처](docs/security-architecture.md) · [AGPL-3.0](LICENSE)

text-to-strudel은 문장을 일관된 음악적 해석과 편집 가능한 Strudel 코드로 바꿉니다. 알고리즘 모드는 로컬에서 결정론적으로 동작합니다. 선택적으로 API 키를 설정하면 더 풍부한 LLM 기반 해석과 자연어 편집을 사용할 수 있습니다.

## 기능

- EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World, Random, 다중 장르 Fusion 모드
- 조성, 화성, 프레이즈, 베이스, 그루브, 형식, 음색, 편곡을 공유하는 `CompositionPlan`
- 하나의 보이스 리딩 `chord(...).dict("ireal")` 진행에서 파생되는 코드 인지형 베이스와 멜로디
- 재즈 ii–V–I 턴어라운드, 클래식 종지, 실제 12마디 블루스 등 장르별 화성
- 가능한 파트를 모두 쌓는 대신 목적이 분명한 4–7개 레이어
- 전체 **New take**와 분리된 **New melody**, **New groove**, **New arrangement** 변주
- 유니코드와 한글을 인식하는 결정론적 텍스트 분석
- 부모 애플리케이션과 API 키에서 분리된 샌드박스 Strudel 실행
- 같은 엔진을 공유하는 Matrix와 Amber 인터페이스

## 빠른 시작

로컬 HTTP로 프로젝트를 실행합니다.

```bash
python3 -m http.server 8080
```

`http://localhost:8080`을 열고 텍스트와 장르를 선택한 뒤 **Generate & Play**를 누릅니다. iframe과 CSP 아키텍처는 HTTP(S) 오리진을 전제로 하므로 `file:` URL로 `index.html`을 직접 여는 방식은 지원하지 않습니다.

브라우저 앱에는 빌드 단계가 없습니다. unpkg에서 버전이 고정된 `@strudel/repl@1.3.0` 런타임을 불러오므로 최초 로드에는 네트워크 연결이 필요합니다.

## 음악 엔진

### 1. 결정론적 단서 및 구조 분석

알고리즘 모드는 입력을 Unicode NFKC로 정규화하고 유니코드 코드 포인트 단위로 처리합니다. 다음 요소를 조합합니다.

- 밝음/어두움, 격렬함/차분함, 무거움/공기감에 대한 제한된 영어·한국어 정서 단서 목록
- 단어 수, 구두점, 대문자, 문자 밀도, 평균 단어 길이, 문자 다양성과 같은 구조적 측정값
- 전체 정규화 텍스트, 장르, 변주 상태를 사용한 시드 기반 음악 선택용 결정론적 지문

이 분석기는 음악적 해석을 제안할 뿐, 일반적인 문맥 또는 의미 이해를 수행하지 않습니다. 지표 요약이 비슷해도 전체 텍스트가 다르면 시드 기반 선택이 달라질 수 있습니다.

| 지표 | 현재 알고리즘 출력에서의 역할 |
|:---|:---|
| 에너지(Energy) | 템포, 프레이즈와 베이스 활동량, 드럼 다이내믹, 선택 퍼커션 및 기법 |
| 밝기(Brightness) | 화성 프로필 매칭과 필터 범위 |
| 무게(Weight) | 필터 범위와 텍스처 레벨 |
| 공간(Space) | 룸, 공간 관련 기법, 필터 움직임, 선택 텍스처 |
| 긴장도(Tension) | 화성 프로필 매칭 |
| 복잡도(Complexity) | 계산되어 생성 코드의 mood 주석에 표시되지만, 렌더링된 음악을 독립적으로 구동하지 않음 |
| 정서가(Valence) | 계산되어 생성 코드의 mood 주석에 표시되지만, 렌더링된 음악을 독립적으로 구동하지 않음 |

AI 창의 모드는 더 풍부한 의미 해석을 위해 브라우저에서 선택한 프로바이더로 프롬프트를 직접 전송합니다.

### 2. 공유 화성과 보이스 리딩

`createCompositionPlan()`이 조성, 화성 프로필, 형식, 템포, 프레이즈, 베이스 패턴, 음색, 편곡을 결정합니다. `renderCompositionPlan()`은 하나의 공유 화성을 선언합니다.

```js
const harmony = chord("<Dm7 G7 C^7 A7>").dict("ireal")
```

베이스는 이 화성의 근음을 따르고, 코드 레이어는 앵커 보이싱을 사용하며, 리드와 액센트는 `harmony.n(...).voicing()`에서 파생됩니다. 레이어마다 독립적인 음 풀을 쓰지 않아 파트 사이의 화성 관계가 유지됩니다.

알고리즘 출력은 동일하게 정규화된 텍스트, 장르, 변주 상태에 대해 결정론적입니다.

### 3. 목적이 분명한 레이어와 형식

각 테이크는 드럼, 베이스, 화성, 리드, 응답 액센트 또는 아르페지오, 퍼커션, 텍스처 중 음악에 필요한 4–7개 역할을 렌더링합니다. 각 역할에는 편곡 마스크와 라우팅 목적이 있습니다.

| Orbit | 역할 |
|:---|:---|
| 1 | 드럼과 퍼커션 |
| 2 | 베이스 |
| 3 | 화성 |
| 4 | 리드 |
| 5 | 카운터멜로디 또는 아르페지오 액센트 |
| 6 | 텍스처와 공간감 |

대부분은 16사이클 인트로/빌드/브레이크/릴리스 형식을 사용합니다. Ambient에는 느린 페이드/블룸 형식이 적용됩니다. Blues는 24사이클의 두 코러스 편곡 안에서 12개의 화성 마디를 보존합니다.

## 변주

알고리즘 모드에서 다음의 집중 변주 버튼을 사용할 수 있습니다.

| 동작 | 변경 | 유지 |
|:---|:---|:---|
| **New melody** | 리드와 응답 프레이즈 | 화성, 그루브, 음색, 형식 |
| **New groove** | 드럼 선택, 드럼 다이내믹, 그루브 시드 퍼커션 | 화성과 멜로디 |
| **New arrangement** | 형식, 음색, 선택 레이어, 기법, 편곡 FX | 화성 심벌, 베이스 패턴, 리드 프레이즈 |
| **New take** | 화성, 멜로디, 그루브, 편곡 전체 | 입력 텍스트와 선택 장르 |

집중 변주는 현재 에디터 코드를 필요한 레이어에서만 패치하므로, 대상과 무관한 Tone·템포·사운드 폴리시 및 수동 편집을 유지합니다. **New take**는 반대로 완전히 새로운 음악적 정체성을 만듭니다.

Classical이나 Ambient처럼 드럼이 없는 구성에서는 **New groove**가 비활성화됩니다.

## 사운드 폴리시

사운드 폴리시 패널은 템포, 게인, 컷오프, 레조넌스, 하이패스, 옥타브, 리버브, 딜레이, 피드백, 리듬 밀도, 스윙, 디스토션, 비트 뎁스, 화성 톤을 조절할 수 있습니다. 현재 코드에서 적용 가능성을 검사하며, 한계에 도달했거나 대응하는 음악 대상이 없는 컨트롤은 비활성화됩니다.

Tone 버튼은 공유 코드 진행을 재화성화하면서 형식을 유지합니다. Blues는 톤 변경 후에도 12마디 구조를 유지합니다.

Mood 버튼은 서로 다른 매크로입니다.

- **dark:** 느리게, 어둡게, 낮게, minor
- **euphoric:** 빠르게, 밝게, 크게, Lydian, 리버브 증가
- **dreamy:** 느리게, 어둡게, 리버브/딜레이 증가, pentatonic
- **aggressive:** 빠르게, 크게, 촘촘하게, 레조넌스/디스토션 증가, Phrygian

API 키가 있으면 Mood 버튼은 AI 재해석을 요청합니다. 그 외 사운드 폴리시 조정은 즉시 적용되는 로컬 편집입니다.

## 장르 가이드

| 장르 | 화성/형식 특성 |
|:---|:---|
| EDM | Minor, Dorian, 메이저 릴리스, Phrygian 긴장 프로필 |
| Jazz | 메이저 ii–V–I, 마이너 턴어라운드, 확장 코드를 사용한 모달 브리지 |
| Classical | 정격 종지, 마이너 라멘트, 위종지 |
| Blues | I7–IV7–V7 기반 12마디 셔플/슬로 번 진행과 24사이클 형식 |
| Ambient | 서스펜디드 Lydian, Dorian 오비트, 여백 있는 펜타토닉 진행 |
| Lo-fi | 확장 7th/9th 코드 루프와 순환형 편곡 |
| World | 모달 드론, 오픈 5도, 지역 음색을 사용한 화성단음계 종지 |
| Random | 화성, 음색, 그루브의 출처를 독립적으로 결합 |
| Fusion | 첫 번째 선택 장르를 화성 기준으로 사용하고 선택 장르의 음색/그루브를 결합 |

World 모드에는 Flamenco, Japanese, Indian, Eastern European, Arabic 음색 팔레트가 포함됩니다.

## AI 창의 모드와 API 키

**API**를 열어 Gemini, Claude, OpenAI 중 프로바이더를 선택하고 키를 저장합니다. AI 모드는 새로운 해석을 생성하고 현재 Strudel 코드에 자연어 편집을 적용할 수 있습니다.

API 키 저장 방식은 프로바이더별로 적용됩니다.

- **세션 전용(기본값):** 키는 현재 페이지의 JavaScript 메모리에만 있으며 새로고침하거나 탭을 닫으면 삭제됩니다.
- **이 기기에 유지:** 명시적인 안내와 확인을 거친 뒤 키를 브라우저 `localStorage`에 평문으로 저장합니다. 신뢰할 수 있는 브라우저 프로필에서만 사용하십시오.
- 이전 버전에서 저장한 키는 `localStorage`에 그대로 남고, 세션 전용으로 잘못 표시하지 않고 유지됨으로 표시됩니다.

이 프로젝트는 여전히 브라우저 전용 애플리케이션입니다. 프로바이더 요청과 API 키는 브라우저에서 선택한 프로바이더로 직접 전송되며, 프로젝트 서버가 이를 보호하거나 프록시하거나 숨기지 않습니다. 브라우저 확장 프로그램, DevTools, 신뢰 경계인 부모 페이지의 악성 코드, 또는 같은 브라우저 프로필의 다른 사용자가 유지된 키에 접근할 수 있습니다.

AI 모드에서는 집중 알고리즘 변주 버튼이 숨겨집니다. 창의적 변경에는 **New take** 또는 **Edit** 필드를 사용합니다.

## 런타임 격리

부모 페이지가 UI 상태, API 키, 프로바이더 요청, 오케스트레이션을 담당합니다. Strudel과 평가되는 패턴은 `sandbox="allow-scripts"`로 인해 불투명 오리진을 갖는 iframe인 `strudel-host.html`에서 실행됩니다. 부모는 초기화할 때 하나의 `MessagePort`를 전달하며, 이후 에디터 명령은 지속적인 전역 `message` 리스너 대신 이 포트를 사용합니다.

부모 CSP에는 `unsafe-eval`이 없습니다. Strudel에 필요한 평가 기능은 별도의 제한적인 CSP 아래 샌드박스 호스트에서만 허용됩니다. CSP의 `'self'`는 불투명 샌드박스 오리진과 일관되게 일치하지 않으므로, 자식 CSP와 로컬 외부 브리지 스크립트는 서로 일치하는 nonce를 사용합니다. 자식은 부모가 일회성 `MessagePort` 초기화를 수락할 때까지 부트스트랩 ping을 재시도합니다. Strudel 의존성은 `@strudel/repl@1.3.0`으로 고정되고 SHA-384 Subresource Integrity로 보호됩니다. 신뢰 경계, 불변 조건, 비보장 범위는 [보안 아키텍처](docs/security-architecture.md)를 참고하십시오.

## 프로젝트 구조와 테스트

```text
index.html                     Matrix 인터페이스와 부모 CSP
index.amber.html               Amber 인터페이스와 부모 CSP
app.js                         컴포지션 엔진, 프로바이더 호출, 키 저장, iframe RPC 클라이언트
strudel-host.html              샌드박스 Strudel 호스트, 자식 CSP, 버전 고정 SRI 의존성
strudel-host.js                검증된 MessagePort RPC 서버
package.json                   Node, TypeScript, Playwright 스크립트
test/                          유닛 및 정적 보안 회귀 테스트
e2e/                           Playwright 브라우저 테스트
docs/musicality-checklist.md   A/B 청취 체크리스트
docs/security-architecture.md  브라우저 신뢰 경계와 위협 모델
README.md / README-ko.md       영문 및 한국어 문서
```

개발 도구를 설치한 뒤 검사를 실행합니다.

```bash
npm install
npm test
npm run typecheck
npx playwright install
npm run e2e
```

`npm run e2e`는 로컬 HTTP 서버를 자동으로 시작하고 데스크톱 Chromium, Firefox, WebKit 및 설정된 모바일 브라우저 프로젝트를 실행합니다. Linux CI나 새 환경에서는 Playwright 시스템 의존성이 추가로 필요할 수 있으며, 이때는 `npx playwright install --with-deps`를 사용하십시오.

## 키보드 단축키

| 단축키 | 동작 |
|:---|:---|
| `Enter` | 텍스트 필드에서 생성, API 키 저장, 편집 적용 |
| `Shift+Enter` | 텍스트 필드에서 줄바꿈 |
| `Ctrl+Enter` | 에디터 코드 재평가 |
| `Ctrl+.` | 재생 정지 |
| `Ctrl+Z` | 에디터 실행 취소 |

## 라이선스와 크레딧

라이선스는 [AGPL-3.0](LICENSE)입니다. 이 앱은 Alex McLean 및 기여자들이 만든 [Strudel](https://strudel.cc)을 사용하며, 브라우저 의존성은 `@strudel/repl@1.3.0`으로 고정되어 있습니다.
