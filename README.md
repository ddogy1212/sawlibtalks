# SAWLIB TALKS 문화번역 게임 — GitHub Pages 최종본

이 폴더를 GitHub 저장소의 루트에 그대로 업로드하면 됩니다.
별도의 Google Sheet / Apps Script 연결은 필요하지 않습니다.

## 이번 수정
- 프랑스 라운드의 나무를 인물 뒤쪽 레이어로 배치해 사람을 가리지 않도록 수정
- 빛나는 돌은 매 게임 시작/초기화 때마다 **세 나무 중 무작위 한 나무 아래**에 숨겨짐
- 러시아 치과 라운드에서 조작할 주인공 위에 **‘나’** 표시 추가
- 주인공을 치료실 문 앞의 넓은 범위에 대충 놓아도 성공하도록 판정 범위 확대
- 응모 정보는 이미 연결된 Supabase의 `sawlib_talks_entries` 테이블에 저장됨
- 공개 GitHub 코드에는 응모자의 이름/전화번호가 기록되지 않음
- 데이터베이스는 익명 사용자의 INSERT만 허용하고 SELECT/UPDATE/DELETE는 허용하지 않도록 RLS 적용

## GitHub Pages 올리는 법
1. GitHub에서 새 저장소를 만듭니다.
2. 이 폴더 안의 파일을 전부 저장소 최상단에 업로드합니다.
3. 저장소에서 `Settings` → `Pages`로 이동합니다.
4. `Build and deployment`에서 `Deploy from a branch`를 고릅니다.
5. Branch를 `main`, 폴더를 `/(root)`로 선택하고 Save를 누릅니다.
6. 잠시 후 표시되는 GitHub Pages 주소로 접속합니다.

`index.html`이 저장소 최상단에 있어야 합니다.

## 응모 저장 위치
응모자는 마지막 화면에서 이름과 전화번호를 입력합니다. 저장 성공 시 중앙 데이터베이스에 다음 정보가 보관됩니다.
- 제출 시각
- 이름
- 전화번호
- 브라우저별 제출 ID
- 이벤트명
- 브라우저 정보

현재 저장 위치:
- Supabase 프로젝트: `orbit-keepsake-print`
- 테이블: `public.sawlib_talks_entries`

Supabase 대시보드의 **Table Editor → sawlib_talks_entries**에서 응모 목록을 확인할 수 있습니다.

### 개인정보 주의
이름과 전화번호는 행사 추첨 및 당첨자 연락 목적으로만 사용하고, 행사 종료 후 삭제하세요.
응모 데이터는 GitHub 저장소나 브라우저 Local Storage에 개인정보 형태로 저장하지 않습니다.

## 테스트
1. GitHub Pages에서 게임 두 라운드를 모두 클리어합니다.
2. 테스트용 이름과 본인 번호를 입력해 응모합니다.
3. `응모가 저장되었습니다.` 메시지를 확인합니다.
4. Supabase Table Editor에서 새 행이 생겼는지 확인합니다.

한 브라우저에서는 중복 응모를 막도록 되어 있습니다.
