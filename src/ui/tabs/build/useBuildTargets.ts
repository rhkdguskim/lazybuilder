import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import type { BuildTarget } from './types.js';

/**
 * Derives the flat (tree-aware) list of build targets:
 *   - Solutions are roots; their child projects are emitted as depth-1 rows
 *     when the solution is expanded (or always when a search query is active).
 *   - Projects without a parent solution are emitted at depth 0.
 * The same list flows through the filter/search narrowing pipeline.
 */
export function useBuildTargets() {
  const projects = useAppStore((s) => s.projects);
  const solutions = useAppStore((s) => s.solutions);
  const targetQuery = useAppStore((s) => s.buildTargetQuery);
  const targetFilter = useAppStore((s) => s.buildTargetFilter);
  const expandedSolutions = useAppStore((s) => s.expandedSolutions);

  const targets = useMemo<BuildTarget[]>(() => {
    const list: BuildTarget[] = [];
    const queryActive = targetQuery.trim().length > 0;

    for (const sln of solutions) {
      const expanded = !!expandedSolutions[sln.filePath];
      list.push({
        kind: 'solution',
        label: `${sln.name}.sln (${sln.solutionType}, ${sln.projects.length} proj)`,
        project: null,
        solution: sln,
        path: sln.filePath,
        buildSystem: sln.solutionType === 'csharp' ? 'dotnet' : 'msbuild',
        solutionType: sln.solutionType,
        depth: 0,
        expandable: sln.projects.length > 0,
        expanded,
        childCount: sln.projects.length,
        searchable: [
          sln.name,
          sln.filePath,
          sln.solutionType,
          ...sln.projects.map((project) => `${project.name} ${project.language} ${project.projectType}`),
        ]
          .join(' ')
          .toLowerCase(),
      });

      // Emit children when the user expanded this solution OR when a search is active
      // (so matches inside the group remain reachable).
      if (expanded || queryActive) {
        for (const child of sln.projects) {
          list.push({
            kind: 'project',
            label: `${child.name} [${child.projectType}]`,
            project: child,
            solution: null,
            path: child.filePath,
            buildSystem: child.buildSystem,
            projectType: child.projectType,
            depth: 1,
            parentSolutionPath: sln.filePath,
            searchable: [
              child.name,
              child.filePath,
              child.language,
              child.projectType,
              child.buildSystem,
              ...child.targetFrameworks,
              ...child.platformTargets,
            ]
              .join(' ')
              .toLowerCase(),
          });
        }
      }
    }

    for (const proj of projects.filter((p) => !p.solutionPath)) {
      list.push({
        kind: 'project',
        label: `${proj.name} [${proj.projectType}]`,
        project: proj,
        solution: null,
        path: proj.filePath,
        buildSystem: proj.buildSystem,
        projectType: proj.projectType,
        depth: 0,
        searchable: [
          proj.name,
          proj.filePath,
          proj.language,
          proj.projectType,
          proj.buildSystem,
          ...proj.targetFrameworks,
          ...proj.platformTargets,
        ]
          .join(' ')
          .toLowerCase(),
      });
    }

    return list;
  }, [projects, solutions, expandedSolutions, targetQuery]);

  const filteredTargets = useMemo(() => {
    const query = targetQuery.trim().toLowerCase();
    return targets.filter((target) => {
      const matchesFilter =
        targetFilter === 'all' ||
        (targetFilter === 'solutions' && target.kind === 'solution') ||
        (targetFilter === 'projects' && target.kind === 'project') ||
        (targetFilter === 'dotnet' && target.buildSystem === 'dotnet') ||
        (targetFilter === 'msbuild' && target.buildSystem === 'msbuild') ||
        (targetFilter === 'cmake' && target.buildSystem === 'cmake') ||
        (targetFilter === 'cpp' &&
          (target.project?.language === 'cpp' ||
            target.projectType === 'cpp-msbuild' ||
            target.solutionType === 'cpp' ||
            target.solutionType === 'mixed'));
      const matchesQuery = query.length === 0 || target.searchable.includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [targets, targetFilter, targetQuery]);

  return { targets, filteredTargets };
}
