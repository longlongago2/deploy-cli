import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import slash from 'slash';
import archiver from 'archiver';
import yaml from 'js-yaml';
import type { ArchiverOptions } from 'archiver';
import type { FileEntryWithStats, SFTPWrapper } from 'ssh2';
import type { ConfigOptions } from './index.js';
import type { ConnectOptions, DeployClient } from './commands/connect.js';
import type { DeployOptions } from './commands/deploy.js';

/**
 * 默认的 SSH 端口
 */
export const DEFAULT_SSH_PORT = 22;

/**
 * 默认的配置文件路径，按顺序查找
 */
export const DEFAULT_CONFIG_PATHS = [
  './deploy.config.js',
  './deploy.config.cjs',
  './deploy.config.mjs',
  './deploy.config.json',
  './deploy.config.yaml',
];

/**
 * 获取带下划线的日期时间字符串
 */
export function generateTimestampWithUnderline(): string {
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
      typeof (config as ConnectOptions).host === 'string' &&
      (config as ConnectOptions).host.trim() !== ''
    )
  ) {
    return { valid: false, err: new Error('Config: invalid or missing host') };
  }
  if (
    !(
      Object.prototype.hasOwnProperty.call(config, 'username') &&
      typeof (config as ConnectOptions).username === 'string' &&
      (config as ConnectOptions).username.trim() !== ''
    )
  ) {
    return {
      valid: false,
      err: new Error('Config: invalid or missing username'),
    };
  }
  return { valid: true };
}

/**
 * 加载部署配置文件
 * @param configPath - 配置文件绝对路径
 */
export async function loadConfigFile(configPath: string): Promise<ConfigOptions> {
  const exists = await fs.pathExists(configPath);
  if (!exists) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const isAbsolute = path.isAbsolute(configPath);
  if (!isAbsolute) {
    throw new Error(`Config file path must be absolute: ${configPath}`);
  }
  let config: ConfigOptions = { host: '', username: '' };
  const ext = path.extname(configPath).toLowerCase();
  if (ext === '.json') {
    config = (await fs.readJson(configPath)) as ConfigOptions;
  } else if (ext === '.cjs') {
    // 使用 CommonJS 模块加载
    const require = createRequire(import.meta.url);
    config = require(configPath) as ConfigOptions;
  } else if (ext === '.js' || ext === '.mjs') {
    // 使用 ES module 加载
    const fileUrl = url.pathToFileURL(configPath).href;
    const module = (await import(fileUrl)) as { default?: ConfigOptions };
    config = (module.default ?? module) as ConfigOptions;
  } else if (ext === '.yaml' || ext === '.yml') {
    // 加载 YAML 文件
    config = yaml.load(await fs.readFile(configPath, 'utf-8')) as ConfigOptions;
  } else {
    throw new Error(`Unsupported config file type: ${configPath}`);
  }
  // 验证配置文件
  const result = validateDeployConfig(config);
  if (!result.valid) {
    throw result.err;
  }
  return config;
}

/**
 * 转换原始配置为部署配置
 * @param config - 原始配置，配置文件中的内容
 */
export function transformToDeployConfig(config: ConfigOptions): DeployOptions {
  const { host, port, username, password, privateKey, tasks, ...taskOptions } = config;
  const deployConfig: DeployOptions = {
    host,
    port,
    username,
    password,
    privateKey,
    tasks: [],
  };
  // 如果配置文件中有 tasks 属性，则合并到 DeployOptions 根属性上
  if (Array.isArray(tasks) && tasks.length > 0) {
    deployConfig.tasks = tasks.map((task) => ({ ...taskOptions, ...task }));
  }
  return deployConfig;
}

/**
 * 读取部署配置
 * @param configPath - 配置文件路径，非必填
 */
export async function readDeployConfig(
  configPath?: string,
): Promise<{ config: DeployOptions; path: string }> {
  // 配置文件绝对路径，把所有路径都转为绝对路径，因为配置文件有可能是相对路径
  let configAbsolutePath = '';
  // 用户不提供，使用默认路径
  if (!configPath) {
    // 优先在当前目录(cwd)查找
    for (const relativePath of DEFAULT_CONFIG_PATHS) {
      const absoluteCwdPath = path.resolve(process.cwd(), relativePath);
      if (fs.pathExistsSync(absoluteCwdPath)) {
        configAbsolutePath = absoluteCwdPath;
        break;
      }
    }
    // 当前目录(cwd)不存在，再在用户目录(homedir)查找
    if (!configAbsolutePath) {
      for (const relativePath of DEFAULT_CONFIG_PATHS) {
        const absoluteHomePath = path.resolve(os.homedir(), relativePath);
        if (fs.pathExistsSync(absoluteHomePath)) {
          configAbsolutePath = absoluteHomePath;
          break;
        }
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
  const configOptions = await loadConfigFile(configAbsolutePath);
  // 将原始配置转换为部署配置
  const deployConfig = transformToDeployConfig(configOptions);
  return { config: deployConfig, path: configAbsolutePath };
}

/**
 * 校验远程目录是否存在
 * @param conn - 已连接的 SSH 实例
 * @param remoteDir - 远程目录
 */
export async function existsRemoteDir(conn: DeployClient, remoteDir: string): Promise<boolean> {
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
export async function sftpFastGet(
  sftp: SFTPWrapper,
  remotePath: string,
  localPath: string,
): Promise<void> {
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
export async function sftpFastPut(
  sftp: SFTPWrapper,
  localPath: string,
  remotePath: string,
): Promise<void> {
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
export async function sftpMkdir(sftp: SFTPWrapper, remotePath: string): Promise<void> {
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
export async function sftpRmdir(sftp: SFTPWrapper, remoteDir: string): Promise<void> {
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
export async function connRmRf(conn: DeployClient, remoteDir: string): Promise<void> {
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
 * 执行远程命令（SSH协议）
 * @param conn - 已连接的 SSH 实例
 * @param command - 执行的命令
 */
export async function connExec(conn: DeployClient, command: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 使用 bash -l 加载登录 shell 配置文件
    const fullCommand = `bash -l -c '${command}'`;
    conn.exec(fullCommand, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let errMessage = '';
      stream.stderr.on('data', (data: Buffer) => {
        errMessage += data.toString();
      });
      stream.on('exit', () => {
        setTimeout(() => {
          if (errMessage.trim()) {
            reject(new Error(errMessage));
            return;
          }
          resolve();
        }, 100);
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
export async function sftpUnlink(sftp: SFTPWrapper, remotePath: string): Promise<void> {
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
export async function sftpReaddir(sftp: SFTPWrapper, remotePath: string): Promise<FileEntryWithStats[]> {
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
): Promise<void> {
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
): Promise<void> {
  const stats = fs.statSync(localDir);
  if (stats.isDirectory()) {
    const list = fs.readdirSync(localDir, { withFileTypes: true });
    const task = [];
    for (const item of list) {
      const localPath = path.join(localDir, item.name);
      const remotePath = path.join(remoteDir, item.name);
      if (item.isDirectory()) {
        task.push(
          sftpMkdir(sftp, remotePath).then(async () =>
            sftpFastPutDir(sftp, localPath, remotePath, callback),
          ),
        );
      } else {
        task.push(sftpFastPut(sftp, localPath, remotePath));
      }
    }
    await Promise.all(task);
  } else {
    const filename = path.basename(localDir);
    await sftpFastPut(sftp, localDir, path.join(remoteDir, filename));
  }
}

/**
 * 判断远程目录是否为空
 * @param sftp - SFTP协议 实例
 * @param remoteDir - 远程目录
 */
export async function sftpIsEmptyDir(sftp: SFTPWrapper, remoteDir: string): Promise<boolean> {
  const list = await sftpReaddir(sftp, remoteDir);
  return list.length === 0;
}

/**
 * 创建 SFTP 实例
 * @param conn - 已连接的 SSH 实例
 */
export async function createSFTP(conn: DeployClient): Promise<SFTPWrapper> {
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
export async function zipArchiver(dirPath: string, options: ArchiverOptions = {}): Promise<void> {
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

export interface PackageJson {
  [key: string]: any; // 允许其他任意字段
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/**
 * 读取项目 package.json
 * @param startDir - 起始位置
 */
export function readProjectPackageJson(startDir: string): PackageJson | null {
  const rootPath = findProjectRoot(startDir);
  let pkg: PackageJson | null = null;
  if (rootPath) {
    // 读取项目 package.json
    const pkgPath = path.resolve(rootPath, 'package.json');
    const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
    pkg = JSON.parse(pkgContent) as PackageJson;
  }
  return pkg;
}

/**
 * 打开文件（异步返回 ChildProcess，可通过监听获取进程状态）
 * @param filePath - 文件路径
 */
export function openFile(filePath: string): ReturnType<typeof spawn> | null {
  const _filePath = slash(filePath);

  let cmd = '';
  let args: string[] = [];

  switch (process.platform) {
    case 'darwin':
      cmd = 'open';
      args = [_filePath];
      break;
    case 'win32':
      cmd = 'cmd';
      args = ['/c', 'start', _filePath];
      break;
    case 'linux':
      cmd = 'xdg-open';
      args = [_filePath];
      break;
    default:
      break;
  }

  if (cmd) {
    return spawn(cmd, args, { stdio: 'inherit' });
  }
  return null;
}
