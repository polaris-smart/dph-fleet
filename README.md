# dsh-devices

**English** · [简体中文](./README.zh-CN.md)

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-devices"><img alt="npm" src="https://img.shields.io/npm/v/dsh-devices?style=flat-square&color=4b6fff"></a>
  <a href="https://github.com/polaris-smart/dsh-devices"><img alt="GitHub stars" src="https://img.shields.io/github/stars/polaris-smart/dsh-devices?style=flat-square&color=4b6fff"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-7da1de?style=flat-square">
</p>

<p align="center">
  <strong>Turn your devices into a fleet.</strong>
</p>

**Zero core changes, pure plugin mounting.** A dsh plugin that lets your devices collaborate. Tools auto-register in dsh sessions — **any dsh-hosted agent can call them directly**. Uninstall leaves no core patches.

>
> **Requirements**: ① **At least 2 devices, each with dsh-devices installed** (pairing is two-sided; a single device has nothing to pair with). ② Connectivity: same LAN with mDNS multicast allowed (UDP 5353; doesn't cross routers/subnets), **or** publicly reachable devices with SSH (port 22) open. NAT-isolated devices cannot connect to each other in this version (V2 = P2P/tailscale planned).

---



```
┌──────────────┐          ┌──────────────┐
│  dsh + devices  │◄────────►│  dsh + devices  │
└──────────────┘          └──────────────┘
```

```sh
npm install -g @deepseek-ai/dsh
```

```sh
dsh plugin add dsh-devices
```

```sh
```


```text


```

## Platform Notes

> Verified on real hardware: macOS / Ubuntu 22.04+ / Windows Server 2025 & Windows 11.

### macOS
- mDNS auto-announce starts with the plugin (no manual `fleet7 serve`); if discovery fails, allow UDP 5353 in the firewall.
- Remote login (SSH server) is **off by default** — enable it in System Settings → General → Sharing → Remote Login for other devices to command this machine.
- Fleet keys live in `~/.fleet/ssh-keys/` (0600 enforced).

### Linux (incl. Ubuntu / cloud servers)
- **Node ≥ 22.19 required** (22.14 and below lack the zstd API → `createZstdDecompress` boot error). Upgrade via nvm or the distro.
- As a managed host: `sshd` running, `authorized_keys` 600, `~/.ssh` 700.
- Cloud security groups must allow SSH (22), or public pairing will time out.
- Slow networks: use `npm config set registry https://registry.npmmirror.com` to speed up dsh installs.

### Windows (10/11 desktop and Server 2016+)
- **Node ≥ 22.19 required** — the zip build is most reliable (MSI silent install can silently fail on low-memory VMs).
- As a managed host: install OpenSSH Server (Settings → Optional features), then:
  ```powershell
  Start-Service sshd; Set-Service sshd -StartupType Automatic
  ```
  Allow port 22 through the firewall.
- As a controller: single commands, `fleet8 ssh`, upload/download all work; **`&&` chains may return only the first command's output** (OpenSSH for Windows console limitation — see TROUBLESHOOTING Q7). Split compound commands.
- `fleet7`/`fleet8` exit cleanly on Windows (pipe-handle handling is explicit).

## Known Limitations

- **mDNS is LAN-only (beta)**: discovery works on one subnet only; cross-network devices use the SSH route.
- **mDNS auto-announce** requires the plugin loaded in dsh (it starts automatically).
- **Windows as a controller**: `fleet_ssh_exec` with `&&` chains may return only the first command's output (OpenSSH for Windows console-session quirk; see TROUBLESHOOTING Q7). Windows as a *managed* device is unaffected.

## Tools

| Module | Tool | What it does |
|---|---|---|
| mdns | `fleet_discover` | Scan the LAN for devices |
| mdns | `fleet_pair` | Pair with a device key |
| ssh | `fleet_ssh_exec` | Run a command on a paired device |
| ssh | `fleet_workspace` | Set/view remote workspace |
| ssh | `fleet_upload` | Upload a file to a paired device |
| ssh | `fleet_download` | Download a file from a paired device |
| ssh | `fleet_status` | Liveness probe for all paired devices (online/latency/last used) |

Disabled modules don't register their tools (`modules: mdns | ssh | both`).

No commands to memorize — discovery, pairing, and execution are all done by the agent calling `fleet_discover` / `fleet_pair` / `fleet_ssh_exec` in your session.

> Or grab the tgz from Releases: `dsh plugin add ./dsh-devices-<version>.tgz`.

---



```sh
```


```sh
dsh plugin add dsh-devices

dsh plugin add ./dsh-devices-<version>.tgz
```

You should see a clean install with no warnings. Four `fleet_*` tools are then auto-registered in dsh sessions.

> ```sh
> git clone https://github.com/polaris-smart/dsh-devices.git
> ```

---


### Scenario A: Same LAN (recommended start)

**Both devices need dsh-devices** (pairing is two-sided). Devices A and B on the same LAN.


B's user asks B's dsh agent to "start fleet broadcast" (agent runs `fleet7 serve`), or manually:

```sh
fleet7 serve
```


```text
```


B generates a device key (`fleet-d-...`, printed in the terminal) on first `fleet7 serve`. Then on A:

```text
```


```text
```

Pair once, use forever — B has authorized A's public key; A remembers how to reach B.

### Scenario B: Cross-network (SSH direct)

When devices are not on the same LAN (e.g., commanding a cloud server from home):



```sh
```


```sh
echo "ssh-ed25519 AAAA... my-server" >> ~/.ssh/authorized_keys
```


```sh
fleet8 ssh my-server "hostname"
```

Then use `fleet_ssh_exec` / `fleet_workspace` in dsh sessions.

---


|---|---|---|---|

Disabled modules don't register their tools.


|---|---|---|

Errors carry next-step guidance; file transfer & workspace go through the agent tools.

After install, just say "call `fleet_discover`" in your dsh session to see LAN devices; pair once, then command remote devices with `fleet_ssh_exec`. No extra config — tools are exposed to every agent in the dsh session.

Only paired devices are reachable; key files must be 0600; all errors return readable text instead of throwing.


```text
```



|---|---|---|
| `modules` | `both` | `mdns` / `ssh` / `both` |





```
┌─────────────────────────────────────────────────────┐
│                     dsh (DeepSeek Harness)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ fleet_pair    │  │ fleet_workspace│  │           │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┘  │
│         │ mDNS            │ SSH                     │
└─────────┼─────────────────┼─────────────────────────┘
          ▼                 ▼
   ┌────────────┐    ┌──────────────┐
   └────────────┘    └──────────────┘
          │                 │
```



> For full troubleshooting see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

A: Both devices must be on the same LAN (mDNS multicast doesn't cross routers); the target must run `fleet7 serve`; allow UDP 5353 through firewalls.

A: Use Scenario B manual pairing; check port 22 reachability and that the public key is in authorized_keys.

A: You likely have an outdated package — download the latest tgz from the Releases page.

A: After restarting the dsh session, type `/fleet` — seeing your device identity and paired devices means it works. Or ask the agent to call `fleet_discover`.

A: Check: ① the plugin was added to the profile you're booting (`dsh plugin --profile <name> add dsh-devices`) ② the session was restarted ③ Node 22+ (`node --version`). Still missing? Open an issue with the `dsh plugin` output.

A: Verify port 22 reachability (`nc -vz <ip> 22` or `fleet8 ssh <name> hostname`) and that the public key is in the target's `authorized_keys`. Timeouts are usually network/firewall issues, not plugin issues.


Found a bug or have an idea?



      Task-board claiming: post tasks from any device, paired devices claim them


## Changelog

**v0.1.1** (2026-08-20)
- 🔒 Internal codenames removed from the package (mDNS service type & SSH key comment now `dsh-devices`); per-platform notes added to README.

**v0.1.0** (2026-08-20)
- 🎉 First release on npm + GitHub: `dsh plugin add dsh-devices`
- ✨ mDNS auto-announce (no manual `serve`), `fleet_status` liveness probe (7th tool), real `/fleet` commands, SFTP transfer, SSH connect-retry, Windows adaptations
- 🧪 92 tests + verified on macOS / Ubuntu / Windows Server 2025

**History** (pre-rename, v0.2.x era)

- v0.2.10 → v0.2.0: `/fleet` command, SFTP, zero-dependency rebuild, CLI precompile, decentralized pivot (mDNS + SSH)

MIT © polaris-smart
