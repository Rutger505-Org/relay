# Relay

Friends, DMs and 1:1 voice calls. Based on Rutger505-Org/nextjs-template: same stack, CI/K3s deploy, branch/PR rules and pitfalls, see that repo's AGENTS.md. Below only what differs.

## App
- Prod `https://relay.rutgerpronk.com`, previews `https://pr-<N>.relay.rutgerpronk.com`, namespaces `relay-*`
- tRPC routers in `src/server/api/routers/` (friends, messages, call, me); schema adds `friendship`, `dmMessage`
- Auth adds a password-reset flow (`/forgot-password`, `/reset-password`)
- **Realtime**: SSE at `src/app/api/stream/route.ts` fed by an in-process EventEmitter (`src/server/realtime.ts`): DMs, typing, presence, friend changes, call signaling. **Single pod only**; more replicas need shared pub/sub (e.g. Redis)

## Voice calls (self-hosted LiveKit)
- Details: README "Voice calling (LiveKit)". LiveKit server deployed by `deploy/main.tf` in the app's namespace; keys generated per env, no GitHub secrets
- Signaling via the app ingress at `wss://<host>/rtc` (port 7880); media UDP 7882 / TCP 7881
- Media LoadBalancer pinned to MetalLB `192.168.178.233` in **production only**; previews get a ClusterIP, so **calls failing on previews is expected**. Prod detection: `terraform.workspace == "production"`
- Router must forward UDP 7882 + TCP 7881 to `192.168.178.233`, else signaling works but audio doesn't
- `LIVEKIT_*` env optional; unset → call API returns "Voice calling is not configured on this server."
