import { readDeployConfig } from '../utils.js';

export interface ViewConfigOptions {
  config: string;
}

export async function viewConfig(options: ViewConfigOptions): Promise<void> {
  const { config } = options;
  const result = await readDeployConfig(config);
  // depth: null 是 console.dir 方法的一个选项，表示对象的递归深度。设置为 null 意味着没有深度限制，所有嵌套的属性都会被完全展开和显示。
  console.dir(result, { depth: null, colors: true });
}
