import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

// Transform only Astro's build-time env and explicitly injected imports.
// Tests never load .env, and every integration uses synthetic credentials.
export async function loadModule(path, { env = {}, imports = {}, transform = source => source } = {}) {
  const url = new URL(`../../${path}`, import.meta.url)
  let source = transform(await readFile(url, 'utf8'))
  source = source.replace(/import\.meta\.env/g, JSON.stringify({ SSR: true, ...env }))
  source = source.replace(/from\s+(['"])([^'"]+)\1/g, (_, quote, specifier) => {
    let target
    if (Object.hasOwn(imports, specifier)) {
      const id = randomUUID()
      globalThis.__securityTestImports ??= new Map()
      globalThis.__securityTestImports.set(id, imports[specifier])
      const exports = Object.keys(imports[specifier]).map(name =>
        `export const ${name} = globalThis.__securityTestImports.get(${JSON.stringify(id)})[${JSON.stringify(name)}];`,
      ).join('\n')
      target = `data:text/javascript;base64,${Buffer.from(exports).toString('base64')}`
    } else {
      target = specifier.startsWith('.') ? new URL(specifier, url).href : import.meta.resolve(specifier)
    }
    return `from ${JSON.stringify(target)}`
  })
  return import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${randomUUID()}`).toString('base64')}`)
}
