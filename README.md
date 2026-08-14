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
- 녹화 종료 뒤 영상, 센서별 CSV 3개, 카메라 메타데이터 CSV 1개, `manifest.json`을 하나의 ZIP으로 다운로드
- Apple 모바일에서 `4:3`, `16:9`, `1:1` 촬영 비율 요청
- Apple 모바일에서 `1× 기본` 또는 `0.5× 초광각` 렌즈 선택을 시도하고 선택 결과를 기록
- 렌즈 요청값·실제 카메라 트랙 설정을 별도 `camera.csv`로 저장
- 설치 가능한 PWA 기본 구성과 오프라인 앱 셸 캐시
- GPS 감시 중복을 방지하고 페이지 종료 시 위치·카메라 자원을 정리
- 녹화 오류 또는 영상 데이터 누락 시 잘못된 결과 ZIP 생성을 차단
- 기본 카메라·나침반 아이콘을 PWA 및 홈 화면 아이콘으로 사용

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
├─ capture_...._camera.csv
└─ capture_...._manifest.json
```

센서별 CSV를 분리해 각 파일에 관련 컬럼만 표시합니다. 따라서 스프레드시트에서 방위각, 동작, GPS 데이터를 각각 확인하기 쉽습니다. `camera.csv`는 녹화 세션의 카메라 선택 결과를 한 행으로 기록합니다. 각 CSV의 `t_session_ms`는 녹화 시작 후 경과 시간이며, 센서별 실제 수신 순서를 보존합니다.

## 방위각 처리와 한계

`heading_deg`는 **진북 보정값이 아닌**, 브라우저가 제공하는 기기 나침반의 최선 추정치입니다. 자기편각(WMM)을 이용한 진북 보정, 원시 자력계 XYZ 값, 센서 제조사 보정 상태는 현재 순수 웹앱에서 수집하지 않습니다.

### 촬영 비율

Apple 모바일에서는 카메라 활성화 전에 `4:3`, `16:9`, `1:1` 비율을 선택할 수 있습니다. 이 기능은 `getUserMedia()`의 카메라 `aspectRatio` 요청만 사용하며, 캔버스 변환이나 후처리 영상 회전은 사용하지 않습니다. 브라우저와 카메라 하드웨어가 요청을 반드시 수용하는 것은 아니므로 실제 비율은 활성화 후 화면과 `manifest.json`의 `actual_aspect_ratio`에서 확인합니다. Android에서는 이 비율 요청을 추가하지 않습니다.

### 초광각 렌즈 선택

Apple 모바일에서는 `1× 기본`과 `0.5× 초광각` 버튼을 제공합니다. 카메라 권한을 허용한 뒤 `enumerateDevices()`로 브라우저가 노출한 비디오 장치 목록을 확인하고, 이름에 `Ultra Wide`, `0.5x`, `초광각` 등이 포함된 후면 카메라가 있으면 `deviceId: { exact: ... }`로 해당 장치를 우선 강제 요청합니다. 일반 후면 카메라 역시 가능한 경우 장치 ID로 선택합니다.

Safari가 초광각 렌즈를 별도 장치로 공개하지 않는 기기에서는 물리 렌즈를 웹앱이 강제로 선택할 수 없습니다. 이 경우 후면 카메라를 `facingMode: { exact: "environment" }`로 요청하고, 브라우저가 0.5 줌 제약을 실제로 제공할 때만 보조적으로 적용합니다. 따라서 `camera.csv`의 `selection_status`를 반드시 확인해야 합니다.

`selection_status=selected-device`이면 초광각 후보 장치가 장치 ID로 선택된 상태입니다. `zoom-constraint-only`이면 초광각 장치 ID 대신 브라우저 줌 제약 0.5만 적용된 것이므로 광학 초광각 렌즈 사용을 보장하지 않습니다. `zoom-constraint`이면 요청한 1× 또는 0.5× 줌 제약을 현재 카메라 트랙에 적용한 상태입니다. `environment-fallback`이면 요청을 적용하지 못해 후면 카메라를 다시 연 상태입니다. 브라우저는 실제 초점거리·광학 배율을 제공하지 않으므로 CSV의 `requested_lens`와 `requested_zoom`은 요청값이고, `resolved_lens`와 선택 상태를 함께 해석해야 합니다.

Android에서는 렌즈 선택 로직을 적용하지 않고 기존 `facingMode`, 해상도 제약과 센서 처리 경로를 유지합니다.

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

### 카메라 CSV: `*_camera.csv`

| 컬럼 | 의미 | 단위/값 |
| --- | --- | --- |
| `t_session_ms` | 카메라 설정을 기록한 세션 기준 시점 | ms, 보통 0 |
| `timestamp_utc` | 카메라 메타데이터 기록 시각 | ISO 8601 UTC |
| `camera_facing` | 실제 카메라 트랙이 보고한 방향 | `environment`, `user` 등 |
| `requested_lens` | 사용자가 요청한 렌즈 종류 | `wide`, `ultrawide` |
| `requested_zoom` | 요청한 배율 표기 | `1` 또는 `0.5` |
| `resolved_lens` | 브라우저 결과를 해석한 렌즈 상태 | `wide`, `ultrawide`, `ultrawide-zoom-constraint`, `environment-fallback`, `front-camera`, `not-evaluated` |
| `selected_device_label` | 브라우저가 공개한 선택 장치명 | 문자열, 미공개 시 빈 값 |
| `device_id_present` | 장치 ID를 exact 선택에 사용했는지 여부 | `true` / `false` |
| `selection_method` | 렌즈 선택에 사용한 방법 | `deviceId-exact`, `zoom-constraint`, `facingMode-exact` 등 |
| `selection_status` | 선택 성공 또는 대체 결과 | `selected-device`, `zoom-constraint-only`, `zoom-constraint`, `environment-fallback` 등 |
| `actual_width`, `actual_height` | 실제 카메라 트랙 해상도 | px |
| `actual_aspect_ratio` | 실제 카메라 트랙 화면비 | 비율 |
| `actual_zoom` | 브라우저가 보고한 실제 줌 설정 | 배율, 미지원 시 빈 값 |
| `zoom_min`, `zoom_max` | 브라우저가 보고한 줌 범위 | 배율 |
| `camera_device_count` | 권한 후 확인된 비디오 입력 장치 수 | 개 |
| `note` | 결과 해석을 위한 주의사항 | 문자열 |

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

세션 시작·종료 시각, 내보낸 시각, 영상 파일명·MIME 타입·파일 크기, 센서별 CSV 파일명·컬럼·행 수, 카메라 메타데이터, 마지막으로 표시된 방위값과 품질, 데이터 해석 시 주의사항을 기록합니다.
