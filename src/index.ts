#!/usr/bin/env node

import { initCommands } from './commands/index.js';
import type { TaskOptions } from './commands/deploy.js';
import type { ConnectOptions } from './commands/connect.js';

initCommands();

type CommonTaskOptions = Partial<Omit<TaskOptions, 'name'>>;

type RootConfigOptions = ConnectOptions & CommonTaskOptions;

export interface ConfigOptions extends RootConfigOptions {
  /**
   * 部署任务列表
   */
  tasks?: TaskOptions[];

  /**
   * 是否开启日志记录，默认 false
   */
  logger?: boolean;

  /**
   * 日志文件路径，默认 process.cwd() 下的 deploy.log
   */
  logFilePath?: string;
}

// ConfigOptions 和 DeployOptions 的区别是 ConfigOptions 根属性包含了 TaskOptions 的所有属性（非必填），
// 这样做的目的是为了方便用户在 tasks 数组子项属性的基础上，向上合并配置，这样所有任务通用的配置可以放在 ConfigOptions 根属性上
// 例如：

// const configOptions: ConfigOptions = {
//   host: 'xxx',
//   username: 'xxx',
//   password: 'xxx',
//   autoBackup: true,
//   autoClean: true,
//   tasks: [
//     {
//       name: 'xxx',
//       target: 'xxx',
//       remoteDir: 'xxx',
//       autoBackup: true,
//       deployedCommands: ['pm2 restart xxx'],
//     },
//     {
//       name: 'xxx',
//       target: 'xxx',
//       remoteDir: 'xxx',
//       autoBackup: true,
//       // autoClean: true, // 该属性会自动向上合并，使用 ConfigOptions 根下的 autoClean
//       deployedCommands: ['pm2 restart xxx'],
//     },
//   ],
// };

// ConfigOptions 最终要合并转换成 DeployOptions
// DeployOptions 是真正传递给 deploy 函数的参数
