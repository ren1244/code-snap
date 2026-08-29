import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default [
    {
        input: 'src/scan.js',
        output: {
            file: 'dist/scan.bundle.js',
            format: 'iife'
        },
        plugins: [
            nodeResolve(),
            commonjs(),
            terser(),
        ]
    }
];


