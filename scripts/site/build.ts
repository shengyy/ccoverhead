// Assemble GitHub Pages from the same version, palette and previews as the plugin.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { colorOf } from '../../plugin/hooks/format'

const repo = resolve(import.meta.dir, '../..')
const out = resolve(process.argv[2] ?? join(repo, '_site'))
const { version } = JSON.parse(readFileSync(join(repo, 'plugin/.claude-plugin/plugin.json'), 'utf8'))
const revision = `${version}-${process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'}`
const palette = Array.from({ length: 10 }, (_, tier) =>
  `<span style="background:${colorOf({ text: '', tier })}" aria-hidden="true"></span>`,
).join('')

mkdirSync(join(out, 'assets'), { recursive: true })
cpSync(join(repo, 'site'), out, { recursive: true })
for (const directory of ['brand', 'screenshots']) {
  cpSync(join(repo, 'assets', directory), join(out, 'assets', directory), { recursive: true })
}
const html = readFileSync(join(out, 'index.html'), 'utf8')
  .replaceAll('{{version}}', version)
  .replaceAll('{{assetRevision}}', revision)
  .replaceAll('{{palette}}', palette)
if (/\{\{\w+\}\}/.test(html)) throw new Error('Unresolved site template value')
writeFileSync(join(out, 'index.html'), html)
console.log(`ccOverhead v${version} site: ${out}`)
