import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  splitting: true,
})
