import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import type { SolutionInfo, ProjectInfo, BuildConfiguration } from '../../domain/models/ProjectInfo.js';
import { ProjectFileParser } from './ProjectFileParser.js';

// .sln project line:
// Project("{FAE04EC0-...}") = "MyApp", "MyApp\MyApp.csproj", "{GUID}"
const PROJECT_LINE_REGEX = /^Project\("\{([^}]+)\}"\)\s*=\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"\{([^}]+)\}"/;

// Known project type GUIDs
const GUID_CSHARP = 'FAE04EC0-301F-11D3-BF4B-00C04F79EFBC';
const GUID_FSHARP = 'F2A71F9B-5D33-465A-A702-920D77279786';
const GUID_VB = 'F184B08F-C81C-45F6-A57F-5ABD9991F28F';
const GUID_CPP = '8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942';
const GUID_SOLUTION_FOLDER = '2150E333-8FDC-42A3-9474-1A3956D46DE8';

export class SolutionFileParser {
  private projectParser = new ProjectFileParser();

  parse(slnPath: string): SolutionInfo {
    const content = readFileSync(slnPath, 'utf-8');
    const slnDir = dirname(slnPath);
    const lines = content.split('\n');

    const projects: ProjectInfo[] = [];
    const solutionConfigs: BuildConfiguration[] = [];
    let hasCsharp = false;
    let hasCpp = false;

    // Parse solution configurations from GlobalSection(SolutionConfigurationPlatforms)
    let inSolutionConfigSection = false;
    const seenConfigs = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();

      // Track solution configuration section
      if (trimmed.startsWith('GlobalSection(SolutionConfigurationPlatforms)')) {
        inSolutionConfigSection = true;
        continue;
      }
      if (inSolutionConfigSection && trimmed === 'EndGlobalSection') {
        inSolutionConfigSection = false;
        continue;
      }

      // Parse solution configuration pairs
      if (inSolutionConfigSection) {
        const configMatch = trimmed.match(/^(.+)\|(.+)\s*=\s*.+\|.+$/);
        if (configMatch) {
          const key = `${configMatch[1]!.trim()}|${configMatch[2]!.trim()}`;
          if (!seenConfigs.has(key)) {
            seenConfigs.add(key);
            solutionConfigs.push({
              configuration: configMatch[1]!.trim(),
              platform: configMatch[2]!.trim(),
            });
          }
        }
        continue;
      }

      // Parse project references
      const match = line.match(PROJECT_LINE_REGEX);
      if (!match) continue;

      const typeGuid = match[1]!.toUpperCase();
      const projectRelPath = match[3]!.replace(/\\/g, '/');

      // Skip solution folders
      if (typeGuid === GUID_SOLUTION_FOLDER) continue;

      const projectAbsPath = resolve(slnDir, projectRelPath);

      try {
        if (typeGuid === GUID_CSHARP || projectRelPath.endsWith('.csproj')) {
          hasCsharp = true;
          projects.push(this.projectParser.parseCsproj(projectAbsPath, slnPath));
        } else if (typeGuid === GUID_FSHARP || projectRelPath.endsWith('.fsproj')) {
          hasCsharp = true;
          projects.push(this.projectParser.parseFsproj(projectAbsPath, slnPath));
        } else if (typeGuid === GUID_VB || projectRelPath.endsWith('.vbproj')) {
          hasCsharp = true;
          projects.push(this.projectParser.parseVbproj(projectAbsPath, slnPath));
        } else if (typeGuid === GUID_CPP || projectRelPath.endsWith('.vcxproj')) {
          hasCpp = true;
          projects.push(this.projectParser.parseVcxproj(projectAbsPath, slnPath));
        }
      } catch {
        // Project file not found or unparseable - skip
      }
    }

    // If no solution configs found, derive from project configs
    if (solutionConfigs.length === 0) {
      const configSet = new Set<string>();
      for (const proj of projects) {
        for (const cfg of proj.configurations) {
          const key = `${cfg.configuration}|${cfg.platform}`;
          if (!configSet.has(key)) {
            configSet.add(key);
            solutionConfigs.push(cfg);
          }
        }
      }
    }

    // Default configs if still empty
    if (solutionConfigs.length === 0) {
      solutionConfigs.push(
        { configuration: 'Debug', platform: 'Any CPU' },
        { configuration: 'Release', platform: 'Any CPU' },
      );
    }

    const solutionType = hasCsharp && hasCpp ? 'mixed' : hasCpp ? 'cpp' : 'csharp';

    return {
      name: basename(slnPath, '.sln'),
      filePath: slnPath,
      projects,
      solutionType,
      configurations: solutionConfigs,
    };
  }
}
