import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/next.tsx'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'react/jsx-runtime', 'esbuild'],
});
