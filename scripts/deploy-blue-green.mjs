import { spawn, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const argumentsList = process.argv.slice(2)
const rollback = argumentsList.includes('--rollback')

function option(name, fallback) {
  const index = argumentsList.indexOf(name)
  if (index === -1) return fallback
  const value = argumentsList[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`Expected a value after ${name}.`)
  }
  return value
}

const allowedOptions = new Set(['--rollback', '--image', '--cluster', '--port'])
for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index]
  if (!allowedOptions.has(argument)) {
    throw new Error(`Unknown option: ${argument}`)
  }
  if (argument !== '--rollback') index += 1
}

const imageOption = option('--image', '')
const namespace = 'fish'
const cluster = option('--cluster', 'fish-devops')
const port = option('--port', '18080')
const service = 'fish-active'
const colorNames = ['blue', 'green']

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input: options.input,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`)
  }
  return result.stdout?.trim() ?? ''
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  }
}

async function waitForCandidate(version) {
  const forward = spawn(
    'kubectl',
    [
      'port-forward',
      '--address',
      '127.0.0.1',
      '--namespace',
      namespace,
      `deployment/fish-${version}`,
      `${port}:8080`,
    ],
    { stdio: 'ignore' },
  )

  try {
    const url = `http://127.0.0.1:${port}/`
    const deadline = Date.now() + 20_000
    let lastError

    while (Date.now() < deadline) {
      if (forward.exitCode !== null) {
        throw new Error(`kubectl port-forward exited with code ${forward.exitCode}.`)
      }

      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
        if (!response.ok) {
          throw new Error(`Candidate returned HTTP ${response.status}.`)
        }
        const html = await response.text()
        if (!html.includes('<title>Fish')) {
          throw new Error('Candidate response does not contain the Fish page title.')
        }
        return
      } catch (error) {
        lastError = error
        await delay(300)
      }
    }

    throw new Error(`Candidate health check did not pass: ${lastError}`)
  } finally {
    if (forward.exitCode === null) {
      forward.kill()
      await Promise.race([
        new Promise((resolve) => forward.once('exit', resolve)),
        delay(2_000),
      ])
    }
  }
}

async function main() {
  const serviceArgs = ['get', 'service', service, '--namespace', namespace, '-o', 'jsonpath={.spec.selector.version}']
  const serviceResult = capture('kubectl', serviceArgs)
  let activeVersion = serviceResult.stdout
  const bootstrapping = serviceResult.status !== 0

  if (bootstrapping && !serviceResult.stderr.toLowerCase().includes('not found')) {
    throw new Error(`Unable to inspect the active Kubernetes service: ${serviceResult.stderr}`)
  }

  if (!bootstrapping && !colorNames.includes(activeVersion)) {
    throw new Error(`Unexpected active version "${activeVersion}" on service ${service}.`)
  }

  if (rollback && bootstrapping) {
    throw new Error(`Service ${service} is not installed; deploy the app before rolling back.`)
  }

  let image = imageOption
  if (!rollback && !image) {
    image = `fish-restaurant:dev-${Date.now()}`
    const buildArgs = []
    for (const variable of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      if (process.env[variable]) {
        buildArgs.push('--build-arg', `${variable}=${process.env[variable]}`)
      }
    }
    run('docker', ['build', '--tag', image, ...buildArgs, '.'])
    run('kind', ['load', 'docker-image', image, '--name', cluster])
  }

  if (bootstrapping) {
    const manifest = await readFile(new URL('../k8s/app.yaml', import.meta.url), 'utf8')
    run('kubectl', ['apply', '--filename', '-'], {
      input: manifest.replaceAll('fish-restaurant:placeholder', image),
    })
    activeVersion = 'blue'
    run('kubectl', [
      'rollout',
      'status',
      'deployment/fish-blue',
      '--namespace',
      namespace,
      '--timeout=120s',
    ])
    run('kubectl', [
      'rollout',
      'status',
      'deployment/fish-green',
      '--namespace',
      namespace,
      '--timeout=120s',
    ])
  }

  const candidateVersion = activeVersion === 'blue' ? 'green' : 'blue'

  if (!rollback && !bootstrapping) {
    run('kubectl', [
      'set',
      'image',
      `deployment/fish-${candidateVersion}`,
      `web=${image}`,
      '--namespace',
      namespace,
    ])
  }

  console.log(`Waiting for ${candidateVersion} to become ready...`)
  run('kubectl', [
    'rollout',
    'status',
    `deployment/fish-${candidateVersion}`,
    '--namespace',
    namespace,
    '--timeout=120s',
  ])
  await waitForCandidate(candidateVersion)

  run('kubectl', [
    'patch',
    'service',
    service,
    '--namespace',
    namespace,
    '--type=merge',
    '--patch',
    JSON.stringify({ spec: { selector: { app: 'fish', version: candidateVersion } } }),
  ])

  const activeAfterSwitch = capture('kubectl', serviceArgs)
  if (activeAfterSwitch.status !== 0 || activeAfterSwitch.stdout !== candidateVersion) {
    throw new Error('The active service did not switch to the healthy candidate.')
  }

  console.log(
    `${rollback ? 'Rollback' : 'Blue/green deployment'} complete: ${candidateVersion} is active; ${activeVersion} remains available.`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
