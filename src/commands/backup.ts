import path from 'node:path';
import ora from 'ora';
import fs from 'fs-extra';
import {
  createSFTP,
  ensureAbsolutePath,
  existsRemoteDir,
  generateTimestampWithUnderline,
  sftpFastGetDir,
  zipArchiver,
} from '../utils.js';
import type { DeployClient } from './connect.js';

export interface BackupOptions {
  /**
   * 服务器源目录 - 远程路径
   */
  source: string;

  /**
   * 本地备份目录
   */
  dest: string;
}

/**
 * 备份服务器文件到本地 - 前置条件：已连接服务器
 * @param options - 备份配置
 * @param conn - 已连接的 SSH 实例
 */
export async function backup(options: BackupOptions, conn: DeployClient) {
  if (!options) {
    throw new Error('Function backup: options is required');
  }

  if (!conn?.connected) {
    throw new Error('Function backup: ssh server not connected');
  }

  const { source: remoteDir, dest } = options;

  const spinner = ora('开始备份...').start();

  try {
    const localDir = ensureAbsolutePath(dest);
    const timestamp = generateTimestampWithUnderline();
    const localBackupDir = path.resolve(localDir, `backup_${timestamp}`);

    // 检查远程目录是否存在
    const remoteDirStat = await existsRemoteDir(conn, remoteDir);
    if (!remoteDirStat) {
      throw new Error(`Remote directory not exists: ${remoteDir}`);
    }

    // 创建本地备份目录
    fs.ensureDirSync(localBackupDir);

    // 创建 SFTP 实例
    const sftp = await createSFTP(conn);

    // 下载远程目录到本地
    spinner.text = '备份：正在下载文件...';
    await sftpFastGetDir(sftp, remoteDir, localBackupDir);

    // 下载结束，关闭 SFTP 连接
    sftp.end();

    // 压缩文件
    spinner.text = '备份：正在压缩文件...';
    await zipArchiver(localBackupDir, {
      zlib: { level: 9 }, // Sets the compression level.
    });

    // 删除备份目录
    fs.removeSync(localBackupDir);

    spinner.succeed('备份完成');
  } catch (error) {
    spinner.clear();
    conn.end();
    throw new Error(`Backup failed: ${(error as Error).message}`);
  }
}
