# LazyBuilder - .NET / MSBuild / C++ Build TUI

Terminal UI for diagnosing build environments and executing builds without Visual Studio IDE.

## Features

- **Environment Detection**: .NET SDK, MSBuild, Visual Studio, C++ Toolchain, Windows SDK (7/8.1/10/11), CMake, Ninja, Git
- **Project Scanning**: .sln, .csproj, .vcxproj, CMakeLists.txt auto-discovery with type classification
- **Configuration Manager**: Parses solution/project Configuration|Platform pairs for build target selection
- **Build Execution**: dotnet build, msbuild, cmake --build with real-time streaming output
- **Diagnostics**: Pre-build environment validation with actionable fix suggestions
- **Log Viewer**: Filtered log output with error/warning parsing and summary
- **Auto Update**: Checks npm registry (or git origin if cloned) on startup
- **Cross-platform**: Windows primary, Linux/macOS partial support
- **AI-Tool Ready**: Headless flags + JSON envelope contract — see [`agent.md`](https://github.com/rhkdguskim/lazybuilder/blob/master/agent.md) and [`docs/agents/`](https://github.com/rhkdguskim/lazybuilder/tree/master/docs/agents) on GitHub

## Requirements

- **Node.js** >= 20.0.0
- **Git** (for auto-update feature)
- **Terminal** with Unicode support (Windows Terminal recommended)

## Installation

### Recommended (npm — global)

```bash
npm install -g lazybuilder-cli
lazybuilder           # launch the TUI
```

### Update

```bash
lazybuilder --check-update   # JSON: { updateAvailable, currentVersion, latestVersion, mode }
lazybuilder --update         # auto-update (npm or git, depending on install mode)

# manual fallback:
npm install -g lazybuilder-cli@latest
```

### From source (Windows)

```bat
git clone https://github.com/rhkdguskim/lazybuilder.git
cd lazybuilder
install.bat
```

### From source (Linux / macOS)

```bash
git clone https://github.com/rhkdguskim/lazybuilder.git
cd lazybuilder
./install.sh
```

### Manual from source

```bash
git clone https://github.com/rhkdguskim/lazybuilder.git
cd lazybuilder
npm install
npm run build
npm link
```

### Development (no install)

```bash
git clone https://github.com/rhkdguskim/lazybuilder.git
cd lazybuilder
npm install
npm run dev
```

## Usage

Launch the TUI:

```bash
lazybuilder
```

On startup, the tool will:
1. Check for updates from GitHub (prompts to update if available)
2. Scan your build environment (.NET, MSBuild, C++, CMake, etc.)
3. Scan the current directory for projects and solutions
4. Run diagnostics to detect missing tools or configuration issues

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+1~8` | Switch to tab directly |
| `Ctrl+←→` | Previous/Next tab |
| `↑↓` | Navigate lists |
| `←→` | Change selection (Build tab) |
| `Enter` | Confirm / Execute build |
| `Esc` | Cancel build |
| `Tab` | Switch filter |
| `f` | Toggle log follow mode |
| `q` | Quit |

### Tabs

| # | Tab | Description |
|---|-----|-------------|
| 1 | **Overview** | Build environment status at a glance |
| 2 | **Environment** | Detailed tool/SDK info by category (.NET, MSBuild, VS, C++, Windows SDK, CMake, Packages) |
| 3 | **Projects** | Scanned solutions and projects with metadata, TFM, recommended build command |
| 4 | **Build** | Configuration manager with Configuration/Platform selection, command preview, execute |
| 5 | **Diagnostics** | Environment issues with severity filtering and fix suggestions |
| 6 | **Logs** | Real-time build log with error/warning filtering |
| 7 | **History** | Past build results |
| 8 | **Settings** | Application configuration |

## Uninstall

```bash
npm unlink -g lazybuilder
```

## Tech Stack

- [Ink](https://github.com/vadimdemedes/ink) - React for CLI
- [React 18](https://react.dev/) - UI components
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) - .csproj/.vcxproj parsing
- [fast-glob](https://github.com/mrmlnc/fast-glob) - File discovery
- [tree-kill](https://github.com/pkrber/tree-kill) - Process tree management

## Project Structure

```
src/
├── domain/          # Types, enums, diagnostic rules
├── infrastructure/  # Process runner, detectors, parsers, adapters
├── application/     # Service orchestration
└── ui/              # React/Ink components, hooks, store
```

## Documentation

Agent integration guides and architecture docs live in the GitHub repo, not the npm tarball:

- [`agent.md`](https://github.com/rhkdguskim/lazybuilder/blob/master/agent.md) — entry point for AI agents
- [`docs/agents/quickstart.md`](https://github.com/rhkdguskim/lazybuilder/blob/master/docs/agents/quickstart.md)
- [`docs/agents/cli-reference.md`](https://github.com/rhkdguskim/lazybuilder/blob/master/docs/agents/cli-reference.md)
- [`docs/agents/recipes.md`](https://github.com/rhkdguskim/lazybuilder/blob/master/docs/agents/recipes.md)
- [`docs/agents/harness-integration.md`](https://github.com/rhkdguskim/lazybuilder/blob/master/docs/agents/harness-integration.md)
- [`docs/agents/architecture.md`](https://github.com/rhkdguskim/lazybuilder/blob/master/docs/agents/architecture.md)

## License

MIT
