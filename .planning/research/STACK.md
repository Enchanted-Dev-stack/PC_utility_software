# Stack Research

**Domain:** local Wi-Fi phone-to-PC remote control app (MVP-first)
**Researched:** 2026-02-27
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Rust | 1.93.1 (stable) | PC agent runtime, action execution, networking, crypto | Best fit for low-latency local networking and safer OS-level automation code. Tauri ecosystem is Rust-first. |
| Tauri | 2.10.x (`@tauri-apps/cli` 2.10.0, crate 2.10.2) | Desktop control panel shell + native bridge | Smaller footprint than Electron, strong desktop security model, and first-class Rust integration. |
| React + Vite | React 19.2.x + Vite 7.3.x | Desktop control panel UI | Fast iteration for MVP and easy creation of a high-polish visual editor/live preview UI. |
| Expo (React Native) | SDK 55.0.x (RN 0.83, React 19.2) | Mobile app UI and runtime | Most practical MVP path for beautiful mobile UI while keeping JavaScript/TypeScript shared logic. |
| WebSocket over LAN | Tokio 1.49 + tokio-tungstenite 0.28 | Real-time command transport phone <-> PC | Lowest implementation complexity with strong enough performance for tile/action triggers in local network scenarios. |
| SQLite | rusqlite 0.38 | Local persistence on PC (tiles, mappings, pairing metadata, audit log) | Durable local-first state without external infrastructure; ideal for greenfield MVP. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| mdns-sd (Rust) | 0.18.0 | LAN service discovery from PC agent | Default discovery path for zero-config pairing on same Wi-Fi. |
| react-native-zeroconf | 0.14.0 | mDNS discovery on mobile | Use for automatic host discovery; keep QR/manual fallback for networks where mDNS is blocked. |
| enigo (Rust) | 0.6.1 | Cross-platform keyboard/mouse/media input simulation | Use for action execution layer (media controls and hotkey actions). |
| x25519-dalek + hkdf + chacha20poly1305 | 2.0.1 + 0.12.4 + 0.10.1 | Secure pairing/session key derivation and payload encryption | Use for app-level E2E channel security with one-time QR/passcode bootstrap. |
| @noble/curves + @noble/ciphers | 2.0.1 + 2.1.1 | Mobile-side crypto primitives compatible with Rust flow | Use to implement pairing/session crypto without native mobile crypto modules in v1. |
| zod | 4.3.6 | Runtime schema validation for command/event payloads | Use at transport boundaries to prevent malformed action execution. |
| nativewind | 4.2.2 | Fast, polished RN styling system | Use to deliver "beautiful UI" quickly without hand-rolling every style token. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Node.js | JS/TS toolchain runtime | Pin to `24.x` Active LTS for new project setup; avoid EOL Node lines. |
| pnpm | Monorepo package management | Use a workspace with `apps/desktop`, `apps/mobile`, `crates/agent-core`, `packages/protocol`. |
| Cargo + rustup | Rust toolchain/build | Keep on stable channel; lock Rust via `rust-toolchain.toml` for reproducible CI. |

## Installation

```bash
# JS workspace core
pnpm add react@19.2.4 vite@7.3.1 zod@4.3.6

# Desktop (Tauri)
pnpm add @tauri-apps/api@2.10.1 @tauri-apps/plugin-store@2.4.2 @tauri-apps/plugin-log@2.8.0
pnpm add -D @tauri-apps/cli@2.10.0

# Mobile (Expo)
pnpm add expo@55.0.2 react-native@0.83 react@19.2.0 expo-router@55.0.2 nativewind@4.2.2 react-native-zeroconf@0.14.0

# Mobile/desktop shared crypto
pnpm add @noble/curves@2.0.1 @noble/ciphers@2.1.1

# Rust crates (PC side)
cargo add tauri@2.10.2 tokio@1.49 tokio-tungstenite@0.28 mdns-sd@0.18 rusqlite@0.38 enigo@0.6.1 x25519-dalek@2.0.1 hkdf@0.12.4 chacha20poly1305@0.10.1 tracing@0.1.44 serde_json@1.0.149 uuid@1.21.0
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Tauri 2 + Rust agent | Electron + Node native modules | Use Electron only if team has deep existing Electron expertise and does not need Rust for action/runtime safety. |
| Expo SDK 55 | Flutter 3.x | Use Flutter if the team is Dart-first and wants single toolkit ownership over JS/Rust split. |
| WebSocket + JSON schema validation | gRPC/QUIC | Use gRPC/QUIC when you need strict typed contracts and higher-throughput streaming beyond MVP control events. |
| mDNS + QR fallback | Manual IP entry only | Use manual-only for highly restricted enterprise LANs where broadcast/mDNS is blocked. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Electron as default v1 choice | Adds heavy runtime footprint and packaging overhead for a local utility app. | Tauri 2 with Rust core. |
| BLE/Bluetooth control channel in v1 | Increases pairing/transport complexity and conflicts with local Wi-Fi-first scope. | Wi-Fi LAN transport with mDNS + QR fallback. |
| Custom binary protocol from day one | Slows MVP and increases debugging burden without meaningful user value initially. | WebSocket + JSON with explicit schemas (Zod). |
| Rolling your own crypto primitives | High risk of security flaws. | Standard X25519 + HKDF + AEAD libs only. |

## Stack Patterns by Variant

**If you prioritize fastest MVP delivery:**
- Use WebSocket + JSON payloads + Zod validation.
- Because debugging, logging, and cross-platform parity are much faster than introducing protobuf/QUIC early.

**If you prioritize stronger security posture early:**
- Add app-level encrypted sessions (X25519 + HKDF + ChaCha20-Poly1305) during pairing milestone.
- Because LAN-only is not inherently trusted; this prevents opportunistic local interception/replay.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `expo@55.0.x` | `react-native@0.83`, `react@19.2.0`, Node `>=20.19.x` | From Expo version matrix; keep these in lockstep. |
| `@tauri-apps/cli@2.10.x` | `@tauri-apps/api@2.10.x`, Rust stable toolchain | Keep CLI/API on same major/minor line to avoid build/plugin mismatch. |
| `tokio@1.49` | `tokio-tungstenite@0.28` | Common async runtime pairing for Rust websocket servers. |
| `x25519-dalek@2.0.1` | `hkdf@0.12.4`, `chacha20poly1305@0.10.1` | Stable (non-RC) crypto crates recommended for v1. |

## Sources

- https://v2.tauri.app/start/ - Tauri 2 docs and architecture overview (official, HIGH)
- https://v2.tauri.app/start/prerequisites/ - current Tauri prerequisites and toolchain guidance (official, HIGH)
- https://docs.expo.dev/versions/latest/ - Expo SDK/RN/React version compatibility matrix (official, HIGH)
- https://reactnative.dev/versions - current React Native stable/release train (official, HIGH)
- https://nodejs.org/en/about/previous-releases - Node LTS lifecycle and current active LTS lines (official, HIGH)
- https://static.rust-lang.org/dist/channel-rust-stable.toml - current Rust stable channel version metadata (official, HIGH)
- https://crates.io/api/v1/crates/tauri - latest tauri crate version metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/tokio - tokio version metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/tokio-tungstenite - websocket runtime crate metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/mdns-sd - mDNS discovery crate metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/enigo - input automation crate metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/rusqlite - sqlite crate metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/x25519-dalek - key exchange crate metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/hkdf - KDF crate metadata (official registry API, MEDIUM)
- https://crates.io/api/v1/crates/chacha20poly1305 - AEAD crate metadata (official registry API, MEDIUM)
- npm registry (`npm view`) for: `@tauri-apps/*`, `react`, `vite`, `expo`, `react-native`, `expo-router`, `nativewind`, `react-native-zeroconf`, `@noble/*`, `zod` (registry data, MEDIUM)

---
*Stack research for: local Wi-Fi phone-to-PC remote control app*
*Researched: 2026-02-27*
