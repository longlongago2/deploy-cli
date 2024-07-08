import ora from 'ora';
import fs from 'fs-extra';
import { createSFTP, ensureAbsolutePath, existsRemoteDir, sftpFastPutDir } from '../utils.js';
import type { DeployClient } from './connect.js';

export interface UploadOptions {
  /**
   * 本地项目 dist 路径
   */
  target: string;

  /**
   * 服务器目标路径
   */
  dir: string;
}
export async function upload(options: UploadOptions, conn: DeployClient) {
  if (!options) {
    throw new Error('Function upload: options is required');
  }

  if (!conn?.connected) {
    throw new Error('Function upload: ssh server not connected');
  }

  const { dir: remoteDir, target } = options;

  const spinner = ora('开始上传...').start();

  try {
    const localDir = ensureAbsolutePath(target);
    if (!fs.existsSync(localDir)) {
      throw new Error(`Local directory not exists: ${localDir}`);
    }

    const remoteDirExist = await existsRemoteDir(conn, remoteDir);
    if (!remoteDirExist) {
      throw new Error(`Remote directory not exists: ${remoteDir}`);
    }

    // 创建 SFTP 实例
    const sftp = await createSFTP(conn);

    // 上传本地目录到远程
    await sftpFastPutDir(sftp, localDir, remoteDir);

    // 上传成功
    spinner.succeed('上传成功');
    sftp.end();
  } catch (error) {
    spinner.clear();
    conn.end();
    throw new Error(`Upload failed: ${(error as Error).message}`);
  }
}
