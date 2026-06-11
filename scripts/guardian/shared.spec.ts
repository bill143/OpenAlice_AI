import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readPortsFile, resolvePortConfig } from './shared.js'

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'guardian-ports-'))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

async function writePortsFile(content: string): Promise<void> {
  await mkdir(join(home, 'data', 'config'), { recursive: true })
  await writeFile(join(home, 'data', 'config', 'ports.json'), content)
}

describe('readPortsFile', () => {
  it('missing file → empty config (defaults apply downstream)', async () => {
    expect(await readPortsFile(home)).toEqual({})
  })

  it('reads partial config — only the keys present', async () => {
    await writePortsFile('{ "web": 12345 }')
    expect(await readPortsFile(home)).toEqual({ web: 12345 })
  })

  it('reads all four ports', async () => {
    await writePortsFile('{ "web": 18331, "mcp": 18332, "uta": 18333, "ui": 15173 }')
    expect(await readPortsFile(home)).toEqual({ web: 18331, mcp: 18332, uta: 18333, ui: 15173 })
  })

  it('fails loud on broken JSON instead of silently defaulting', async () => {
    await writePortsFile('{ web: oops')
    await expect(readPortsFile(home)).rejects.toThrow(/not valid JSON/)
  })

  it('fails loud on a non-object payload', async () => {
    await writePortsFile('[47331]')
    await expect(readPortsFile(home)).rejects.toThrow(/must be a JSON object/)
  })

  it('fails loud on a non-integer / out-of-range port value', async () => {
    await writePortsFile('{ "web": "47331x" }')
    await expect(readPortsFile(home)).rejects.toThrow(/invalid port/)
    await writePortsFile('{ "mcp": 70000 }')
    await expect(readPortsFile(home)).rejects.toThrow(/invalid port/)
  })
})

describe('resolvePortConfig', () => {
  it('defaults when neither env nor file provide a value', () => {
    expect(resolvePortConfig({}, {})).toEqual({
      web: { value: 47331, source: 'default' },
      mcp: { value: 47332, source: 'default' },
      uta: { value: 47333, source: 'default' },
      ui: { value: 5173, source: 'default' },
    })
  })

  it('file beats default; env beats file', () => {
    const cfg = resolvePortConfig(
      { OPENALICE_WEB_PORT: '15000' },
      { web: 12345, mcp: 12346 },
    )
    expect(cfg.web).toEqual({ value: 15000, source: 'env' })
    expect(cfg.mcp).toEqual({ value: 12346, source: 'file' })
    expect(cfg.uta).toEqual({ value: 47333, source: 'default' })
    expect(cfg.ui).toEqual({ value: 5173, source: 'default' })
  })

  it('ui port follows the same precedence as the backend trio', () => {
    expect(resolvePortConfig({ OPENALICE_UI_PORT: '15173' }, { ui: 16173 }).ui)
      .toEqual({ value: 15173, source: 'env' })
    expect(resolvePortConfig({}, { ui: 16173 }).ui)
      .toEqual({ value: 16173, source: 'file' })
  })

  it('empty-string env var is treated as unset', () => {
    const cfg = resolvePortConfig({ OPENALICE_WEB_PORT: '' }, { web: 12345 })
    expect(cfg.web).toEqual({ value: 12345, source: 'file' })
  })

  it('fails loud on a malformed env value', () => {
    expect(() => resolvePortConfig({ OPENALICE_MCP_PORT: 'banana' }, {})).toThrow(/invalid port/)
  })
})
