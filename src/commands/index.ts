import path from 'node:path';
import url from 'node:url';
import chalk from 'chalk';
import { program } from 'commander';
import {
  ensureAbsolutePath,
  readDeployConfig,
  readProjectPackageJson,
  DEFAULT_SSH_PORT,
} from '../utils.js';
import { connect } from './connect.js';
import { deploy } from './deploy.js';
import { backup } from './backup.js';
import { clean } from './clean.js';
import { init } from './init.js';
import { upload } from './upload.js';

export interface DeployArgv {
  config: string;
}

export interface InitArgv {
  type: 'json' | 'yaml' | 'javascript';
  module?: 'commonjs' | 'cjs' | 'esm' | 'mjs';
}

export interface ConnectArgv {
  host: string;
  port: number;
  username: string;
  password: string;
  privateKey: string;
  config: string;
}

export interface BackupArgv {
  source: string;
  dest: string;
  config: string;
}

export interface CleanArgv {
  dir: string;
  config: string;
}

export interface UploadArgv {
  dir: string;
  target: string;
  config: string;
}

export function initCommands() {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pkg = readProjectPackageJson(__dirname);

  if (!pkg) {
    throw new Error('package.json not found');
  }

  program
    .name('deploy')
    .description('CLI for deploy project to server | CLI 部署工具')
    .version(pkg.version || '0.0.0')
    .option('-c, --config', 'config file path')
    .action(async (argv: Partial<DeployArgv>) => {
      try {
        const { config: configFilePath } = argv;
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        await deploy(result.config);
        process.exit(0); // 以正常状态退出
      } catch (error) {
        console.error(`😭 部署失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1); // 以错误状态退出，会在控制台输出错误信息
      }
    });

  program
    .command('init')
    .alias('generate')
    .alias('gen')
    .option('-t, --type <type>', 'file type: "json" | "yaml" | "javascript"', 'javascript')
    .option('-m, --module <module>', 'javascript module type: "commonjs" | "cjs" | "esm" | "mjs"', 'cjs')
    .description('init(generate) deploy config file | 生成配置文件')
    .action((argv: Partial<InitArgv>) => {
      try {
        init(argv);
        process.exit(0);
      } catch (error) {
        console.error(`😭 初始化失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program
    .command('connect')
    .description('test the connection to server | 服务器测试连接')
    .option('-h, --host <host>', 'server address')
    .option('-p, --port <port>', 'server port', String(DEFAULT_SSH_PORT))
    .option('-u, --username <username>', 'server username')
    .option('-w, --password <password>', 'server password')
    .option('-k, --privateKey <privateKey>', 'SSH private key path')
    .option('-c, --config <config>', 'config file path')
    .action(async (argv: Partial<ConnectArgv>) => {
      try {
        const { config: configFilePath, ..._connectOptions } = argv;
        // 读取配置文件
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        // 如果读取到了配置文件，则合并配置文件和命令行参数的配置，命令行参数优先级高
        const deployConfig = result.config;
        const connectOptions = {
          host: deployConfig.host,
          port: deployConfig.port,
          username: deployConfig.username,
          password: deployConfig.password,
          privateKey: deployConfig.privateKey,
          ..._connectOptions,
        };
        const conn = await connect(connectOptions);
        conn.end(); // 测试完成后立即断开连接
        process.exit(0); // 以正常状态退出
      } catch (error) {
        console.error(`😭 连接失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1); // 以错误状态退出，会在控制台输出错误信息
      }
    });

  program
    .command('backup')
    .description('backup remote project from server to local | 备份服务器项目到本地')
    .option('-s, --source <source>', 'server source path')
    .option('-d, --dest <dest>', 'local dest path', 'backups')
    .option('-c, --config <config>', 'config file path')
    .action(async (options: Partial<BackupArgv>) => {
      try {
        const { config: configFilePath, ..._backupOptions } = options;
        // 只读取配置文件连接服务器
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        const conn = await connect(result.config);
        // 处理备份配置：合并配置文件和命令行参数的配置，命令行参数优先级高
        const deployConfig = result.config;
        const dest = deployConfig.backupDir
          ? ensureAbsolutePath(deployConfig.backupDir)
          : path.resolve(ensureAbsolutePath(deployConfig.target), '../backups'); // 不填默认备份在 target 同级目录下的 backups 文件夹
        const backupOptions = {
          source: deployConfig.remoteDir,
          dest,
          ..._backupOptions,
        };
        await backup(backupOptions, conn);
        process.exit(0);
      } catch (error) {
        console.error(`😭 备份失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program
    .command('clean')
    .description('clean server directory | 清除服务器目录')
    .option('-d, --dir <dir>', 'remote server directory')
    .option('-c, --config <config>', 'config file path')
    .action(async (options: Partial<CleanArgv>) => {
      try {
        const { config: configFilePath, ..._cleanOptions } = options;
        // 只读取配置文件连接服务器
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        const conn = await connect(result.config);
        // 处理清理配置：合并配置文件和命令行参数的配置，命令行参数优先级高
        const deployConfig = result.config;
        const cleanOptions = {
          dir: deployConfig.remoteDir,
          ..._cleanOptions,
        };
        await clean(cleanOptions, conn);
        process.exit(0);
      } catch (error) {
        console.error(`😭 清理失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program
    .command('upload')
    .description('upload local project dist to server | 上传本地项目到服务器')
    .option('-d, --dir <dir>', 'remote server directory')
    .option('-t, --target <target>', 'local project dist path')
    .option('-c, --config <config>', 'config file path')
    .action(async (options: Partial<UploadArgv>) => {
      try {
        const { config: configFilePath, ..._uploadOptions } = options;
        // 只读取默认配置文件
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        const conn = await connect(result.config);
        // 处理上传配置：合并配置文件和命令行参数的配置，命令行参数优先级高
        const deployConfig = result.config;
        const uploadOptions = {
          target: ensureAbsolutePath(deployConfig.target),
          dir: deployConfig.remoteDir,
          ..._uploadOptions,
        };
        await upload(uploadOptions, conn);
        process.exit(0);
      } catch (error) {
        console.error(`😭 上传失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program.parse(process.argv);
}
