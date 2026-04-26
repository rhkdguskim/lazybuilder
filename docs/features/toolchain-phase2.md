# Toolchain Resolver Phase 2 — VS Build Tools / Windows SDK / CMake

> Phase 1(.NET only)에서 한 단계 확장. C++/MSBuild 빌드 환경에서 가장 큰 고통 지점인 VS Build Tools, Windows SDK, CMake를 propose→confirm→install 흐름으로 자동화.

## 1. 목적

### 1.1 풀 문제
- "Build Tools 없음" 진단을 LazyBuilder가 *식별*만 하고 사용자에게 떠넘기던 부분 해결
- VS Build Tools 설치는 **워크로드 매트릭스가 복잡**해서 사람도 망설임 — LazyBuilder가 프로젝트 분석 결과로 정확한 워크로드 셋만 자동 선택
- Windows SDK 버전 풀이 복잡 — `.vcxproj` `<WindowsTargetPlatformVersion>`에서 정확한 버전 추출
- CMake/Ninja는 winget 한 줄로 끝나지만 사용자는 직접 안 함 → 자동화

### 1.2 성공의 정의 (MVP)
1. 빈 Windows + 어떤 `.vcxproj` 솔루션 → `lazybuilder --toolchain-apply --yes`로 빌드 가능 상태 도달
2. VS Build Tools 워크로드는 프로젝트가 *실제로 요구하는* 것만 설치 (전체 매트릭스 아님)
3. CMake / Ninja는 winget 자동 호출
4. UAC는 VS Build Tools / Windows SDK에서 1번씩만 (machine scope 강제)

## 2. 범위

### 2.1 MVP (이 사이클)
- **VS Build Tools** detection 강화 (vswhere 결과 기반) + install via `vs_BuildTools.exe` (Microsoft 공식 부트스트랩)
- **Windows SDK** detection 강화 (레지스트리 + 폴더 스캔) + install via `winget` 또는 직접 ISO 다운로드 권장
- **CMake** install via `winget install Kitware.CMake`
- **Ninja** install via `winget install Ninja-build.Ninja`
- 새 `ToolchainKind`: `'msvc-toolset' | 'windows-sdk' | 'cmake' | 'ninja'`
- 요구사항 resolver 확장: `.vcxproj` `PlatformToolset` + `WindowsTargetPlatformVersion` → 요구사항
- 기존 propose 모달이 새 step 종류를 그대로 표시 (UI 변경 최소)

### 2.2 비-MVP
- VS 풀 IDE 설치 (Build Tools만 지원)
- vcpkg / Conan 자동 셋업 (별도 트랙)
- macOS / Linux native toolchain (Phase 3)

## 3. 데이터 모델 확장

### 3.1 `ToolchainKind` 확장

```ts
// src/domain/models/ToolchainRequirement.ts
export type ToolchainKind =
  | 'dotnet-sdk'
  | 'dotnet-runtime'
  | 'dotnet-workload'
  | 'msvc-toolset'      // NEW — VS Build Tools workload + MSVC version
  | 'windows-sdk'        // NEW
  | 'cmake'              // NEW
  | 'ninja';             // NEW
```

### 3.2 새 step subkind 정보

`InstallStep`에 새 필드 추가하지 않고 `kind` + `version` + `command`로 구분.

| kind | versionSpec 예 | source.url |
|---|---|---|
| `msvc-toolset` | `v143` (PlatformToolset) | `https://aka.ms/vs/17/release/vs_BuildTools.exe` |
| `windows-sdk` | `10.0.22621.0` | `winget://Microsoft.WindowsSDK.10.0.22621` |
| `cmake` | `3.28.0` | `winget://Kitware.CMake` |
| `ninja` | `latest` | `winget://Ninja-build.Ninja` |

## 4. 요구사항 resolver 확장

`src/domain/rules/toolchainRules.ts`에 추가:

### 4.1 `.vcxproj` 분석

```ts
for (const proj of cppProjects) {
  // PlatformToolset → MSVC requirement
  if (proj.platformToolset) {
    addDraft('msvc-toolset', proj.platformToolset, {
      source: 'csproj',  // 실제로는 vcxproj
      filePath: proj.filePath,
      detail: `PlatformToolset=${proj.platformToolset}`,
      affectedProjects: [proj.name],
    });
  }
  
  // WindowsTargetPlatformVersion → Windows SDK requirement
  if (proj.windowsSdkVersion) {
    addDraft('windows-sdk', proj.windowsSdkVersion, {
      source: 'csproj',
      filePath: proj.filePath,
      detail: `WindowsTargetPlatformVersion=${proj.windowsSdkVersion}`,
      affectedProjects: [proj.name],
    });
  }
}
```

### 4.2 CMake 프로젝트 분석

```ts
for (const proj of cmakeProjects) {
  addDraft('cmake', '>=3.20', { ... });  // 또는 cmake_minimum_required에서 추출
  // ninja는 generator로 명시되거나 기본값일 때만
}
```

## 5. Installer 확장

### 5.1 `VsBuildToolsInstaller`

```ts
// src/infrastructure/installer/VsBuildToolsInstaller.ts
export class VsBuildToolsInstaller {
  // Microsoft 공식: vs_BuildTools.exe --add <workloadId> --quiet --wait
  
  buildArgs(toolset: string, projectKinds: Set<'cpp' | 'cli' | 'cmake'>): string[] {
    const workloads: string[] = [];
    if (projectKinds.has('cpp')) workloads.push('Microsoft.VisualStudio.Workload.VCTools');
    if (projectKinds.has('cli')) workloads.push('Microsoft.VisualStudio.Workload.NativeDesktop');
    if (projectKinds.has('cmake')) workloads.push('Microsoft.VisualStudio.Component.VC.CMake.Project');
    
    return [
      '--quiet', '--wait', '--norestart', '--nocache',
      ...workloads.flatMap(id => ['--add', id]),
    ];
  }
  
  // 부트스트랩 다운로드 → 캐시 → 실행 (machine scope, UAC 필요)
}
```

### 5.2 `WingetInstaller` (CMake / Ninja / Windows SDK)

```ts
// src/infrastructure/installer/WingetInstaller.ts
export class WingetInstaller {
  async install(packageId: string, version?: string): Promise<{exitCode: number}> {
    const args = ['install', packageId, '--silent', '--accept-package-agreements', '--accept-source-agreements'];
    if (version) args.push('--version', version);
    return runCommand('winget', args, { timeout: TIMEOUTS.HEAVY_INSTALL });
  }
  
  async isAvailable(): Promise<boolean> {
    const r = await runCommand('winget', ['--version'], { timeout: TIMEOUTS.QUICK_PROBE });
    return r.exitCode === 0;
  }
}
```

## 6. UAC 정책

| 항목 | Scope | UAC 필요 |
|---|---|---|
| .NET SDK | user (default) | ✗ |
| VS Build Tools | machine only | ✓ (1회) |
| Windows SDK | machine only | ✓ (1회, winget이 elevation 자동) |
| CMake | user (winget user scope) | 필요시 1회 |
| Ninja | user | ✗ |

→ 한 번의 install plan 안에 admin 단계가 있으면 propose 카드에 명시. 사용자가 OK 하면 admin step 직전 1번만 UAC.

## 7. propose 카드 변화

```
┌─ Toolchain Setup ──────────────────────────────────┐
│ 4 items · 2.4 GB · ~12 min · requires admin (3)    │
├────────────────────────────────────────────────────┤
│ [✓] .NET SDK 8.0.405                  280 MB  user │
│ [✓] VS 2022 Build Tools v143         1.7 GB  admin │
│     workloads: VCTools                              │
│ [✓] Windows SDK 10.0.22621.0          340 MB admin │
│ [✓] CMake 3.28.0                       32 MB user  │
└────────────────────────────────────────────────────┘
```

## 8. 통합 지점

- **Diagnostics 룰**: `cppRules.ts`가 이미 PlatformToolset/Windows SDK 누락 진단 — 이걸 새 ToolchainKind에 매핑
- **LSP Phase C-3 codeAction (B1)**: 이번 사이클 후엔 C++ 진단도 자동 quick-fix 가능
- **MCP `toolchain_plan/apply`**: 이미 있음 — 새 kind도 그대로 통과
- **Build Intelligence**: 새 kind 설치도 metric에 기록 (`toolchainHash` 변화 → 회귀 attribution 정확도 ↑)

## 9. 비기능

| 항목 | 목표 |
|---|---|
| VS Build Tools install | 5-10분 (워크로드 1개 기준) |
| Windows SDK install | 3-5분 |
| CMake/Ninja install | 30초-1분 |
| 부분 실패 처리 | 다른 종류 step은 계속 진행 (--continue-on-error) |
| 부트스트랩 캐시 | `~/.lazybuilder/cache/vs_BuildTools.exe` 24h |

## 10. 수용 기준 (DoD)

- [ ] 빈 Windows + `.vcxproj` (PlatformToolset v143) → propose 카드에 VS Build Tools step 표시
- [ ] step.command 미리보기에 `vs_BuildTools.exe --add Microsoft.VisualStudio.Workload.VCTools ...`
- [ ] `--toolchain-apply --yes` 실행 시 UAC 1회 + 설치 완료
- [ ] 설치 후 재스캔에서 `cpp.toolsets`에 v143 등장
- [ ] `winget` 미설치 환경에서 명확한 에러 메시지
- [ ] `--toolchain-plan --json` 출력에 새 kind 들이 안정 스키마로 등장
- [ ] 기존 .NET 전용 흐름이 깨지지 않음 (regression 0)
