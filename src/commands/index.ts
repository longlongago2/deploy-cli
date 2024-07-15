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
import { viewConfig } from './viewConfig.js';

export interface DeployArgv {
  config: string;
}

export interface InitArgv {
  type: 'json' | 'yaml' | 'javascript';
  module?: 'commonjs' | 'cjs' | 'esm' | 'mjs';
  global?: boolean;
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
  config?: string;
}

export interface CleanArgv {
  dir: string;
  config?: string;
}

export interface UploadArgv {
  dir: string;
  target: string;
  config?: string;
}

export function initCommands(): void {
  const filename = url.fileURLToPath(import.meta.url);
  const dirname = path.dirname(filename);
  const pkg = readProjectPackageJson(dirname);

  if (!pkg) {
    throw new Error('package.json not found');
  }

  program
    .name('deploy')
    .description('CLI for deploy project to server | CLI 部署工具')
    .version(pkg.version ?? '0.0.0')
    .option('-c, --config', 'config file path')
    .action(async (argv: Partial<DeployArgv>) => {
      try {
        const { config: configFilePath } = argv;
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        await deploy(result.config);
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
    .option('-g, --global', 'generate global config file | 生成全局配置文件')
    .description('init(generate) deploy config file | 生成配置文件')
    .action((argv: Partial<InitArgv>) => {
      try {
        init(argv);
      } catch (error) {
        console.error(`😭 初始化失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program
    .command('connect')
    .description('test the connection to server | 服务器测试连接')
    .option('-h, --host <host>', 'ssh server address')
    .option('-p, --port <port>', 'ssh server port', String(DEFAULT_SSH_PORT))
    .option('-u, --username <username>', 'ssh server username')
    .option('-w, --password <password>', 'ssh server password')
    .option('-k, --privateKey <privateKey>', 'ssh private key path')
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
      } catch (error) {
        console.error(`😭 连接失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1); // 以错误状态退出，会在控制台输出错误信息, process.exit(0) 为正常退出
      }
    });

  program
    .command('backup')
    .description('backup remote project from server to local | 备份服务器项目到本地')
    .option('-s, --source <source>', 'server source dir')
    .option('-d, --dest <dest>', 'local dest dir', 'backups')
    .option('-c, --config <config>', 'config file path')
    .action(async (options: BackupArgv) => {
      try {
        if (!options.dest) {
          throw new Error('local dest dir is required');
        }
        if (!options.source) {
          throw new Error('ssh server source dir is required');
        }
        const { config: configFilePath, ..._backupOptions } = options;
        // 只读取配置文件连接服务器
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        const deployConfig = result.config;
        const conn = await connect({
          host: deployConfig.host,
          port: deployConfig.port,
          username: deployConfig.username,
          password: deployConfig.password,
          privateKey: deployConfig.privateKey,
        });
        // 处理备份配置，只使用命令行参数的配置
        const dest = ensureAbsolutePath(_backupOptions.dest);
        const backupOptions = {
          source: _backupOptions.source,
          dest,
        };
        await backup(backupOptions, conn);
      } catch (error) {
        console.error(`😭 备份失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program
    .command('clean')
    .description('clean server directory | 清除服务器目录')
    .option('-d, --dir <dir>', 'ssh server directory')
    .option('-c, --config <config>', 'config file path')
    .action(async (options: CleanArgv) => {
      try {
        if (!options.dir) {
          throw new Error('ssh server directory is required');
        }
        const { config: configFilePath, ..._cleanOptions } = options;
        // 只读取配置文件连接服务器
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        const conn = await connect(result.config);
        await clean(_cleanOptions, conn);
      } catch (error) {
        console.error(`😭 清理失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program
    .command('upload')
    .description('upload local project dist to ssh server | 上传本地项目到ssh服务器')
    .option('-d, --dir <dir>', 'ssh server directory')
    .option('-t, --target <target>', 'local project source path')
    .option('-c, --config <config>', 'config file path')
    .action(async (options: UploadArgv) => {
      try {
        if (!options.dir) {
          throw new Error('ssh server directory is required');
        }
        if (!options.target) {
          throw new Error('local project source path is required');
        }
        const { config: configFilePath, ..._uploadOptions } = options;
        // 只读取默认配置文件
        const result = await readDeployConfig(configFilePath);
        console.log(chalk.green(`⚡ Load config file: ${result.path}\n`));
        const conn = await connect(result.config);
        const uploadOptions = {
          target: ensureAbsolutePath(_uploadOptions.target),
          dir: _uploadOptions.dir,
        };
        await upload(uploadOptions, conn);
      } catch (error) {
        console.error(`😭 上传失败：${chalk.red((error as Error).message)}\n`);
        process.exit(1);
      }
    });

  program
    .command('view config')
    .description('view deploy config info | 查看部署配置信息')
    .option('-c, --config <config>', 'config file path')
    .action(viewConfig);

  program.parse(process.argv);
}
