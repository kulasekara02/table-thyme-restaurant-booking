import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAllDocuments } from 'yaml'
import { describe, expect, it } from 'vitest'

type ManifestResource = {
  kind: string
  metadata: { name: string; namespace?: string }
  spec?: {
    selector?: unknown
    template?: {
      metadata: { labels: Record<string, string> }
      spec: {
        securityContext: { runAsNonRoot: boolean }
        containers: Array<{
          image: string
          readinessProbe?: unknown
          livenessProbe?: unknown
          securityContext: { readOnlyRootFilesystem: boolean }
        }>
      }
    }
  }
}

describe('blue/green Kubernetes manifests', () => {
  it('routes active traffic to a secure, health-checked deployment slot', () => {
    const source = readFileSync(join(process.cwd(), 'k8s', 'app.yaml'), 'utf8')
    const documents = parseAllDocuments(source)
    expect(documents.flatMap((document) => document.errors)).toHaveLength(0)
    const resources = documents.map(
      (document) => document.toJSON() as ManifestResource,
    )
    const blue = resources.find((resource) => resource.metadata.name === 'fish-blue')
    const green = resources.find((resource) => resource.metadata.name === 'fish-green')
    const activeService = resources.find((resource) => resource.metadata.name === 'fish-active')

    expect(blue?.kind).toBe('Deployment')
    expect(green?.kind).toBe('Deployment')
    expect(activeService?.kind).toBe('Service')

    for (const deployment of [blue, green]) {
      expect(deployment?.metadata.namespace).toBe('fish')
      expect(deployment?.spec?.template?.spec.securityContext.runAsNonRoot).toBe(true)
      expect(deployment?.spec?.template?.spec.containers[0]?.image).toBe('fish-restaurant:placeholder')
      expect(deployment?.spec?.template?.spec.containers[0]?.securityContext.readOnlyRootFilesystem).toBe(true)
      expect(deployment?.spec?.template?.spec.containers[0]?.readinessProbe).toBeDefined()
      expect(deployment?.spec?.template?.spec.containers[0]?.livenessProbe).toBeDefined()
    }

    expect(activeService?.spec?.selector).toEqual({ app: 'fish', version: 'blue' })
    expect(blue?.spec?.template?.metadata.labels).toEqual({ app: 'fish', version: 'blue' })
    expect(green?.spec?.template?.metadata.labels).toEqual({ app: 'fish', version: 'green' })
    expect(
      (blue?.spec?.selector as { matchLabels?: Record<string, string> } | undefined)
        ?.matchLabels,
    ).toEqual(activeService?.spec?.selector)
  })
})
