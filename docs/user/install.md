# Install T3 Kanban

Download the latest package from [GitHub Releases](https://github.com/what1f/t3kanban/releases/latest).

T3 Kanban needs at least one supported coding-agent CLI installed and authenticated on the same
machine. The desktop package includes the T3 Kanban server; Node.js and pnpm are needed only for
source development.

## macOS Apple Silicon

Download the `arm64.dmg`, open it, and drag **T3 Kanban (Alpha)** into Applications.

Current macOS builds are unsigned and not notarized. If Gatekeeper blocks the first launch, remove
the quarantine attribute from this app only, then open it again:

```bash
xattr -dr com.apple.quarantine "/Applications/T3 Kanban (Alpha).app"
```

This bypasses macOS source verification for that app. Use it only with a package downloaded from
this repository's Releases page and verify its checksum first.

## Windows x64

Download the `x64.exe` installer and run it. Current Windows builds are unsigned, so Microsoft
Defender SmartScreen may ask you to confirm before the first installation.

The package includes the native components used by both the Windows and WSL backends; it does not
compile dependencies or download build tools on first launch.

## Linux x64

Download the `x64.AppImage`, make it executable, and run it:

```bash
chmod +x T3-Kanban-*-x64.AppImage
./T3-Kanban-*-x64.AppImage
```

AppImage support varies by distribution. Some distributions require FUSE 2 compatibility packages.

## Verify a download

Each release includes `SHA256SUMS.txt`. From the directory containing the downloaded package and
checksum file, run:

```bash
sha256sum --check SHA256SUMS.txt --ignore-missing
```

On macOS, calculate the downloaded DMG's checksum and compare it with the matching line in
`SHA256SUMS.txt`:

```bash
shasum -a 256 T3-Kanban-*-arm64.dmg
```

On Windows PowerShell, use:

```powershell
Get-FileHash .\T3-Kanban-*-x64.exe -Algorithm SHA256
```

## Providers

T3 Kanban drives provider CLIs; it does not ship them. Install and authenticate each provider on
the machine running T3 Kanban.

| Provider   | CLI                                                   | Default binary | Log in with           |
| ---------- | ----------------------------------------------------- | -------------- | --------------------- |
| Codex      | [Codex CLI](https://developers.openai.com/codex/cli)  | `codex`        | `codex login`         |
| Claude     | [Claude Code](https://claude.com/product/claude-code) | `claude`       | `claude auth login`   |
| Cursor     | [Cursor CLI](https://cursor.com/cli)                  | `cursor-agent` | `agent login`         |
| Grok Build | [Grok Build CLI](https://x.ai/cli)                    | `grok`         | `grok login`          |
| OpenCode   | [OpenCode](https://opencode.ai)                       | `opencode`     | `opencode auth login` |

Codex and Claude are enabled by default. Cursor, Grok Build, and OpenCode can be enabled from the
corresponding provider card in **Settings**.

Each provider CLI must be on the desktop app's `PATH`, or have an explicit binary path configured
in **Settings**. Provider authentication is needed when starting a session with that provider, not
when installing T3 Kanban.

For multi-account setups, see [Codex](./providers-codex.md) and [Claude](./providers-claude.md).

## Next steps

- [Permission modes](./permission-modes.md)
- [Remote access](./remote-access.md)
- [Keeping clients and servers in sync](./updating.md)
- [Running in the background](./background-service.md)
