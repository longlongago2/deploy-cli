import path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import fs from 'fs-extra';
import { ensureAbsolutePath, existsRemoteDir, connExec, DEFAULT_SSH_PORT } from '../utils.js';
import { connect } from './connect.js';
import { backup } from './backup.js';
import { clean } from './clean.js';
import { upload } from './upload.js';
import type { ConnectOptions, DeployClient } from './connect.js';
import ora from 'ora';

export interface TaskOptions {
  /**
   * 本地项目资源路径（支持目录和单个文件）
   */
  target: string;

  /**
   * 服务器目标路径
   */
  remoteDir: string;

  /**
   * 备份路径，只能备份本地路径，默认 target 同级目录下的 backups 文件夹
   */
  backupDir?: string;

  /**
   * 是否自动备份，默认 true
   */
  autoBackup?: boolean;

  /**
   * 是否自动清理服务器资源，默认 false
   * - autoClean: true 会在部署之前清理服务器目标路径下的所有文件
   * - autoClean: false 不会清理，平滑部署，缺点是可能会有历史文件残留
   */
  autoClean?: boolean;

  /**
   * 部署完成后执行的远程命令, 例如：`['pm2 restart xxx', 'java -jar xxx.jar']` 等
   */
  deployedCommands?: string[];

  /**
   * 部署完成回调
   * @param conn - SSH 连接实例
   */
  onCompleted?: (conn: DeployClient) => void | Promise<void>;
}

export interface DeployOptions extends ConnectOptions {
  tasks?: TaskOptions[];
}

export async function deploy(options: DeployOptions): Promise<void> {
  const { host, port = DEFAULT_SSH_PORT, username, password, privateKey, tasks = [] } = options;

  // 确保所有路径全部转为绝对路径（相对于process.cwd()）
  const _privateKey = privateKey && ensureAbsolutePath(privateKey);

  // 连接服务器
  const conn = await connect({
    host,
    port,
    username,
    password,
    privateKey: _privateKey,
  });

  let outputs = `
---------------------------------------------------------------
                        🚀 SSH 服务器信息
---------------------------------------------------------------
服务器地址: ${chalk.bold.green(host)}
服务器端口: ${chalk.bold.green(port)}
SSH 用户名: ${chalk.bold.green(username)}
----------------------- 🚩 部署任务 ---------------------------`;

  if (!(Array.isArray(tasks) && tasks.length > 0)) {
    // 没有部署任务
    outputs += `\n${chalk.red('❌ 部署任务为空，部署终止')}
---------------------------------------------------------------`;
    console.log(outputs);
    return; // 部署终止
  }

  console.log(outputs);

  // 正式开始部署，顺序执行部署任务
  try {
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index];

      const {
        target,
        remoteDir,
        backupDir,
        autoBackup = true,
        autoClean = false,
        deployedCommands,
        onCompleted,
      } = task;

      const _target = ensureAbsolutePath(target);
      const _backupDir = backupDir
        ? ensureAbsolutePath(backupDir)
        : path.resolve(process.cwd(), './backups'); // 默认备份目录: cwd 目录下 backups 文件夹
      const targetPathStat = await fs.exists(_target); // 目录是否存在
      const remoteDirStat = await existsRemoteDir(conn, remoteDir); // 远程目录是否存在
      const necessary = targetPathStat && remoteDirStat;

      console.log(`${chalk.bold.yellow(`🚩 任务${index + 1}`)}  - ${necessary ? chalk.green('⚡ 该任务准备就绪') : chalk.red('❌ 环境检测未通过，该任务终止')}

  资源路径: ${targetPathStat ? chalk.green('[✓]') : chalk.red('[✗]')} - ${chalk.bold.green(_target)}
  发布目录: ${remoteDirStat ? chalk.green('[✓]') : chalk.red('[✗]')} - ${chalk.bold.green(remoteDir)}
  备份目录: ${chalk.green('[*]')} - ${chalk.bold.green(_backupDir)}
  自动备份: ${autoBackup ? chalk.green('是') : chalk.red('否')}
  自动清理: ${autoClean ? chalk.green('是') : chalk.red('否')}
  部署命令: ${deployedCommands && deployedCommands.length > 0 ? chalk.green('有') : chalk.red('无')}
  部署回调: ${onCompleted ? chalk.green('有') : chalk.red('无')}
`);

      if (!necessary) {
        if (index !== tasks.length - 1) {
          console.log(chalk.yellow('---------------------------------------------------------------'));
        }
        continue; // 当前任务不满足条件，继续下一个任务，不能使用 return，否则会直接终止 deploy 函数
      }

      if (autoBackup) {
        await backup({ source: remoteDir, dest: _backupDir }, conn);
      }

      if (autoClean) {
        await clean({ dir: remoteDir }, conn);
      }

      await upload({ target: _target, dir: remoteDir }, conn);

      if (Array.isArray(deployedCommands) && deployedCommands.length > 0) {
        const spinner = ora('执行远程命令').start();
        const command = deployedCommands.join(' && ');
        await connExec(conn, command);
        spinner.succeed('远程命令执行完毕');
      }

      if (onCompleted) {
        const spinner = ora('执行部署完成回调').start();
        const cb = onCompleted(conn);
        if (cb instanceof Promise) {
          await cb;
          spinner.succeed('执行部署完成回调结束');
        } else {
          spinner.succeed('执行部署完成回调结束');
        }
      }

      console.log(chalk.green(`🎉 部署完成`));
      if (index !== tasks.length - 1) {
        console.log(chalk.yellow('---------------------------------------------------------------'));
      }
    }
    conn.end();
  } catch (error) {
    conn.end();
    throw new Error(`Deploy failed: ${(error as Error).message}`);
  }
}
