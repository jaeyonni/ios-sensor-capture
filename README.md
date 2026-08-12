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
- GPS 위치, 기기 방향, 가속도/중력/회전률을 센서별 CSV로 기록
- 녹화 종료 뒤 영상, 센서별 CSV 3개, `manifest.json`을 하나의 ZIP으로 다운로드
- 설치 가능한 PWA 기본 구성과 오프라인 앱 셸 캐시

## iPhone에서 테스트

1. HTTPS 주소로 접속합니다. GitHub Pages를 권장합니다.
2. Safari에서 **카메라 및 센서 활성화**를 누르고 카메라·위치·동작 및 방향 권한을 허용합니다.
3. 빨간 녹화 버튼을 눌러 녹화하고, 다시 눌러 종료합니다.
4. **데이터 다운로드**를 눌러 파일을 받습니다. Safari의 다운로드 목록 또는 파일 앱에서 확인합니다.

## 다운로드 결과

다운로드 버튼은 파일을 여러 번 받는 대신 한 개의 `capture_YYYY-MM-DD...zip` 파일을 생성합니다.

```text
capture_YYYY-MM-DD...zip
├─ capture_....mp4 또는 capture_....webm
├─ capture_...._orientation.csv
├─ capture_...._motion.csv
├─ capture_...._gps.csv
└─ capture_...._manifest.json
```

센서별 CSV를 분리해 각 파일에 관련 컬럼만 표시합니다. 따라서 스프레드시트에서 방위각, 동작, GPS 데이터를 각각 확인하기 쉽습니다. 각 CSV의 `t_session_ms`는 녹화 시작 후 경과 시간이며, 센서별 실제 수신 순서를 보존합니다.

## 방위각 처리와 한계

`heading_deg`는 **진북 보정값이 아닌**, 브라우저가 제공하는 기기 나침반의 최선 추정치입니다. 자기편각(WMM)을 이용한 진북 보정, 원시 자력계 XYZ 값, 센서 제조사 보정 상태는 현재 순수 웹앱에서 수집하지 않습니다.

### iPhone Safari

- iPhone은 `webkitCompassHeading`을 우선 사용합니다.
- 이 값은 기기 나침반의 자기북 기준 방위 후보이며, iPhone에서 비교적 안정적으로 제공되는 경우가 많습니다.
- `heading_formula`은 `webkitCompassHeading`으로 기록됩니다.

### Android Chrome

- `deviceorientationabsolute` 이벤트 또는 `event.absolute === true`일 때만 절대 방위 후보로 취급합니다.
- 단순히 `360 - alpha`를 쓰지 않고 `alpha`, `beta`, `gamma` 전체에 [W3C 기울기 보정 나침반 공식](https://www.w3.org/TR/2023/WD-orientation-event-20231110/#a1-calculating-compass-heading)을 적용합니다. 따라서 태블릿이 수직 또는 기울어진 상태에서도 카메라 방향에 가까운 수평 방위를 계산합니다.
- 절대 이벤트에 화면 회전값을 더하지 않습니다. 이전 방식처럼 세로/가로 전환 때문에 0° 또는 90°로 치우치는 문제를 피하기 위한 처리입니다.
- 절대 이벤트가 한 번 수신된 뒤에는 뒤늦은 상대 이벤트가 방위값을 덮어쓰지 못합니다.
- Android 기기/브라우저가 상대 방향만 제공하면 `heading_deg`는 빈 값이고 `source=deviceorientation-relative`, `quality=relative-warning`으로 기록됩니다. 이 경우 실제 나침반 방위각으로 사용하면 안 됩니다.

### 현장 사용 권장사항

- 촬영 중 기기를 세로·가로로 계속 바꾸지 말고 한 방향으로 고정합니다.
- 금속, 자석 케이스, 차량 실내, 전자기기 가까이에서는 나침반이 흔들릴 수 있습니다.
- Android에서는 화면의 방위각 아래에 `deviceorientationabsolute · best-effort-absolute`가 표시되는지 확인합니다.
- `course_deg`는 GPS 이동 방향이지 카메라가 보는 방향이 아닙니다.

## CSV 컬럼 정의

CSV는 UTF-8(BOM) 인코딩입니다. `t_session_ms`는 녹화 시작 후 해당 이벤트까지의 경과 시간입니다. 센서의 갱신 주기가 서로 다르므로 각 파일은 실제 수신된 센서 이벤트만 기록합니다.

### 방위 CSV: `*_orientation.csv`

| 컬럼 | 의미 | 단위/값 |
| --- | --- | --- |
| `t_session_ms` | 녹화 시작 후 해당 이벤트까지의 경과 시간 | ms |
| `timestamp_utc` | 이벤트 기록 시각 | ISO 8601 UTC |
| `heading_deg` | 계산된 기기/카메라 방향의 수평 방위 후보 | 도, 북=0·동=90·시계 방향 |
| `source` | 방위각 데이터 출처 | `webkitCompassHeading`, `deviceorientationabsolute`, `deviceorientation-relative` |
| `heading_formula` | `heading_deg` 계산 방식 | `webkitCompassHeading`, `w3c-tilt-compensated`, `not-calculated` |
| `event_type` | 브라우저 이벤트 이름 | `deviceorientation` 또는 `deviceorientationabsolute` |
| `is_absolute` | 브라우저가 절대 방향이라고 표시했는지 여부 | `true` / `false` |
| `alpha_deg` | 기기 Z축 회전 | 도 |
| `beta_deg` | 기기 X축 회전(앞뒤 기울기) | 도 |
| `gamma_deg` | 기기 Y축 회전(좌우 기울기) | 도 |
| `screen_rotation_deg` | 이벤트 시점의 화면 회전 상태 | 0, 90, 180, 270도 |
| `quality` | 데이터 품질 분류 | `best-effort-absolute` 또는 `relative-warning` |

`heading_deg`가 빈 값이거나 `quality=relative-warning`이면 분석에서 방위각을 제외하세요.

### 동작 CSV: `*_motion.csv`

| 컬럼 | 의미 | 단위 |
| --- | --- | --- |
| `t_session_ms` | 녹화 시작 후 경과 시간 | ms |
| `timestamp_utc` | 이벤트 기록 시각 | ISO 8601 UTC |
| `acceleration_x_ms2`, `acceleration_y_ms2`, `acceleration_z_ms2` | 중력을 제외한 기기 X/Y/Z 축 가속도 | m/s² |
| `gravity_x_ms2`, `gravity_y_ms2`, `gravity_z_ms2` | 중력을 포함한 기기 X/Y/Z 축 가속도 | m/s² |
| `rotation_alpha_dps`, `rotation_beta_dps`, `rotation_gamma_dps` | 각 축 회전 속도 | 도/s |
| `interval_ms` | 브라우저가 보고한 센서 이벤트 간격 | ms |

축은 기기의 표준 화면 방향을 기준으로 합니다. 기기 또는 브라우저가 특정 센서값을 제공하지 않으면 빈 값으로 남습니다.

### GPS CSV: `*_gps.csv`

| 컬럼 | 의미 | 단위/값 |
| --- | --- | --- |
| `t_session_ms` | 녹화 시작 후 GPS 수신까지의 경과 시간 | ms |
| `timestamp_utc` | 위치 측정 시각 | ISO 8601 UTC |
| `latitude`, `longitude` | WGS84 위도·경도 | 도 |
| `altitude_m` | 고도 | m |
| `horizontal_accuracy_m` | 수평 위치의 예상 오차 반경 | m |
| `altitude_accuracy_m` | 고도의 예상 오차 | m |
| `speed_mps` | 이동 속도 | m/s |
| `course_deg` | 이동 방향 | 도, 북=0·동=90·시계 방향 |

`horizontal_accuracy_m`가 큰 행은 위치가 흔들릴 수 있습니다. `course_deg`는 정지 상태에서는 비어 있을 수 있고, 기기 방위각과 다른 값입니다.

### CSV 읽기 예시

`orientation.csv` 예시:

```csv
t_session_ms,timestamp_utc,heading_deg,source,quality
100.2,2026-08-12T01:00:00.100Z,78.4,webkitCompassHeading,best-effort-absolute
```

`gps.csv` 예시:

```csv
t_session_ms,timestamp_utc,latitude,longitude,horizontal_accuracy_m
1220.5,2026-08-12T01:00:01.221Z,37.56650,126.97800,4.2
```

### `manifest.json`

세션 시작·종료 시각, 내보낸 시각, 영상 파일명·MIME 타입·파일 크기, 센서별 CSV 파일명·컬럼·행 수, 마지막으로 표시된 방위값과 품질, 데이터 해석 시 주의사항을 기록합니다.
