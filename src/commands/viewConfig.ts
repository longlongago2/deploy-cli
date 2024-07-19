import slash from 'slash';
import { readDeployConfig } from '../utils.js';

export interface ViewConfigOptions {
  config: string;
}

export async function viewConfig(options: ViewConfigOptions): Promise<void> {
  const { config } = options;
  const result = await readDeployConfig(config);
  if (!result.path) {
    console.error('No config found');
    return;
  }
  const { host, port, tasks, privateKey } = result.config;
  const output = {
    path: slash(result.path),
    config: {
      host,
      port,
      username: '***(secret)',
      password: '***(secret)',
      privateKey,
      tasks,
    },
  };
  // depth: null 是 console.dir 方法的一个选项，表示对象的递归深度。设置为 null 意味着没有深度限制，所有嵌套的属性都会被完全展开和显示。
  console.dir(output, { depth: null, colors: true });
}
