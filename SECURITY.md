# Security Policy

## Reporting a vulnerability

Email **kwanghyeon.kim@mirero.co.kr** with details. Please do not open a public issue for security-relevant findings.

Include, when possible:
- Affected version (output of `lazybuilder --version`)
- Reproduction steps
- Impact assessment

We aim to acknowledge within 5 business days and to ship a fix or mitigation within 30 days for confirmed issues.

## Supported versions

Only the latest published minor on npm receives security fixes. Pin a major in your tooling to opt into ongoing patches.

## Threat model (summary)

LazyBuilder spawns local subprocesses (`dotnet`, `msbuild`, `cmake`, `npm`, `git`) and reads project files. It does **not**:

- listen on the network
- evaluate user-supplied code (no `eval`, no dynamic imports of untrusted paths)
- write outside the working directory and `~/.lazybuilder/`

The largest practical risk is a malicious project file (e.g., a hostile `.csproj` with shell-meta-character-laced paths) being passed verbatim to a build tool. Mitigations:

- All subprocess calls go through `ProcessRunner` (single seam, no direct `spawn`).
- Detector outputs are typed and validated before reaching adapters.
- Build commands are constructed from the typed `ResolvedCommand`, not string concatenation of untrusted input.

If you find a path where untrusted input reaches a shell unchecked, that is the kind of report we want.
