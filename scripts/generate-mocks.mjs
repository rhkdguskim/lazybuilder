#!/usr/bin/env node
/**
 * Generates a deterministic enterprise-grade mock workspace under ./mocks for
 * dogfooding the lazybuilder TUI (especially the new collapsible solution
 * tree on the Projects + Build tabs).
 *
 * Output is gitignored. Re-run any time to refresh the workspace:
 *   node scripts/generate-mocks.mjs
 *
 * Layout:
 *   mocks/Acme.Platform/                Mixed C#/C++ enterprise (8 projects)
 *   mocks/Contoso.Trading/              Pure .NET 9 enterprise (10 projects)
 *   mocks/Northwind.Legacy/             .NET Framework 4.8 + WPF + WinForms (5)
 *   mocks/RenderEngine/                 Pure C++ MSBuild (6 projects, 3 platforms)
 *   mocks/LegacyControls/               Older C++ MSBuild v141 (3 projects)
 *   mocks/cmake-libs/*                  Standalone CMake projects (3)
 *   mocks/standalone/*                  Standalone .NET SDK projects (2)
 */

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', 'mocks');

// Project type GUIDs that the SolutionFileParser recognizes.
const TYPE_CSHARP = 'FAE04EC0-301F-11D3-BF4B-00C04F79EFBC';
const TYPE_CPP = '8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942';

// Shape this mock workspace ships:
const SOLUTIONS = [
  acmePlatform(),
  contosoTrading(),
  northwindLegacy(),
  renderEngine(),
  legacyControls(),
];

const STANDALONE_CMAKE = [
  { dir: 'cmake-libs/MathCore', name: 'mathcore', minVersion: '3.20' },
  { dir: 'cmake-libs/ImageCodec', name: 'imagecodec', minVersion: '3.22' },
  { dir: 'cmake-libs/PhysicsSim', name: 'physicssim', minVersion: '3.25' },
];

const STANDALONE_CSPROJ = [
  {
    dir: 'standalone/Acme.DiagCLI',
    name: 'Acme.DiagCLI',
    sdk: 'Microsoft.NET.Sdk',
    targetFramework: 'net9.0',
    outputType: 'Exe',
    packageRefs: [
      ['Microsoft.Extensions.Hosting', '9.0.0'],
      ['Spectre.Console', '0.49.1'],
    ],
  },
  {
    dir: 'standalone/Acme.Telemetry',
    name: 'Acme.Telemetry',
    sdk: 'Microsoft.NET.Sdk',
    targetFramework: 'net8.0',
    packageRefs: [
      ['OpenTelemetry', '1.9.0'],
      ['OpenTelemetry.Exporter.Console', '1.9.0'],
    ],
  },
];

main();

function main() {
  if (existsSync(ROOT)) rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });

  for (const sln of SOLUTIONS) writeSolution(sln);
  for (const c of STANDALONE_CMAKE) writeCMakeStandalone(c);
  for (const c of STANDALONE_CSPROJ) writeStandaloneCsproj(c);

  writeReadme();

  const projectCount = SOLUTIONS.reduce((sum, s) => sum + s.projects.length, 0);
  console.log(`Generated ${SOLUTIONS.length} solutions, ${projectCount} contained projects, ` +
    `${STANDALONE_CMAKE.length} standalone CMake projects, ${STANDALONE_CSPROJ.length} standalone .NET projects.`);
  console.log(`Workspace root: ${ROOT}`);
}

// ----- Solution definitions ------------------------------------------------

function acmePlatform() {
  // Mixed C#/C++ enterprise platform.
  return {
    folder: 'Acme.Platform',
    name: 'Acme.Platform',
    configurations: [
      ['Debug', 'Any CPU'],
      ['Release', 'Any CPU'],
      ['Debug', 'x64'],
      ['Release', 'x64'],
    ],
    projects: [
      sdkCs('src/Acme.Core/Acme.Core.csproj', 'Acme.Core', {
        targetFramework: 'net8.0',
        packageRefs: [['Microsoft.Extensions.Logging.Abstractions', '8.0.0']],
      }),
      sdkCs('src/Acme.Web/Acme.Web.csproj', 'Acme.Web', {
        sdk: 'Microsoft.NET.Sdk.Web',
        targetFramework: 'net8.0',
        packageRefs: [
          ['Microsoft.AspNetCore.OpenApi', '8.0.0'],
          ['Swashbuckle.AspNetCore', '6.5.0'],
        ],
      }),
      sdkCs('src/Acme.Data/Acme.Data.csproj', 'Acme.Data', {
        targetFramework: 'net8.0',
        packageRefs: [
          ['Microsoft.EntityFrameworkCore', '8.0.0'],
          ['Microsoft.EntityFrameworkCore.SqlServer', '8.0.0'],
          ['Dapper', '2.1.35'],
        ],
      }),
      vcxProj('src/Acme.Native/Acme.Native.vcxproj', 'Acme.Native', {
        platforms: ['x64', 'Win32'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
      }),
      vcxProj('src/Acme.Codec/Acme.Codec.vcxproj', 'Acme.Codec', {
        platforms: ['x64', 'Win32', 'ARM64'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
        characterSet: 'Unicode',
      }),
      sdkCs('tests/Acme.Core.Tests/Acme.Core.Tests.csproj', 'Acme.Core.Tests', {
        targetFramework: 'net8.0',
        isTest: true,
      }),
      sdkCs('tests/Acme.Web.Tests/Acme.Web.Tests.csproj', 'Acme.Web.Tests', {
        targetFramework: 'net8.0',
        isTest: true,
      }),
      sdkCs('tools/Acme.Tools/Acme.Tools.csproj', 'Acme.Tools', {
        targetFramework: 'net8.0',
        outputType: 'Exe',
      }),
    ],
  };
}

function contosoTrading() {
  // Pure .NET 9 large enterprise — clean architecture.
  return {
    folder: 'Contoso.Trading',
    name: 'Contoso.Trading',
    configurations: [
      ['Debug', 'Any CPU'],
      ['Release', 'Any CPU'],
    ],
    projects: [
      sdkCs('src/Contoso.Domain/Contoso.Domain.csproj', 'Contoso.Domain', {
        targetFramework: 'net9.0',
      }),
      sdkCs('src/Contoso.Application/Contoso.Application.csproj', 'Contoso.Application', {
        targetFramework: 'net9.0',
        packageRefs: [['MediatR', '12.4.0'], ['FluentValidation', '11.9.0']],
      }),
      sdkCs('src/Contoso.Infrastructure/Contoso.Infrastructure.csproj', 'Contoso.Infrastructure', {
        targetFramework: 'net9.0',
        packageRefs: [
          ['Microsoft.EntityFrameworkCore', '9.0.0'],
          ['StackExchange.Redis', '2.7.33'],
        ],
      }),
      sdkCs('src/Contoso.Api/Contoso.Api.csproj', 'Contoso.Api', {
        sdk: 'Microsoft.NET.Sdk.Web',
        targetFramework: 'net9.0',
        packageRefs: [['Microsoft.AspNetCore.OpenApi', '9.0.0']],
      }),
      sdkCs('src/Contoso.Worker/Contoso.Worker.csproj', 'Contoso.Worker', {
        sdk: 'Microsoft.NET.Sdk.Worker',
        targetFramework: 'net9.0',
        outputType: 'Exe',
        packageRefs: [['Quartz.Extensions.Hosting', '3.13.0']],
      }),
      sdkCs('src/Contoso.Shared.Contracts/Contoso.Shared.Contracts.csproj', 'Contoso.Shared.Contracts', {
        targetFramework: 'netstandard2.1',
      }),
      sdkCs('tests/Contoso.Domain.Tests/Contoso.Domain.Tests.csproj', 'Contoso.Domain.Tests', {
        targetFramework: 'net9.0',
        isTest: true,
      }),
      sdkCs('tests/Contoso.Application.Tests/Contoso.Application.Tests.csproj', 'Contoso.Application.Tests', {
        targetFramework: 'net9.0',
        isTest: true,
      }),
      sdkCs('tests/Contoso.Api.IntegrationTests/Contoso.Api.IntegrationTests.csproj', 'Contoso.Api.IntegrationTests', {
        targetFramework: 'net9.0',
        isTest: true,
        packageRefs: [
          ['Microsoft.AspNetCore.Mvc.Testing', '9.0.0'],
          ['Testcontainers.MsSql', '3.10.0'],
        ],
      }),
      sdkCs('tools/Contoso.Migrator/Contoso.Migrator.csproj', 'Contoso.Migrator', {
        targetFramework: 'net9.0',
        outputType: 'Exe',
      }),
    ],
  };
}

function northwindLegacy() {
  // .NET Framework 4.8 — legacy non-SDK csproj exercising risk flags (WPF/WinForms/legacy-format).
  return {
    folder: 'Northwind.Legacy',
    name: 'Northwind.Legacy',
    configurations: [
      ['Debug', 'Any CPU'],
      ['Release', 'Any CPU'],
      ['Debug', 'x86'],
      ['Release', 'x86'],
    ],
    projects: [
      legacyCs('src/Northwind.Forms/Northwind.Forms.csproj', 'Northwind.Forms', {
        outputType: 'WinExe',
        targetFramework: 'v4.8',
        useWinForms: true,
      }),
      legacyCs('src/Northwind.WPF/Northwind.WPF.csproj', 'Northwind.WPF', {
        outputType: 'WinExe',
        targetFramework: 'v4.8',
        useWPF: true,
      }),
      legacyCs('src/Northwind.BusinessLogic/Northwind.BusinessLogic.csproj', 'Northwind.BusinessLogic', {
        outputType: 'Library',
        targetFramework: 'v4.8',
      }),
      legacyCs('src/Northwind.DataLayer/Northwind.DataLayer.csproj', 'Northwind.DataLayer', {
        outputType: 'Library',
        targetFramework: 'v4.8',
      }),
      legacyCs('tests/Northwind.Tests/Northwind.Tests.csproj', 'Northwind.Tests', {
        outputType: 'Library',
        targetFramework: 'v4.8',
        isTest: true,
      }),
    ],
  };
}

function renderEngine() {
  // Pure C++ MSBuild — exercises platform/toolset diversity.
  return {
    folder: 'RenderEngine',
    name: 'RenderEngine',
    configurations: [
      ['Debug', 'x64'],
      ['Release', 'x64'],
      ['Debug', 'Win32'],
      ['Release', 'Win32'],
      ['Debug', 'ARM64'],
      ['Release', 'ARM64'],
    ],
    projects: [
      vcxProj('src/Engine.Core/Engine.Core.vcxproj', 'Engine.Core', {
        platforms: ['x64', 'Win32', 'ARM64'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
        configurationType: 'StaticLibrary',
      }),
      vcxProj('src/Engine.Renderer/Engine.Renderer.vcxproj', 'Engine.Renderer', {
        platforms: ['x64', 'Win32', 'ARM64'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
        configurationType: 'DynamicLibrary',
      }),
      vcxProj('src/Engine.Audio/Engine.Audio.vcxproj', 'Engine.Audio', {
        platforms: ['x64', 'ARM64'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
        configurationType: 'DynamicLibrary',
      }),
      vcxProj('src/Engine.Tools/Engine.Tools.vcxproj', 'Engine.Tools', {
        platforms: ['x64'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
        configurationType: 'Application',
      }),
      vcxProj('tests/Engine.Core.Tests/Engine.Core.Tests.vcxproj', 'Engine.Core.Tests', {
        platforms: ['x64'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
        configurationType: 'Application',
      }),
      vcxProj('samples/Engine.Demo/Engine.Demo.vcxproj', 'Engine.Demo', {
        platforms: ['x64', 'ARM64'],
        toolset: 'v143',
        sdkVersion: '10.0.22621.0',
        configurationType: 'Application',
      }),
    ],
  };
}

function legacyControls() {
  // Older C++ MSBuild solution targeting toolset v141 with /clr support — heavy risk flags.
  return {
    folder: 'LegacyControls',
    name: 'LegacyControls',
    configurations: [
      ['Debug', 'Win32'],
      ['Release', 'Win32'],
      ['Debug', 'x64'],
      ['Release', 'x64'],
    ],
    projects: [
      vcxProj('Controls.Common/Controls.Common.vcxproj', 'Controls.Common', {
        platforms: ['Win32', 'x64'],
        toolset: 'v141',
        sdkVersion: '10.0.18362.0',
        configurationType: 'StaticLibrary',
        characterSet: 'MultiByte',
      }),
      vcxProj('Controls.UI/Controls.UI.vcxproj', 'Controls.UI', {
        platforms: ['Win32', 'x64'],
        toolset: 'v141',
        sdkVersion: '10.0.18362.0',
        configurationType: 'DynamicLibrary',
        characterSet: 'Unicode',
      }),
      vcxProj('Controls.Bridge/Controls.Bridge.vcxproj', 'Controls.Bridge', {
        platforms: ['Win32', 'x64'],
        toolset: 'v141',
        sdkVersion: '10.0.18362.0',
        configurationType: 'DynamicLibrary',
        characterSet: 'Unicode',
        clrSupport: 'true',
      }),
    ],
  };
}

// ----- File emitters --------------------------------------------------------

function writeSolution(sln) {
  const solutionDir = join(ROOT, sln.folder);
  mkdirSync(solutionDir, { recursive: true });

  const slnPath = join(solutionDir, `${sln.name}.sln`);
  const projectGuids = sln.projects.map(() => `{${randomUUID().toUpperCase()}}`);

  // Write each project file.
  for (const proj of sln.projects) {
    writeProject(solutionDir, proj);
  }

  // Compose the .sln file.
  let body = '';
  body += 'Microsoft Visual Studio Solution File, Format Version 12.00\r\n';
  body += '# Visual Studio Version 17\r\n';
  body += 'VisualStudioVersion = 17.8.34316.72\r\n';
  body += 'MinimumVisualStudioVersion = 10.0.40219.1\r\n';

  for (let i = 0; i < sln.projects.length; i++) {
    const proj = sln.projects[i];
    const typeGuid = `{${proj.kind === 'cpp' ? TYPE_CPP : TYPE_CSHARP}}`;
    const slnRelPath = proj.relPath.replace(/\//g, '\\');
    body += `Project("${typeGuid}") = "${proj.name}", "${slnRelPath}", "${projectGuids[i]}"\r\n`;
    body += 'EndProject\r\n';
  }

  body += 'Global\r\n';
  body += '\tGlobalSection(SolutionConfigurationPlatforms) = preSolution\r\n';
  for (const [config, platform] of sln.configurations) {
    body += `\t\t${config}|${platform} = ${config}|${platform}\r\n`;
  }
  body += '\tEndGlobalSection\r\n';

  body += '\tGlobalSection(ProjectConfigurationPlatforms) = postSolution\r\n';
  for (let i = 0; i < sln.projects.length; i++) {
    const proj = sln.projects[i];
    const guid = projectGuids[i];
    const projPlatforms = proj.kind === 'cpp' ? proj.platforms : ['Any CPU'];
    for (const [config, platform] of sln.configurations) {
      // Map solution platform → project platform (cpp projects have explicit platform list).
      const projPlatform = proj.kind === 'cpp'
        ? (projPlatforms.includes(platform) ? platform : projPlatforms[0])
        : 'Any CPU';
      body += `\t\t${guid}.${config}|${platform}.ActiveCfg = ${config}|${projPlatform}\r\n`;
      body += `\t\t${guid}.${config}|${platform}.Build.0 = ${config}|${projPlatform}\r\n`;
    }
  }
  body += '\tEndGlobalSection\r\n';
  body += '\tGlobalSection(SolutionProperties) = preSolution\r\n';
  body += '\t\tHideSolutionNode = FALSE\r\n';
  body += '\tEndGlobalSection\r\n';
  body += 'EndGlobal\r\n';

  writeFileSync(slnPath, body, 'utf-8');
}

function writeProject(solutionDir, proj) {
  const filePath = join(solutionDir, proj.relPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, proj.content, 'utf-8');

  // Drop a tiny source file beside each project so the directory looks plausible.
  if (proj.kind === 'csharp-sdk' || proj.kind === 'csharp-legacy') {
    const csPath = join(dirname(filePath), 'Class1.cs');
    writeFileSync(csPath, `namespace ${proj.name};\n\npublic class Class1 { }\n`, 'utf-8');
  } else if (proj.kind === 'cpp') {
    writeFileSync(join(dirname(filePath), 'main.cpp'), `// ${proj.name}\nint main() { return 0; }\n`, 'utf-8');
    writeFileSync(join(dirname(filePath), `${proj.name}.h`), `#pragma once\n`, 'utf-8');
  }
}

function writeCMakeStandalone({ dir, name, minVersion }) {
  const projDir = join(ROOT, dir);
  mkdirSync(projDir, { recursive: true });
  const body = [
    `cmake_minimum_required(VERSION ${minVersion})`,
    `project(${name} CXX)`,
    '',
    'set(CMAKE_CXX_STANDARD 20)',
    'set(CMAKE_CXX_STANDARD_REQUIRED ON)',
    '',
    `add_library(${name} STATIC src/${name}.cpp)`,
    `target_include_directories(${name} PUBLIC include)`,
    '',
    'enable_testing()',
    `add_executable(${name}_tests tests/test_main.cpp)`,
    `target_link_libraries(${name}_tests PRIVATE ${name})`,
    `add_test(NAME ${name}_tests COMMAND ${name}_tests)`,
    '',
  ].join('\n');
  writeFileSync(join(projDir, 'CMakeLists.txt'), body, 'utf-8');
  mkdirSync(join(projDir, 'src'), { recursive: true });
  mkdirSync(join(projDir, 'include'), { recursive: true });
  mkdirSync(join(projDir, 'tests'), { recursive: true });
  writeFileSync(join(projDir, 'src', `${name}.cpp`), `// ${name} implementation\n`, 'utf-8');
  writeFileSync(join(projDir, 'tests', 'test_main.cpp'), `int main() { return 0; }\n`, 'utf-8');
}

function writeStandaloneCsproj({ dir, name, sdk, targetFramework, outputType, packageRefs = [] }) {
  const projDir = join(ROOT, dir);
  mkdirSync(projDir, { recursive: true });
  const proj = sdkCs(`${name}.csproj`, name, { sdk, targetFramework, outputType, packageRefs });
  writeFileSync(join(projDir, proj.relPath), proj.content, 'utf-8');
  writeFileSync(join(projDir, 'Program.cs'), `Console.WriteLine("${name}");\n`, 'utf-8');
}

function writeReadme() {
  const lines = [
    '# Mock Workspace',
    '',
    'Generated by `scripts/generate-mocks.mjs`. Re-run any time to refresh.',
    '',
    'This directory is gitignored. Used to dogfood the lazybuilder TUI — the',
    'tree on the Projects + Build tabs benefits from a realistic mix of',
    'solutions and project types.',
    '',
    '## Solutions',
    '',
    ...SOLUTIONS.map(s => `- **${s.name}** (${s.folder}) — ${s.projects.length} projects`),
    '',
    '## Standalone projects',
    '',
    ...STANDALONE_CMAKE.map(c => `- ${c.dir} (CMake)`),
    ...STANDALONE_CSPROJ.map(c => `- ${c.dir} (.NET SDK)`),
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'README.md'), lines, 'utf-8');
}

// ----- Project content helpers ---------------------------------------------

function sdkCs(relPath, name, opts = {}) {
  const sdk = opts.sdk ?? 'Microsoft.NET.Sdk';
  const targetFramework = opts.targetFramework ?? 'net8.0';
  const outputType = opts.outputType ?? null;
  const packageRefs = opts.packageRefs ?? [];
  const isTest = opts.isTest === true;
  const refs = isTest
    ? [
        ...packageRefs,
        ['Microsoft.NET.Test.Sdk', '17.10.0'],
        ['xunit', '2.9.0'],
        ['xunit.runner.visualstudio', '2.8.2'],
      ]
    : packageRefs;

  const lines = [];
  lines.push(`<Project Sdk="${sdk}">`);
  lines.push('  <PropertyGroup>');
  lines.push(`    <TargetFramework>${targetFramework}</TargetFramework>`);
  if (outputType) lines.push(`    <OutputType>${outputType}</OutputType>`);
  lines.push('    <Nullable>enable</Nullable>');
  lines.push('    <ImplicitUsings>enable</ImplicitUsings>');
  if (isTest) lines.push('    <IsPackable>false</IsPackable>');
  if (isTest) lines.push('    <IsTestProject>true</IsTestProject>');
  lines.push('  </PropertyGroup>');
  if (refs.length > 0) {
    lines.push('  <ItemGroup>');
    for (const [id, version] of refs) {
      lines.push(`    <PackageReference Include="${id}" Version="${version}" />`);
    }
    lines.push('  </ItemGroup>');
  }
  lines.push('</Project>');
  return {
    kind: 'csharp-sdk',
    relPath,
    name,
    content: lines.join('\n') + '\n',
  };
}

function legacyCs(relPath, name, opts = {}) {
  const outputType = opts.outputType ?? 'Library';
  const targetFramework = opts.targetFramework ?? 'v4.8';
  const useWPF = opts.useWPF === true;
  const useWinForms = opts.useWinForms === true;
  const isTest = opts.isTest === true;

  const lines = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">');
  lines.push('  <Import Project="$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props" Condition="Exists(\'$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props\')" />');
  lines.push('  <PropertyGroup>');
  lines.push(`    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>`);
  lines.push(`    <Platform Condition=" '$(Platform)' == '' ">AnyCPU</Platform>`);
  lines.push(`    <RootNamespace>${name}</RootNamespace>`);
  lines.push(`    <AssemblyName>${name}</AssemblyName>`);
  lines.push(`    <OutputType>${outputType}</OutputType>`);
  lines.push(`    <TargetFrameworkVersion>${targetFramework}</TargetFrameworkVersion>`);
  if (useWPF) lines.push('    <UseWPF>true</UseWPF>');
  if (useWinForms) lines.push('    <UseWindowsForms>true</UseWindowsForms>');
  if (isTest) lines.push('    <IsTestProject>true</IsTestProject>');
  lines.push('  </PropertyGroup>');
  lines.push('  <PropertyGroup Condition=" \'$(Configuration)|$(Platform)\' == \'Debug|AnyCPU\' ">');
  lines.push('    <DebugSymbols>true</DebugSymbols>');
  lines.push('    <Optimize>false</Optimize>');
  lines.push('  </PropertyGroup>');
  lines.push('  <PropertyGroup Condition=" \'$(Configuration)|$(Platform)\' == \'Release|AnyCPU\' ">');
  lines.push('    <Optimize>true</Optimize>');
  lines.push('  </PropertyGroup>');
  if (isTest) {
    lines.push('  <ItemGroup>');
    lines.push('    <PackageReference Include="MSTest.TestFramework" Version="3.6.0" />');
    lines.push('    <PackageReference Include="MSTest.TestAdapter" Version="3.6.0" />');
    lines.push('  </ItemGroup>');
  }
  lines.push('  <Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" />');
  lines.push('</Project>');
  return {
    kind: 'csharp-legacy',
    relPath,
    name,
    content: lines.join('\n') + '\n',
  };
}

function vcxProj(relPath, name, opts = {}) {
  const platforms = opts.platforms ?? ['x64'];
  const toolset = opts.toolset ?? 'v143';
  const sdkVersion = opts.sdkVersion ?? '10.0.22621.0';
  const configurationType = opts.configurationType ?? 'Application';
  const characterSet = opts.characterSet ?? 'Unicode';
  const clrSupport = opts.clrSupport ?? null;
  const configs = ['Debug', 'Release'];

  const lines = [];
  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<Project DefaultTargets="Build" ToolsVersion="17.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">');
  lines.push('  <ItemGroup Label="ProjectConfigurations">');
  for (const platform of platforms) {
    for (const config of configs) {
      lines.push(`    <ProjectConfiguration Include="${config}|${platform}">`);
      lines.push(`      <Configuration>${config}</Configuration>`);
      lines.push(`      <Platform>${platform}</Platform>`);
      lines.push('    </ProjectConfiguration>');
    }
  }
  lines.push('  </ItemGroup>');
  lines.push('  <PropertyGroup Label="Globals">');
  lines.push('    <VCProjectVersion>17.0</VCProjectVersion>');
  lines.push(`    <RootNamespace>${name.replace(/\./g, '_')}</RootNamespace>`);
  lines.push(`    <WindowsTargetPlatformVersion>${sdkVersion}</WindowsTargetPlatformVersion>`);
  lines.push('  </PropertyGroup>');
  lines.push('  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.Default.props" />');
  for (const platform of platforms) {
    for (const config of configs) {
      lines.push(`  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='${config}|${platform}'" Label="Configuration">`);
      lines.push(`    <ConfigurationType>${configurationType}</ConfigurationType>`);
      lines.push(`    <UseDebugLibraries>${config === 'Debug' ? 'true' : 'false'}</UseDebugLibraries>`);
      lines.push(`    <PlatformToolset>${toolset}</PlatformToolset>`);
      lines.push(`    <CharacterSet>${characterSet}</CharacterSet>`);
      if (clrSupport) lines.push(`    <CLRSupport>${clrSupport}</CLRSupport>`);
      if (config === 'Release') lines.push('    <WholeProgramOptimization>true</WholeProgramOptimization>');
      lines.push('  </PropertyGroup>');
    }
  }
  lines.push('  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.props" />');
  lines.push('  <ItemGroup>');
  lines.push(`    <ClCompile Include="main.cpp" />`);
  lines.push('  </ItemGroup>');
  lines.push('  <ItemGroup>');
  lines.push(`    <ClInclude Include="${name}.h" />`);
  lines.push('  </ItemGroup>');
  lines.push('  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />');
  lines.push('</Project>');
  return {
    kind: 'cpp',
    relPath,
    name,
    platforms,
    content: lines.join('\n') + '\n',
  };
}
