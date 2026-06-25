/**
 * smoke-mcp.ts — Part A gate, automated. ✅ VERIFIED GREEN against coral-server:latest 2026-06-24.
 *
 * Creates a CoralOS session (echo-agent + user-proxy), opens a thread as the user-proxy, injects
 * an @mention to echo-agent via the Puppet API, and asserts the echo round-trips. If this passes,
 * the MCP transport works and the agent economy is buildable.
 *
 * All routes/shapes below were confirmed against a live server — no longer "confirm-live":
 *   POST /api/v1/local/session                                  → { namespace, sessionId }
 *   POST /api/v1/puppet/{ns}/{sid}/user-proxy/thread            → { thread: { id, ... } }
 *   POST /api/v1/puppet/{ns}/{sid}/user-proxy/thread/message    → { status, message }
 * Auth: `Authorization: Bearer <token>` where token ∈ config [auth] keys (default "dev").
 *
 * PRECONDITIONS (this script does NOT start them):
 *   - coral-server running on CORAL_SERVER_URL (default http://localhost:5555)
 *   - echo-agent + user-proxy images built and registered (docker build ... ; rescan ~5s)
 */
const BASE = process.env.CORAL_SERVER_URL ?? 'http://localhost:5555'
const TOKEN = process.env.CORAL_TOKEN ?? 'dev'
const NS = 'default'
const AUTH = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

const localAgent = (name: string) => ({
  id: { name, version: '0.1.0', registrySourceId: { type: 'local' } },
  name,
  provider: { type: 'local', runtime: 'docker' },
})

async function main() {
  // 1. Create the session (verified SessionRequest shape)
  const sres = await fetch(`${BASE}/api/v1/local/session`, {
    method: 'POST', headers: AUTH,
    body: JSON.stringify({
      agentGraphRequest: { agents: [localAgent('echo-agent'), localAgent('user-proxy')] },
      namespaceProvider: { type: 'create_if_not_exists', namespaceRequest: { name: NS } },
      execution: { mode: 'immediate' },
    }),
  })
  if (!sres.ok) throw new Error(`session create failed: ${sres.status} ${await sres.text()}`)
  const { sessionId } = await sres.json() as { sessionId: string }
  console.error(`[smoke-mcp] session ${sessionId}`)

  // Give coral-server a moment to spawn + connect the agent containers.
  await new Promise(r => setTimeout(r, 6000))

  const puppet = `${BASE}/api/v1/puppet/${NS}/${sessionId}/user-proxy`

  // 2. Open a thread as user-proxy, with echo-agent as a participant
  const tres = await fetch(`${puppet}/thread`, {
    method: 'POST', headers: AUTH,
    body: JSON.stringify({ threadName: 'gate-a', participantNames: ['echo-agent'] }),
  })
  if (!tres.ok) throw new Error(`thread create failed: ${tres.status} ${await tres.text()}`)
  const threadId = (await tres.json() as { thread: { id: string } }).thread.id
  console.error(`[smoke-mcp] thread ${threadId}`)

  // 3. Inject "@echo-agent hello"
  const mres = await fetch(`${puppet}/thread/message`, {
    method: 'POST', headers: AUTH,
    body: JSON.stringify({ threadId, content: '@echo-agent hello', mentions: ['echo-agent'] }),
  })
  if (!mres.ok) throw new Error(`message send failed: ${mres.status} ${await mres.text()}`)

  // 4. Poll the thread for the echo reply
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const gres = await fetch(`${puppet}/thread/${threadId}`, { headers: AUTH })
    if (gres.ok && (await gres.text()).includes('echo: @echo-agent hello')) {
      console.error('[smoke-mcp] PASS — echo round-tripped')
      return
    }
  }
  throw new Error('FAIL — no echo reply within 20s')
}

main().catch((e) => { console.error(`[smoke-mcp] ${e}`); process.exitCode = 1 })
