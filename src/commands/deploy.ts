import path from 'node:path';
import chalk from 'chalk';
import fs from 'fs-extra';
import { ensureAbsolutePath, existsRemoteDir, connExec, DEFAULT_SSH_PORT } from '../utils.js';
import { connect } from './connect.js';
import { backup } from './backup.js';
import { clean } from './clean.js';
import { upload } from './upload.js';
import type { ConnectOptions, DeployClient } from './connect.js';
import ora from 'ora';

export interface ConfigOptions extends ConnectOptions {
  /**
   * 本地项目 dist 路径
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

export async function deploy(options: ConfigOptions) {
  const {
    host,
    port = DEFAULT_SSH_PORT,
    username,
    password,
    privateKey,
    target,
    remoteDir,
    backupDir,
    autoBackup = true,
    autoClean = false,
    deployedCommands,
    onCompleted,
  } = options;
  // 确保所有路径全部转为绝对路径（相对于process.cwd()）
  const _privateKey = privateKey && ensureAbsolutePath(privateKey);
  const _target = ensureAbsolutePath(target);
  // 默认备份路径为 target 同级目录下的 backups 文件夹
  const _backupDir = backupDir ? ensureAbsolutePath(backupDir) : path.resolve(_target, '../backups');

  // 连接服务器
  const conn = await connect({
    host,
    port,
    username,
    password,
    privateKey: _privateKey,
  });

  const targetPathStat = await fs.exists(_target); // 目录是否存在
  const remoteDirStat = await existsRemoteDir(conn, remoteDir); // 远程目录是否存在

  console.log(`
---------------------------------------------------------------
                        🚀 部署配置
---------------------------------------------------------------
服务器地址:   ${chalk.bold.green(host)}
服务器端口:   ${chalk.bold.green(port)}
SSH 用户名:   ${chalk.bold.green(username)}
前置自动备份: ${chalk.bold.green(autoBackup ? '是' : '否')}
前置自动清理: ${chalk.bold.green(autoClean ? '是' : '否')}
----------------------- 🚩 环境检测 ---------------------------
远程发布目录: ${remoteDirStat ? chalk.green('[✓]') : chalk.red('[✗]')} - ${chalk.bold.green(remoteDir)} 
本地资源目录: ${targetPathStat ? chalk.green('[✓]') : chalk.red('[✗]')} - ${chalk.bold.green(_target)}
本地备份路径: ${chalk.green('[*]')} - ${chalk.bold.green(_backupDir)}
---------------------------------------------------------------
${chalk.bold.bgRed(' 注意 ')} ${chalk.gray('✓ (pass) | ✗ (fail) | * (auto)')}
`);

  const necessary = targetPathStat && remoteDirStat;
  if (!necessary) {
    console.log(chalk.red('❌ 部署环境检测未通过，部署终止'));
    conn.end();
    return;
  }

  // 正式开始部署
  try {
    if (autoBackup) {
      await backup({ source: remoteDir, dest: _backupDir }, conn);
    }

    if (autoClean) {
      await clean({ dir: remoteDir }, conn);
    }

    await upload({ target: _target, dir: remoteDir }, conn);

    if (Array.isArray(deployedCommands) && deployedCommands.length > 0) {
      const spinner = ora('执行远程命令').start();
      const tasks = deployedCommands.map((cmd) => connExec(conn, cmd));
      await Promise.all(tasks);
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

    console.log(chalk.green('🎉 部署成功'));
    conn.end();
  } catch (error) {
    conn.end();
    throw new Error(`Deploy failed: ${(error as Error).message}`);
  }
}
