# LazyBuilder for .NET / MSBuild TUI - 요구사항 명세서

## 1. 문서 개요

### 1.1 시스템명
가칭: LazyBuilder for .NET / MSBuild TUI

### 1.2 목적
개발자가 Visual Studio IDE를 실행하지 않고도 터미널 환경에서 다음을 수행할 수 있도록 지원한다.
- 현재 PC의 빌드 가능 상태를 진단
- C# / C++ 개발환경 구성을 한눈에 확인
- 솔루션/프로젝트별 빌드 진입점 파악
- msbuild, dotnet build, cmake --build 등을 일관된 UX로 실행
- 빌드 실패 시 원인과 누락 구성요소를 빠르게 파악

### 1.3 배경
기존 CLI 도구는 강력하지만 다음 문제가 있다.
- 현재 시스템에 설치된 SDK / Toolset / Build Tools 상태를 한 번에 보기 어려움
- C#과 C++ 환경이 분리되어 관리됨
- 어떤 빌드 명령을 써야 하는지 프로젝트별로 판단이 필요함
- PATH, workload, vcvars, Windows SDK, TargetFramework 등의 누락을 빌드 후에야 발견함
- Visual Studio 없이도 빌드 가능 여부를 사전에 확인하고 싶음

본 시스템은 이를 해결하기 위한 환경 진단 + 빌드 실행 + 로그 분석형 TUI이다.

## 2. 제품 비전

### 2.1 제품 목표
사용자가 프로그램 실행 후 10초 이내에 아래를 파악할 수 있어야 한다.
- 이 PC에서 .sln, .csproj, .vcxproj, CMakeLists.txt를 빌드할 수 있는가
- 어떤 툴체인과 SDK가 설치되어 있는가
- 어떤 명령(dotnet build, msbuild, cmake --build)을 써야 하는가
- 어떤 환경이 누락되어 있는가
- 현재 프로젝트가 C#, C++, 혼합 솔루션 중 무엇인가

### 2.2 핵심 가치
- **가시성**: 설치 상태와 빌드 가능 상태를 한눈에 보여줌
- **경량성**: IDE 없이 터미널에서 해결
- **일관성**: 여러 빌드 시스템을 하나의 UX로 통합
- **진단성**: 실패 전에 문제를 발견
- **확장성**: 향후 test, publish, pack, deploy까지 확장 가능

## 3. 대상 사용자

### 3.1 1차 대상
- Windows 기반 C# / C++ 개발자
- Visual Studio IDE를 항상 띄우고 싶지 않은 개발자
- 빌드 서버/개발 PC 상태를 빠르게 진단하려는 엔지니어
- VMS/VNC/Windows API/C++/C# 혼합 프로젝트를 다루는 개발자

### 3.2 2차 대상
- CI 환경을 로컬에서 재현하려는 개발자
- Build Tools만 설치된 머신을 운영하는 엔지니어
- 멀티 솔루션/멀티 SDK 환경을 관리하는 팀

## 4. 시스템 범위

### 4.1 포함 범위
- TUI 기반 대시보드
- 로컬 개발환경 탐지
- 솔루션/프로젝트 스캔
- 빌드 명령 추천 및 실행
- 로그 출력/필터링/에러 요약
- 환경 이상 진단
- C# / C++ / 혼합 프로젝트 지원

### 4.2 제외 범위
- 코드 편집기 기능
- 디버거 기능
- Visual Designer 기능
- 완전한 IDE 대체
- 원격 빌드 오케스트레이션
- 패키지 복원 UI의 완전 자동화

## 5. 주요 사용 시나리오

### 5.1 시나리오 A: 개발환경 상태 점검
사용자는 TUI를 실행하고 첫 화면에서 다음을 본다.
- .NET SDK 버전 목록
- MSBuild 경로 및 버전
- Visual Studio/Build Tools 설치 여부
- VC++ toolset 존재 여부
- Windows SDK 설치 여부
- cl.exe, link.exe, cmake, ninja 사용 가능 여부
- PATH 및 주요 환경변수 상태

### 5.2 시나리오 B: 솔루션 자동 탐지
사용자가 특정 디렉터리를 열면 시스템은 자동으로 탐지한다.
- .sln, .csproj, .vcxproj
- Directory.Build.props, global.json
- nuget.config, packages.config
- CMakeLists.txt, vcpkg.json, conanfile.*

그리고 가장 적합한 빌드 진입점을 추천한다.

### 5.3 시나리오 C: 빌드 실행
사용자는 TUI에서 target, configuration, platform을 선택 후 빌드를 실행한다.
- `dotnet build MyApp.sln -c Release`
- `msbuild MyNativeApp.vcxproj /p:Configuration=Debug /p:Platform=x64`
- `cmake --build build --config Release`

### 5.4 시나리오 D: 실패 원인 분석
빌드 실패 시 시스템은 아래를 요약한다.
- missing SDK / workload / Windows SDK
- vcvars 미설정
- NuGet restore 필요
- target framework 미설치
- platform mismatch / toolset mismatch

### 5.5 시나리오 E: 혼합 솔루션 분석
혼합 솔루션에서 C# 프로젝트와 C++ 프로젝트를 구분하여 보여주고, 각 프로젝트가 어떤 빌드 도구에 의존하는지 표시한다.

## 6. 기능 요구사항

### 6.1 대시보드 기능

#### 6.1.1 시스템 개요 패널
- OS 정보, CPU 아키텍처, 현재 shell
- 작업 디렉터리, Git 브랜치
- 사용자/호스트, PATH 일부 요약

#### 6.1.2 .NET 환경 패널
- 설치된 .NET SDK / Runtime 목록
- global.json 존재 여부 및 고정 SDK 버전
- dotnet --info 핵심 정보
- 설치된 workload 목록
- target framework 지원 추정 상태

#### 6.1.3 MSBuild / Visual Studio 패널
- msbuild.exe 탐지 결과 (버전, 설치 경로)
- Visual Studio / Build Tools 에디션
- vswhere 기반 탐지 결과
- x86/x64 MSBuild 구분
- Developer Command Prompt 필요 여부

#### 6.1.4 C++ Toolchain 패널
- cl.exe, link.exe, lib.exe, rc.exe, dumpbin.exe
- toolset version, MSVC toolset (v143 등)
- vcvarsall.bat / VsDevCmd.bat 경로
- 현재 세션에서 VC 환경 활성화 여부

#### 6.1.5 SDK / Build Dependency 패널
- Windows SDK 버전들
- CMake, Ninja, Git, NuGet 설치 여부
- vcpkg, Conan 존재 여부
- PowerShell / pwsh 사용 가능 여부

### 6.2 프로젝트 스캔 기능

#### 6.2.1 파일 구조 탐지
.sln, .csproj, .fsproj, .vbproj, .vcxproj, CMakeLists.txt, global.json, Directory.Build.props, Directory.Packages.props, NuGet.Config, packages.config, vcpkg.json, conanfile.txt, conanfile.py

#### 6.2.2 프로젝트 분류
- .NET SDK style project
- legacy .NET Framework project
- C++ MSBuild project
- CMake project
- mixed solution
- test project
- packaging/deploy project

#### 6.2.3 빌드 진입점 추천
- .csproj 단독 → dotnet build
- SDK-style .sln → dotnet build
- .vcxproj → msbuild
- CMakeLists.txt → cmake configure + build
- 혼합 .sln → msbuild 우선 추천

#### 6.2.4 의존 설정 탐지
- TargetFramework / TargetFrameworks
- RuntimeIdentifier, UseWPF / UseWindowsForms
- PlatformTarget, LangVersion, Nullable
- VC++ PlatformToolset, WindowsTargetPlatformVersion
- CharacterSet, CLR Support 여부
- static/dynamic runtime 여부 추정

### 6.3 빌드 실행 기능

#### 6.3.1 지원 명령
dotnet restore/build/test/publish, msbuild, cmake -S -B, cmake --build

#### 6.3.2 입력 파라미터 선택
- target file, Configuration, Platform, Target
- Verbosity, parallel build, restore, binary log

#### 6.3.3 실행 프로파일
Debug x64, Release x64, CI-compatible build, Clean Rebuild, Verbose Diagnostics

#### 6.3.4 세션 환경 주입
- 현재 환경에서 직접 실행
- VsDevCmd.bat를 거친 후 명령 실행
- vcvarsall.bat x64를 거친 후 명령 실행

### 6.4 로그/출력 기능

#### 6.4.1 실시간 로그 패널
stdout/stderr 통합, 자동 스크롤, 일시정지, 검색, 복사, 파일 저장

#### 6.4.2 로그 필터링
error, warning, info, restore, compile, link, test, publish

#### 6.4.3 에러 요약
파일명, 줄 번호, 에러 코드, 메시지, 프로젝트명, 발생 단계

#### 6.4.4 경고 요약
warning count, top recurring, nullable, deprecated API, linker warnings

#### 6.4.5 이력 관리
실행 시간, 대상 프로젝트, 구성, 성공/실패, 소요 시간, 요약 결과

### 6.5 진단 기능

#### 6.5.1 환경 이상 탐지
dotnet/msbuild/cl.exe 없음, Windows SDK 없음, global.json SDK 불일치, toolset 불일치, restore 미실행, cmake 없음 등

#### 6.5.2 진단 결과 등급
OK, Warning, Error, Unknown

#### 6.5.3 해결 가이드
각 진단 항목마다 권장 조치 표시

### 6.6 화면 구성 요구사항

#### 6.6.1 기본 레이아웃
- 상단: 현재 워크스페이스 정보
- 좌측: 프로젝트/솔루션 탐색기
- 중앙: 환경 상태 대시보드
- 우측: 상세 속성/진단 패널
- 하단: 로그/상태 바/명령 바

#### 6.6.2 탭 구성
Overview, Environment, Solutions/Projects, Build, Diagnostics, Logs, History, Settings

#### 6.6.3 키보드 중심 조작
Tab, ↑↓, Enter, F5-F8, /, q, ?

#### 6.6.4 상태 색상
녹색(정상), 노랑(경고), 빨강(오류), 회색(미탐지), 파랑(선택/실행중) + 텍스트 심볼

## 7. 비기능 요구사항
- **성능**: 초기 스캔 3초 이내, 대형 솔루션 비동기, 1만줄 로그 UI 응답성 유지
- **안정성**: 외부 명령 실패 시 TUI 유지, Unknown 격리 표시, 부분 동작 보장
- **이식성**: 1차 Windows, 2차 Linux/macOS (.NET/CMake 일부)
- **유지보수성**: 탐지/분석/실행/UI 로직 분리, parser/adapter 구조
- **확장성**: test, publish, binary log, CI preset, Git, package manager

## 8. 데이터 모델 요구사항
- **ToolInfo**: Name, Path, Version, Detected, Source, Architecture, Notes
- **SdkInfo**: SdkType, Version, InstalledPath, IsSelected, IsRequired, Status
- **ProjectInfo**: Name, Path, Type, Language, BuildSystem, TargetFrameworks, PlatformTargets, Dependencies, RecommendedCommand
- **BuildProfile**: Name, TargetPath, CommandType, Configuration, Platform, ExtraArguments, UseDeveloperShell, EnableBinaryLog
- **DiagnosticItem**: Category, Severity, Code, Title, Description, SuggestedAction, RelatedPath
- **BuildResult**: StartTime, EndTime, Duration, ExitCode, Succeeded, ErrorCount, WarningCount, Summary

## 9. 세부 진단 항목 정의
- **.NET**: dotnet --list-sdks/runtimes/--info, workload list, global.json 일치, TFM 지원
- **MSBuild**: 경로, /version, vswhere 기반 검색, 호환성 판단
- **Visual Studio/Build Tools**: instance 목록, edition, path, MSBuild/VC/Windows SDK component
- **C++**: cl.exe, include/lib path, PlatformToolset, WindowsTargetPlatformVersion, 빌드 가능성 추정
- **CMake**: version, generator, ninja, configure/build preset 탐지

## 10. 사용자 인터페이스 요구사항
- **Overview**: SDK/MSBuild/C++ 상태, 솔루션/프로젝트 수, 최근 빌드
- **Environment**: 트리/테이블 (.NET, MSBuild, VS, C++, CMake, PackageManagers, EnvVars)
- **Projects**: 파일 경로, 프로젝트 타입, TFM, 추천 명령, required tools, risk flags
- **Build**: 대상 선택, command/arg preview, run, profile save/load
- **Diagnostics**: 문제 목록, severity 필터, 해결 방법, 관련 파일 경로
- **Logs**: 실시간 로그, keyword filter, errors/warnings only, export

## 11. 우선순위
- **MVP**: 환경 탐지, 솔루션/프로젝트 스캔, dotnet/msbuild 실행, C++/C# 상태, 로그, 에러 요약, 진단
- **V1**: CMake 지원, profile 저장, history, search/filter, fix 가이드 강화
- **V2**: test/publish, binary log, plugin 구조, remote/CI preset

## 12. 제약사항
- 1차 개발 플랫폼: Windows
- Terminal.Gui 기반 구현
- 관리자 권한 없이 탐지
- 외부 명령 호출 비동기/취소 가능
- Build Tools만으로 동작 가능
- PATH 오염 상황 고려

## 13. 권장 아키텍처
- **계층**: UI → Application → Domain → Infrastructure
- **모듈**: EnvironmentScanner, ProjectScanner, BuildCommandResolver, BuildExecutor, LogParser, DiagnosticsEngine, ProfileStore, SettingsStore
- **어댑터**: DotnetAdapter, MsBuildAdapter, CppMsBuildAdapter, CMakeAdapter

## 14. 수용 기준
- 환경 표시: 실행 후 .NET/MSBuild/C++ 상태 한 화면 확인
- 자동 추천: 프로젝트 타입별 적절한 빌드 명령 추천
- 빌드 실행: UI에서 설정 선택 후 빌드 실행
- 진단: 누락 요소 Warning/Error 분류 표시
- 실패 분석: 에러 코드와 핵심 원인 요약
