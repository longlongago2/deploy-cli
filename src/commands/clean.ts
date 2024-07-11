import ora from 'ora';
import { connRmRf, createSFTP, existsRemoteDir, sftpMkdir } from '../utils.js';
import type { DeployClient } from './connect.js';

export interface CleanOptions {
  /**
   * 服务器目标路径
   */
  dir: string;
}

export async function clean(options: CleanOptions, conn: DeployClient): Promise<void> {
  if (!conn.connected) {
    throw new Error('Function clean: ssh server not connected');
  }

  const { dir: remoteDir } = options;

  const spinner = ora('开始清理...').start();

  try {
    // 检查远程目录是否存在
    const remoteDirStat = await existsRemoteDir(conn, remoteDir);
    if (!remoteDirStat) {
      throw new Error(`Remote directory not exists: ${remoteDir}`);
    }

    // 创建 SFTP 实例
    const sftp = await createSFTP(conn);

    // 删除远程目录下的所有文件
    await connRmRf(conn, remoteDir);

    // 重新创建一个新的远程目录
    await sftpMkdir(sftp, remoteDir);

    // 删除完成，关闭 SFTP 连接
    sftp.end();

    spinner.succeed('清理完成');
  } catch (error) {
    spinner.clear();
    console.error(error);
    conn.end();
    throw new Error(`Clean failed: ${(error as Error).message}`);
  }
}
