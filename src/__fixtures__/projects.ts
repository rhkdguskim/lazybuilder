import type { ProjectInfo } from '../domain/models/ProjectInfo.js';

export function makeCsproj(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: 'App',
    filePath: '/proj/App.csproj',
    projectType: 'dotnet-sdk',
    language: 'csharp',
    buildSystem: 'dotnet',
    targetFrameworks: ['net8.0'],
    platformTargets: ['AnyCPU'],
    configurations: [
      { configuration: 'Debug', platform: 'Any CPU' },
      { configuration: 'Release', platform: 'Any CPU' },
    ],
    platformToolset: null,
    windowsSdkVersion: null,
    recommendedCommand: 'dotnet build',
    dependencies: [],
    riskFlags: [],
    solutionPath: null,
    ...overrides,
  };
}

export function makeVcxproj(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: 'NativeApp',
    filePath: '/proj/NativeApp.vcxproj',
    projectType: 'cpp-msbuild',
    language: 'cpp',
    buildSystem: 'msbuild',
    targetFrameworks: [],
    platformTargets: ['x64'],
    configurations: [
      { configuration: 'Debug', platform: 'x64' },
      { configuration: 'Release', platform: 'x64' },
    ],
    platformToolset: 'v143',
    windowsSdkVersion: '10.0.22621.0',
    recommendedCommand: 'msbuild NativeApp.vcxproj',
    dependencies: [],
    riskFlags: [],
    solutionPath: null,
    ...overrides,
  };
}

export function makeCMakeProject(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: 'cmake-proj',
    filePath: '/proj/CMakeLists.txt',
    projectType: 'cmake',
    language: 'cpp',
    buildSystem: 'cmake',
    targetFrameworks: [],
    platformTargets: [],
    configurations: [],
    platformToolset: null,
    windowsSdkVersion: null,
    recommendedCommand: 'cmake --build build',
    dependencies: [],
    riskFlags: [],
    solutionPath: null,
    ...overrides,
  };
}

export const SAMPLE_CSPROJ_NET8 = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`;

export const SAMPLE_CSPROJ_MULTITARGET = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>net6.0;net8.0</TargetFrameworks>
  </PropertyGroup>
</Project>
`;

export const SAMPLE_CSPROJ_MAUI = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-android</TargetFramework>
    <UseMaui>true</UseMaui>
  </PropertyGroup>
</Project>
`;

export const SAMPLE_VCXPROJ = `<?xml version="1.0" encoding="utf-8"?>
<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup Label="Configuration">
    <PlatformToolset>v143</PlatformToolset>
    <WindowsTargetPlatformVersion>10.0.22621.0</WindowsTargetPlatformVersion>
  </PropertyGroup>
</Project>
`;

export const SAMPLE_GLOBAL_JSON = `{
  "sdk": {
    "version": "8.0.405",
    "rollForward": "latestFeature"
  }
}
`;

export const SAMPLE_GLOBAL_JSON_PINNED = `{
  "sdk": {
    "version": "6.0.428"
  }
}
`;
