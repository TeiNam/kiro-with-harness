---
name: aws-finops
description: >
  AWS cost management and FinOps practice — Cost Explorer, Budgets, Cost Anomaly
  Detection, CUR/data exports, cost allocation tags, Cost Categories, Savings
  Plans vs Reserved Instances, Compute Optimizer / Cost Optimization Hub,
  rightsizing, unit economics, showback/chargeback. Grounded in the FinOps
  Foundation Framework (Inform / Optimize / Operate). Trigger: cost anomaly,
  Savings Plan, Reserved Instance, rightsizing, cost allocation tag, chargeback,
  showback, unit cost, budget alert, CUR, Cost Explorer, unblended/amortized cost,
  RI coverage, commitment, "왜 청구서가 늘었지".
origin: custom
workloads: [finops]
---

# AWS FinOps

비용을 줄이는 게 목표가 아니라 **지출당 비즈니스 가치를 최대화**하는 것이 목표다
(FinOps Foundation). 무조건 싼 것보다, "이 지출이 그만한 가치를 내는가"를 데이터로
답할 수 있게 만드는 실무. 엔지니어링·재무·비즈니스가 같은 숫자를 보고 각자 자기
사용량에 책임지는 문화가 기술의 절반이다.

## When to Activate

- AWS 청구서가 갑자기 늘었거나("왜 늘었지") 예산 초과 알림이 왔을 때
- Savings Plans / Reserved Instance 구매·갱신 결정을 앞뒀을 때
- 팀·서비스·환경별로 비용을 배분(showback/chargeback)해야 할 때
- rightsizing·미사용 리소스 정리 같은 최적화 기회를 찾을 때
- 단위 경제학(요청당·고객당·기능당 비용) 지표를 세우려 할 때
- 태깅 전략·Cost Categories 를 설계할 때

인프라 구성 자체(IAM·VPC·서비스 선택)는 `aws-cloud`, LLM 토큰 비용은
`cost-aware-llm-pipeline`. 이 스킬은 **청구서와 커밋먼트** 계층을 다룬다.

## FinOps 3단계 (Inform → Optimize → Operate)

무엇을 언제 하는지의 뼈대. Crawl/Walk/Run 성숙도와 대응한다.

| 단계 | 질문 | 핵심 활동 |
|------|------|-----------|
| **Inform** | 지금 뭘 얼마나 쓰나? 누구 것인가? | 가시성·태깅·배분·이상탐지. 최적화 전에 **먼저 보이게** 만든다. |
| **Optimize** | 낭비는? 더 싼 방법은? | rightsizing·미사용 정리·커밋먼트(SP/RI)·아키텍처 재배치. |
| **Operate** | 어떻게 지속·자동화하나? | 예산 거버넌스·정기 리뷰·단위 경제학 추적·정책 자동화. |

순서가 중요하다 — **Inform 없이 Optimize 하지 마라.** 태깅·배분이 안 된 상태의
비용 절감은 어디를 건드리는지 모르고 자르는 것이다.

## Inform: 먼저 보이게 만든다

### 비용 데이터 소스 (가벼운 것 → 무거운 것)
- **Cost Explorer** — 콘솔·API 로 필터·그룹핑·예측. 일상 분석의 기본. 히스토리 최대
  13개월 + 예측 18개월, 일/월(유료로 시간) 단위. UI 는 무료지만 **API 는 요청당 $0.01**
  (페이지네이션 주의). 프로그래밍 접근은 `ce:GetCostAndUsage`.
- **Data exports (CUR 2.0)** — 시간별·리소스별 최상세 원장. S3 로 내보내 Athena·
  QuickSight 로 쿼리. **단위 경제학·상세 배분엔 CUR 이 필수** (Cost Explorer 로는 한계).
- **Cost Anomaly Detection** — ML 기반 이상 지출 자동 알림. 서비스별·계정별 모니터를
  걸어두면 "왜 늘었지"를 사후가 아니라 당일에 잡는다. 무료.

### 비용 종류를 구분하라 (오해의 근원)
- **Unblended** — 각 사용에 실제 적용된 요금. 기본값.
- **Amortized** — 선불 커밋먼트(SP/RI)를 사용 기간에 분산. **커밋먼트가 있으면
  amortized 로 봐야** 팀별 실질 비용이 왜곡되지 않는다.
- **Blended** — 조직 평균 단가. 대개 볼 일 없음(오해 유발, 지양).
- **Net** — 크레딧·할인 반영 후. 실제 낼 돈에 가장 가까움.

### 태깅 = FinOps 의 토대
- **Cost allocation tags** 를 활성화해야 Cost Explorer·CUR 에서 태그별 필터가 된다
  (활성화 전 태그는 소급 안 됨 — 일찍 켤수록 이득).
- 최소 3축 권장: `team`(또는 cost-center) · `env`(prod/stg/dev) · `service`(또는 app).
- 태그 미준수 리소스는 "untagged" 로 새므로, **AWS Organizations 태그 정책**이나 SCP·
  IaC 기본 태그로 강제. 미태깅 비율을 KPI 로 추적.
- **Cost Categories** — 태그만으로 안 되는 그룹핑(여러 계정·태그를 규칙으로 묶기,
  공유비용 split charge). 조직 구조가 태그와 1:1 이 아닐 때.

## Optimize: 낭비 제거 → 커밋먼트

우선순위: **미사용 삭제 > rightsizing > 커밋먼트 구매**. 커밋먼트를 먼저 사면
낭비를 1~3년 고정한다. 줄일 걸 줄인 뒤에 남는 안정 사용량에만 커밋한다.

### 추천 엔진
- **Cost Optimization Hub** — 미사용 리소스 삭제·rightsizing·SP/RI 추천을 한곳에
  모아 예상 절감액까지. 최적화의 시작점.
- **Compute Optimizer** — EC2·EBS·Lambda·ECS(Fargate) 를 실제 사용률 기반으로
  rightsizing 추천. over-provisioned 인스턴스 축소.

### Savings Plans vs Reserved Instances
안정적으로 꾸준한 사용량에만. 결정 기준:

| | Savings Plans | Reserved Instances |
|--|--------------|--------------------|
| 유연성 | **Compute SP**: 높음(패밀리·리전·OS 바뀌어도 적용). **EC2 Instance SP**: 중간(리전 내 패밀리 고정) | 낮음(특정 조건 고정) |
| 대상 | Compute SP(EC2·Fargate·Lambda), EC2 Instance SP(EC2 전용) | EC2·RDS·Redshift·ElastiCache·OpenSearch. DynamoDB 는 RI 가 아니라 별도 "reserved capacity" |
| 권장 | **대부분의 경우 SP 우선** — 워크로드가 변해도 할인 유지 | RDS·Redshift 등 SP 미지원 서비스, 또는 변동 없는 고정 워크로드 |

- **커버리지**(커밋으로 덮인 사용 비율)와 **유틸리제이션**(산 커밋을 실제로 쓴 비율)을
  둘 다 본다. 유틸이 낮으면 과잉 구매(돈 낭비), 커버리지가 낮으면 절감 기회 잔존.
- 1년 no-upfront 부터 시작해 안정성이 확인되면 3년·upfront 로. 처음부터 3년 all-upfront 는
  예측이 확실할 때만.
- 구매 전 **Purchase analysis**(what-if)로 시뮬레이션. 커밋은 되돌리기 어렵다.

### 흔한 낭비 (체크리스트)
- [ ] 미연결 EBS 볼륨·오래된 스냅샷·미사용 Elastic IP
- [ ] 유휴 RDS/Redshift(껐다 켤 수 있는 비프로덕션은 스케줄 정지)
- [ ] gp2 → gp3 EBS 전환(GB당 ~20% 저렴). 단 gp3 기본 3000 IOPS/125MB·s 를 넘는 큰
      gp2 볼륨은 초과분을 추가 프로비저닝해야 성능이 유지된다(그래도 대개 이득).
- [ ] S3 라이프사이클 미설정(→ IA/Glacier 계층화), 미완료 멀티파트 업로드
- [ ] over-provisioned 인스턴스(Compute Optimizer 추천 반영)
- [ ] NAT Gateway 데이터 처리 비용(VPC endpoint 로 우회 가능한지)
- [ ] 개발/스테이징의 24/7 상시 가동(업무시간 외 정지 스케줄)

## Operate: 지속·거버넌스

### 예산과 알림
- **AWS Budgets** — 비용·사용량·SP/RI 커버리지·유틸에 임계값을 걸고 알림.
  실제뿐 아니라 **예측 기반**(이대로면 월말 초과) 알림도. 팀별 예산을 태그/Cost
  Category 로 스코프.
- Budgets Actions 로 임계 초과 시 IAM 정책 적용·EC2 중지 등 자동 대응(신중히).

### 단위 경제학 (FinOps 의 성숙 지표)
- 총액이 아니라 **비즈니스 단위당 비용**을 본다: 요청 1천건당·활성 사용자당·주문당·
  기능당 $. 총비용이 늘어도 단위비용이 줄면 건강한 성장.
- CUR + 비즈니스 메트릭(요청 수 등)을 조인해 산출. 이 지표가 엔지니어링과 재무의
  공통 언어가 된다.

### Showback vs Chargeback
- **Showback** — 각 팀에 "당신들이 이만큼 썼다"를 보여줌(청구 안 함). 책임감 형성의 시작.
- **Chargeback** — 실제로 팀 예산에 전가. 조직이 성숙했을 때. 공유비용(로그·네트워크·
  관리계정) 배분 규칙(Cost Categories split charge)이 선결.
- 리셀러·복잡한 재청구는 **Billing Conductor**(showback/chargeback 전용 서비스).

## IAM: 비용 데이터 접근 (최소권한)
- 비용 데이터는 민감하다. read-only 부터: `ce:Get*`, `ce:Describe*`, `budgets:View*`,
  `cur:DescribeReportDefinitions`, `cost-optimization-hub:ListRecommendations`.
- 멤버 계정의 Cost Explorer 접근은 관리계정의 **Cost Management preferences** 로 제어.
- 프로덕션 결제 설정 변경(커밋 구매·예산 삭제)은 write 권한이 필요하며, 사람 승인
  게이트를 둔다 — 커밋 구매는 되돌리기 어렵다.

## 안티패턴
- **가시성 없이 자르기** — 태깅·배분 전에 비용부터 줄이면 뭘 죽이는지 모른다(Inform 먼저).
- **커밋 과잉 구매** — 줄일 낭비를 안 줄이고 커밋부터 사면 낭비를 1~3년 고정.
- **blended cost 로 팀 비용 판단** — 커밋먼트가 있으면 amortized 로 봐야 한다.
- **일회성 절감 이벤트** — FinOps 는 프로젝트가 아니라 상시 운영(Operate). 정기 리뷰 루틴.
- **중앙팀이 다 결정** — FinOps 는 중앙이 *enable* 하고 결정은 리소스 소유 팀이. 분산 책임.

## 참고 (1차 출처)
- FinOps Foundation Framework — <https://www.finops.org/framework/> (도메인·capabilities·
  Inform/Optimize/Operate. CC BY 4.0).
- AWS Billing and Cost Management User Guide —
  <https://docs.aws.amazon.com/cost-management/latest/userguide/what-is-costmanagement.html>
- 프로그래밍 접근: `aws ce`, `aws budgets`, `aws cost-optimization-hub`, Price List API.
  MCP 로는 `aws-billing-cost-management`·`aws-pricing`(finops 워크로드) 서버.
