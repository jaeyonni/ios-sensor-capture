# Capture Log — iPhone-first PWA MVP

GitHub Pages 또는 HTTPS 서버에 이 폴더를 그대로 배포하면 되는 의존성 없는 정적 웹앱입니다.

## GitHub Pages 배포

1. 이 폴더의 내용을 새 GitHub 저장소의 루트에 올립니다.
2. GitHub 저장소 **Settings → Pages → Build and deployment**에서 **GitHub Actions**를 선택합니다.
3. `main` 브랜치에 푸시하면 포함된 배포 워크플로가 Pages 주소를 생성합니다.

카메라·위치·방향 센서는 보안 컨텍스트가 필요하므로, `file://`로 열지 말고 GitHub Pages 같은 HTTPS 주소에서 실행하세요.

## 기능

- 후면 카메라 중심의 전체 화면 미리보기와 영상 녹화
- iPhone Safari의 동작/방향 권한 요청 및 `webkitCompassHeading` 우선 기록
- GPS 위치, 기기 방향, 가속도/중력/회전률을 세션 시간축으로 CSV 기록
- 녹화 종료 뒤 영상, `orientation.csv`, `motion.csv`, `gps.csv`, `manifest.json`을 하나의 ZIP으로 다운로드
- 설치 가능한 PWA 기본 구성과 오프라인 앱 셸 캐시

## iPhone에서 테스트

1. HTTPS 주소로 접속합니다. GitHub Pages를 권장합니다.
2. Safari에서 **카메라 및 센서 활성화**를 누르고 카메라·위치·동작 및 방향 권한을 허용합니다.
3. 빨간 녹화 버튼을 눌러 녹화하고, 다시 눌러 종료합니다.
4. **데이터 다운로드**를 눌러 파일을 받습니다. Safari의 다운로드 목록 또는 파일 앱에서 확인합니다.

## 데이터 의미와 한계

- `heading_deg`는 카메라의 측량 기준 방위가 아니라 기기 나침반에서 브라우저가 제공하는 최선 추정치입니다.
- `source=webkitCompassHeading` 또는 `deviceorientationabsolute`일 때만 절대 방위 후보입니다. `alpha-derived`는 상대 방위일 수 있으므로 분석에서 분리하세요.
- `course_deg`는 GPS 이동 방향이며 카메라 방위가 아닙니다.
- 브라우저와 기기에 따라 영상 형식은 MP4 또는 WebM입니다. 실제 MIME 타입은 `manifest.json`에 기록됩니다.
- 금속, 자석 케이스, 차량 실내 등의 자기 간섭은 웹에서 완전히 보정할 수 없습니다.
