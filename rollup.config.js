import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import { terser } from 'rollup-plugin-terser'
import banner from 'rollup-plugin-banner'
import merge from 'deepmerge'

const base = {
  input: 'src/index.js',
  output: {
    file: 'dist/paypresto.js',
    format: 'umd',
    name: 'Presto',
    globals: {
      bsv: 'bsv'
    }
  },
  external: ['bsv']
}

const bannerTxt = 'paypresto.js - v<%= pkg.version %>\n<%= pkg.description %>\n<%= pkg.repository %>\nCopyright © <%= new Date().getFullYear() %> <%= pkg.author %>. MIT License'

export default [
  // Production build minimised
  merge(base, {
    plugins: [
      resolve({ browser: true }),
      replace({ 'process.env.NODE_ENV': JSON.stringify('production') }),
      commonjs(),
      babel({
        exclude: 'node_modules/**',
        babelHelpers: 'bundled'
      }),
      banner(bannerTxt)
    ]
  }),

  // Production build minimised
  merge(base, {
    output: {
      file: 'dist/paypresto.min.js',
    },
    plugins: [
      resolve({ browser: true }),
      replace({ 'process.env.NODE_ENV': JSON.stringify('production') }),
      commonjs(),
      babel({
        exclude: 'node_modules/**',
        babelHelpers: 'bundled'
      }),
      terser(),
      banner(bannerTxt)
    ]
  }),
  
  // Dev build
  merge(base, {
    output: {
      file: 'dist/paypresto.dev.js',
    },
    plugins: [
      resolve({ browser: true }),
      replace({ 'process.env.NODE_ENV': JSON.stringify('development') }),
      commonjs(),
      babel({
        exclude: 'node_modules/**',
        babelHelpers: 'bundled'
      }),
      banner(bannerTxt)
    ]
  })
]
