---
name: drawio-diagram
description: Draw.io 다이어그램을 격자 셀 좌표계 규칙으로 생성하고, 좌우/상하 밸런스·화살표/텍스트 겹침을 정렬하는 스킬.
origin: harness
workloads: [architecture, writing]
---

# draw.io Diagram Generator

LLM이 좌표를 즉흥 계산하면 좌우/상하 밸런스가 어긋나고 화살표·텍스트가 겹친다.
이 스킬은 그 문제를 두 축으로 잡는다:

1. **격자 셀 좌표계** — 위치를 `row/col × 상수` 공식으로만 산출해 임의성을 없앤다.
2. **검증 루프** — `create → export(PNG) → 좌표·이미지 이중 검증 → edit` 을 반복해 수렴시킨다.

## When to Activate

- draw.io / diagrams.net 다이어그램 생성 요청
- 아키텍처도, 플로우차트, 시퀀스, 조직도, ER, 네트워크 다이어그램
- 기존 다이어그램의 정렬·겹침·밸런스 수정 요청

## 핵심 원칙

> **계산을 없애고 규칙으로 좌표가 자동으로 떨어지게 만든다.**

## 격자 셀 좌표계 (가장 중요)

### 셀 상수

```
CELL_W = 240   # 셀 가로 간격
CELL_H = 160   # 셀 세로 간격
NODE_W = 200   # 도형 기본 가로
NODE_H = 80    # 도형 기본 세로
MARGIN = 40    # 캔버스 좌상단 여백
```

### 좌표 공식 (이 공식 외 임의 좌표 금지)

```
x = MARGIN + col * CELL_W
y = MARGIN + row * CELL_H
```

- 모든 노드는 `(row, col)` 정수 좌표만 갖는다.
- 같은 레벨의 노드는 반드시 동일 공식값을 공유한다 → 자동 정렬.

### 좌우 대칭 (밸런스)

한 레벨에 노드가 N개일 때:

```
start_col = floor((MAX_COLS - N) / 2)
각 노드 col = start_col + i   (i = 0..N-1)
```

## 연결점·라우팅 규칙 (화살표 겹침 방지)

### 고정 연결점

**세로 흐름(top→bottom):**
```
출발: exitX=0.5  exitY=1   (하단 중앙)
도착: entryX=0.5 entryY=0   (상단 중앙)
```

### 다중 분기 — 연결점 분산

```
2갈래: exitX = 0.33 / 0.67
3갈래: exitX = 0.25 / 0.5 / 0.75
```

### 엣지 스타일 (항상 적용)

```
edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;
```

## 라벨 공간 사전 확보 (겹침 방지)

- 엣지에 라벨이 있으면 연결된 두 도형 사이 세로 간격을 1.5칸으로 넓히기
- 엣지 라벨 스타일에 `labelBackgroundColor=#FFFFFF` 필수
- 라벨 폭이 NODE_W를 넘으면 두 줄로 줄바꿈

## 텍스트 컨테인먼트 (HARD CONSTRAINT)

- 모든 도형 스타일에 `whiteSpace=wrap;html=1;` 필수
- 텍스트는 박스 안에 100% 포함 (사방 최소 8px 패딩)
- 안 들어가면 박스를 키우기 — 절대 텍스트 클리핑 금지

## 색상·구조 (의미 기반)

- 색은 상태/타입에 따라 의미 있게만 쓰기 (임의 금지)
- 색이 여러 의미를 가지면 작은 **범례(legend)** 배치
- 관련 도형은 컨테이너/스윔레인으로 묶어 영역 구분

## 실행 워크플로

```
1. create_new_diagram(xml)
   → §1~5 규칙으로 좌표를 공식 산출한 XML 생성

2. export_diagram(path="./_drawio_check.png", format="png")

3. [좌표 검증] — 산술로 1차 필터
   모든 도형 쌍 (A,B)에 대해 겹침 점검:
   overlap = (A.x < B.x+B.w) && (A.x+A.w > B.x)
          && (A.y < B.y+B.h) && (A.y+A.h > B.y)
   겹치면 §1 공식으로 재배치

4. [이미지 검증] — PNG를 열어 육안 확인
   · 화살표가 도형을 관통하는가
   · 엣지끼리 경로가 겹치는가
   · 라벨이 도형/선과 겹치는가
   · 좌우/상하 밸런스가 맞는가
   · 텍스트가 박스를 벗어나는가

5. 문제 발견 시 get_diagram → edit_diagram(operations)으로 수정 → 2번부터 반복
   종료 조건: 좌표 검증 통과 AND 이미지 검증에서 결함 0
```

## 검증 체크리스트 (출력 전 필수)

1. 엣지가 도형을 관통하지 않음
2. 엣지끼리 경로 공유/중복 없음
3. 텍스트 컨테인먼트 — 모든 박스 텍스트가 8px 패딩 안에 100% 포함
4. 라벨이 도형/선과 겹치지 않음
5. 간격·정렬 균일, 모든 요소가 페이지 범위 내
6. XML 유효, 모든 ID 유일
7. AWS 아이콘이면 빈 사각형 없음

## AWS 아키텍처 — 공식 아이콘 (mxgraph.aws4)

AWS 리소스는 일반 박스가 아니라 `mxgraph.aws4` 공식 아이콘 사용.

### resourceIcon 스타일 틀

```
sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;
fillColor={브랜드컬러};strokeColor=#ffffff;dashed=0;html=1;fontSize=12;aspect=fixed;
shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.{아이콘이름};
```

- 아이콘 크기는 78×78 (resourceIcon 표준)
- 카테고리별 fillColor: Networking `#8C4FFF`, Storage `#7AA116`, Security `#DD344C`, Database `#C925D1`

### 빈 아이콘(empty box) 함정 — 반드시 검증

`resIcon=` 의 이름이 설치된 aws4 라이브러리에 **없으면**, draw.io는 **색만 칠해진 빈 사각형**으로 렌더한다. 이미지 검증에서만 보인다.

> 의심되면 후보 이름들을 한 다이어그램에 나열해 export → 어느 게 실제로 그려지는지 눈으로 확정한 뒤 본 다이어그램에 적용.

## 미니 템플릿 (세로 흐름, 3노드 레벨)

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- Level 0: 1노드 → col=1 -->
    <mxCell id="n1" value="Client" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
            vertex="1" parent="1">
      <mxGeometry x="280" y="40" width="200" height="80" as="geometry"/>
    </mxCell>
    <!-- Level 1: 3노드 → col 0,1,2 -->
    <mxCell id="n2" value="Service A" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;"
            vertex="1" parent="1">
      <mxGeometry x="40" y="200" width="200" height="80" as="geometry"/>
    </mxCell>
    <!-- 분기: exitX 분산 -->
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;exitX=0.25;exitY=1;entryX=0.5;entryY=0;"
            edge="1" parent="1" source="n1" target="n2">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

## 안티패턴

- [X] 픽셀 좌표 즉흥 입력 — 공식 위반, 밸런스 깨짐
- [X] exit/entry 생략 — 도형 관통
- [X] 한 도형에서 나가는 다중 엣지의 exitX 동일 — 경로 겹침
- [X] create_new_diagram 으로 기존 다이어그램 수정 — 전체 파괴
- [X] 이미지 검증 생략 — 라벨 미세 겹침 못 잡음

## 관련 스킬

- hexagonal-architecture — 아키텍처 다이어그램의 도메인 패턴
- tech-writer — 문서와 함께 다이어그램 작성
