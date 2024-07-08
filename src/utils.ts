import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import fs from 'fs-extra';
import slash from 'slash';
import archiver from 'archiver';
import type { ArchiverOptions } from 'archiver';
import type { FileEntryWithStats, SFTPWrapper } from 'ssh2';
import type { ConfigOptions } from './commands/deploy.js';
import type { DeployClient } from './commands/connect.js';

/**
 * 默认的配置文件路径，按顺序查找
 */
export const defaultConfigPaths = ['./deploy.config.js', './deploy.config.cjs', './deploy.config.json'];

/**
 * 获取带下划线的日期时间字符串
 */
export function generateTimestampWithUnderline() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0'); // 月份是从0开始的
  const day = String(today.getDate()).padStart(2, '0');
  const hour = String(today.getHours()).padStart(2, '0');
  const minute = String(today.getMinutes()).padStart(2, '0');
  const second = String(today.getSeconds()).padStart(2, '0');
  return [year, month, day, hour, minute, second].join('_');
}

type ValidateDeployConfigResult = { valid: true } | { valid: false; err: Error };

/**
 * 校验部署配置是否合法
 * @param config - 部署配置
 */
export function validateDeployConfig(config: unknown): ValidateDeployConfigResult {
  if (!config) {
    return { valid: false, err: new Error('Config is required') };
  }
  if (
    !(
      Object.prototype.hasOwnProperty.call(config, 'host') &&
      typeof (config as ConfigOptions).host === 'string' &&
      (config as ConfigOptions).host.trim() !== ''
    )
  ) {
    return { valid: false, err: new Error('Config: invalid or missing host') };
  }
  if (
    !(
      Object.prototype.hasOwnProperty.call(config, 'username') &&
      typeof (config as ConfigOptions).username === 'string' &&
      (config as ConfigOptions).username.trim() !== ''
    )
  ) {
    return {
      valid: false,
      err: new Error('Config: invalid or missing username'),
    };
  }
  if (
    !(
      Object.prototype.hasOwnProperty.call(config, 'target') &&
      typeof (config as ConfigOptions).target === 'string' &&
      (config as ConfigOptions).target.trim() !== ''
    )
  ) {
    return {
      valid: false,
      err: new Error('Config: invalid or missing target'),
    };
  }
  if (
    !(
      Object.prototype.hasOwnProperty.call(config, 'remoteDir') &&
      typeof (config as ConfigOptions).remoteDir === 'string' &&
      (config as ConfigOptions).remoteDir.trim() !== ''
    )
  ) {
    return {
      valid: false,
      err: new Error('Config: invalid or missing remoteDir'),
    };
  }
  return { valid: true };
}

/**
 * 加载部署配置文件
 * @param configPath - 配置文件绝对路径
 */
export async function loadDeployConfig(configPath: string) {
  const exists = await fs.pathExists(configPath);
  if (!exists) {
    return { err: new Error(`Config file not found: ${configPath}`) };
  }
  const isAbsolute = path.isAbsolute(configPath);
  if (!isAbsolute) {
    return {
      err: new Error(`Config file path must be absolute: ${configPath}`),
    };
  }
  try {
    const ext = path.extname(configPath).toLowerCase();
    let config: ConfigOptions;
    if (ext === '.json') {
      config = (await fs.readJson(configPath)) as ConfigOptions;
    } else if (ext === '.cjs') {
      // 使用 CommonJS 模块加载
      const require = createRequire(import.meta.url);
      config = require(configPath) as ConfigOptions;
    } else if (ext === '.js') {
      // 使用 ES module 加载
      const fileUrl = url.pathToFileURL(configPath).href;
      const module = (await import(fileUrl)) as { default: ConfigOptions };
      config = module.default || module;
    } else {
      return { err: new Error(`Unsupported config file type: ${configPath}`) };
    }
    // 验证配置文件
    const result = validateDeployConfig(config);
    if (!result.valid) {
      return { err: result.err };
    }
    return { config };
  } catch (err) {
    return { err: err as Error };
  }
}

/**
 * 读取部署配置
 * @param configPath - 配置文件路径，非必填
 */
export async function readDeployConfig(configPath?: string) {
  // 配置文件绝对路径，把所有路径都转为绝对路径，因为配置文件有可能是相对路径
  let configAbsolutePath;
  if (!configPath) {
    // 用户不提供，使用默认路径
    for (const relativePath of defaultConfigPaths) {
      const absolutePath = path.resolve(process.cwd(), relativePath);
      if (fs.pathExistsSync(absolutePath)) {
        configAbsolutePath = absolutePath;
        break;
      }
    }
  } else if (path.isAbsolute(configPath)) {
    // 用户指定，绝对路径
    configAbsolutePath = configPath;
  } else {
    // 用户指定，相对路径
    configAbsolutePath = path.resolve(process.cwd(), configPath);
  }
  // 验证配置文件是否存在
  if (!(configAbsolutePath && fs.pathExistsSync(configAbsolutePath))) {
    throw new Error(
      'Config file not found.\n\n- Default config: deploy.config.(c)js or deploy.config.json.\n- Custom config: specify the argument -c or --config.',
    );
  }
  // 加载配置文件
  const { config, err } = await loadDeployConfig(configAbsolutePath);
  if (err) {
    throw new Error(`Load config file failed (${configAbsolutePath}): ${err.message}`);
  }
  return { config, path: configAbsolutePath };
}

/**
 * 校验远程目录是否存在
 * @param conn - 已连接的 SSH 实例
 * @param remoteDir - 远程目录
 */
export async function existsRemoteDir(conn: DeployClient, remoteDir: string) {
  return new Promise<boolean>((resolve) => {
    conn.sftp((err, sftp) => {
      if (err) {
        resolve(false);
        return;
      }
      sftp.stat(remoteDir, (errStat) => {
        if (errStat) {
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  });
}

/**
 * 从远程服务器下载文件到本地（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param remotePath - 远程文件路径
 * @param localPath - 本地文件路径
 */
export async function sftpFastGet(sftp: SFTPWrapper, remotePath: string, localPath: string) {
  return new Promise<void>((resolve, reject) => {
    // IMPORTANT:
    // 由于SFTP协议是基于POSIX规范的，所以路径分隔符必须是`/`，而非`\`
    // 路径必须符合POSIX规范，如：`/path/to/file`，而非 `\path\to\file`
    // 否则会报错：Error: No such file
    // 为了安全起见，所以路径使用`slash`格式化，下同。
    const _remotePath = slash(remotePath);
    const _localPath = slash(localPath);
    sftp.fastGet(_remotePath, _localPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * 上传文件到远程服务器（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param localPath - 本地文件路径
 * @param remotePath - 远程文件路径
 */
export async function sftpFastPut(sftp: SFTPWrapper, localPath: string, remotePath: string) {
  return new Promise<void>((resolve, reject) => {
    const _localPath = slash(localPath);
    const _remotePath = slash(remotePath);
    sftp.fastPut(_localPath, _remotePath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * 创建远程目录（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param remotePath - 远程目录路径
 */
export async function sftpMkdir(sftp: SFTPWrapper, remotePath: string) {
  const _remotePath = slash(remotePath);
  return new Promise<void>((resolve, reject) => {
    sftp.mkdir(_remotePath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * 删除远程目录，只能删除空目录，否则报错（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param remoteDir - 远程目录路径
 */
export async function sftpRmdir(sftp: SFTPWrapper, remoteDir: string) {
  const _remoteDir = slash(remoteDir);
  return new Promise<void>((resolve, reject) => {
    sftp.rmdir(_remoteDir, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * 删除远程目录及其所有子目录和文件
 * @param conn - 已连接的 SSH 实例
 * @param remoteDir - 远程目录路径
 */
export async function connRmRf(conn: DeployClient, remoteDir: string) {
  const _remoteDir = slash(remoteDir);
  return new Promise<void>((resolve, reject) => {
    conn.exec(`rm -rf ${_remoteDir}`, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      stream.on('exit', () => {
        resolve();
      });
    });
  });
}

/**
 * 删除远程文件（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param remotePath - 远程文件路径
 * @returns
 */
export async function sftpUnlink(sftp: SFTPWrapper, remotePath: string) {
  const _remotePath = slash(remotePath);
  return new Promise<void>((resolve, reject) => {
    sftp.unlink(_remotePath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * 读取远程目录（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param remotePath - 远程目录路径
 * @returns
 */
export async function sftpReaddir(sftp: SFTPWrapper, remotePath: string) {
  const _remotePath = slash(remotePath);
  return new Promise<FileEntryWithStats[]>((resolve, reject) => {
    sftp.readdir(_remotePath, (err, list) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(list);
    });
  });
}

/**
 * 下载远程目录到本地（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param remoteDir - 远程目录
 * @param localDir - 本地目录
 */
export async function sftpFastGetDir(
  sftp: SFTPWrapper,
  remoteDir: string,
  localDir: string,
  callback?: (file: FileEntryWithStats) => void,
) {
  const list = await sftpReaddir(sftp, remoteDir);
  const task = [];
  for (const item of list) {
    const remotePath = path.join(remoteDir, item.filename);
    const localPath = path.join(localDir, item.filename);
    if (item.attrs.isDirectory()) {
      fs.ensureDirSync(localPath);
      task.push(sftpFastGetDir(sftp, remotePath, localPath, callback));
    } else {
      task.push(sftpFastGet(sftp, remotePath, localPath));
    }
  }
  await Promise.all(task);
}

/**
 * 上传本地目录到远程（SFTP协议）
 * @param sftp - SFTP协议 实例
 * @param localDir - 本地目录
 * @param remoteDir - 远程目录
 * @param callback - 回调函数
 */
export async function sftpFastPutDir(
  sftp: SFTPWrapper,
  localDir: string,
  remoteDir: string,
  callback?: (file: FileEntryWithStats) => void,
) {
  const list = fs.readdirSync(localDir, { withFileTypes: true });
  const task = [];
  for (const item of list) {
    const localPath = path.join(localDir, item.name);
    const remotePath = path.join(remoteDir, item.name);
    if (item.isDirectory()) {
      task.push(
        sftpMkdir(sftp, remotePath).then(() => sftpFastPutDir(sftp, localPath, remotePath, callback)),
      );
    } else {
      task.push(sftpFastPut(sftp, localPath, remotePath));
    }
  }
  await Promise.all(task);
}

/**
 * 判断远程目录是否为空
 * @param sftp - SFTP协议 实例
 * @param remoteDir - 远程目录
 */
export async function sftpIsEmptyDir(sftp: SFTPWrapper, remoteDir: string) {
  const list = await sftpReaddir(sftp, remoteDir);
  return list.length === 0;
}

/**
 * 创建 SFTP 实例
 * @param conn - 已连接的 SSH 实例
 */
export async function createSFTP(conn: DeployClient) {
  return new Promise<SFTPWrapper>((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(sftp);
    });
  });
}

/**
 * 压缩目录为 zip 文件（压缩到同级目录）
 * @param dirPath - 压缩目标
 * @param options - 配置项
 */
export async function zipArchiver(dirPath: string, options: ArchiverOptions = {}) {
  return new Promise<void>((resolve, reject) => {
    const zipFilePath = `${dirPath}.zip`;
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', options);
    output.on('close', () => {
      resolve();
    });
    archive.on('error', (err) => {
      reject(err);
    });
    archive.pipe(output);
    // 添加到dirPath文件夹的同级目录
    archive.directory(dirPath, path.basename(dirPath));
    void archive.finalize();
  });
}

/**
 * 确保路径为绝对路径，
 * - 相对路径转换绝对路径相对于 process.cwd()
 * @param inputPath - 输入路径
 */
export function ensureAbsolutePath(inputPath: string): string {
  if (!path.isAbsolute(inputPath)) {
    return path.resolve(process.cwd(), inputPath);
  }
  return inputPath;
}

/**
 * 查找项目根目录，逐级向上查找，直到找到 package.json 文件
 * @param startDir - 起始位置
 */
export function findProjectRoot(startDir: string): string | null {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    const pkgPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}
