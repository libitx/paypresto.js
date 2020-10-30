require('dotenv').config()
import babel from '@rollup/plugin-babel'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import { terser } from 'rollup-plugin-terser'
import banner from 'rollup-plugin-banner'

export default [
  /**
   * Entry: Paypresto Web
   */
  {
    input: 'src/index.js',
    output: [
      // 1. Full browser build
      {
        file: 'dist/paypresto.js',
        format: 'umd',
        name: 'Paypresto',
        globals: {
          bsv: 'bsvjs',
          txforge: 'TxForge'
        }
      },
      // 2. Minimised browser build
      {
        file: 'dist/paypresto.min.js',
        format: 'iife',
        name: 'Paypresto',
        globals: {
          bsv: 'bsvjs',
          txforge: 'TxForge'
        },
        plugins: [
          terser()
        ]
      }
    ],
    external: ['bsv', 'txforge'],
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      babel({
        exclude: 'node_modules/**',
        babelHelpers: 'bundled'
      }),
      replace({ 'process.env.API_HOST': 'undefined' }),
      banner('paypresto.js - v<%= pkg.version %>\n<%= pkg.description %>\n<%= pkg.repository %>\nCopyright © <%= new Date().getFullYear() %> Chronos Labs Ltd. Apache-2.0 License')
    ]
  },

  /**
   * Entry: Paypresto Dev
   */
  {
    input: 'src/index.js',
    output: {
      file: 'dist/paypresto.dev.js',
      format: 'umd',
      name: 'Paypresto',
      globals: {
        bsv: 'bsvjs',
        txforge: 'TxForge'
      }
    },
    external: ['bsv', 'txforge'],
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      babel({
        exclude: 'node_modules/**',
        babelHelpers: 'bundled'
      }),
      replace({ 'process.env.API_HOST': JSON.stringify(process.env.API_HOST) })
    ]
  }
]