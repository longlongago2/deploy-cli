import { pathToFileURL } from 'node:url';
import { register } from 'node:module';
// To use ESM in ts-node, you need to register the ESM loader
// To resolve issue: https://github.com/TypeStrong/ts-node/issues/2100
// 报错原因：由于 moduleResolution: 'nodenext', 即使是ts，路径解析依然要使用.js，使用.ts 无法解析会报错
// https://github.com/TypeStrong/ts-node/issues/2100#issuecomment-2037275899
register('ts-node/esm', pathToFileURL('./'));
