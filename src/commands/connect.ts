import readlineSync from 'readline-sync';
import ora from 'ora';
import chalk from 'chalk';
import { Client } from 'ssh2';
import { DEFAULT_SSH_PORT, ensureAbsolutePath } from '../utils.js';

export interface ConnectOptions {
  /**
   * SSH 服务器地址
   */
  host: string;

  /**
   * SSH 端口号，默认 22
   */
  port?: number;

  /**
   * SSH 用户名
   */
  username: string;

  /**
   * SSH 密码，如果 password 和 privateKey 都不存在，则连接服务器时，会提示输入密码
   */
  password?: string;

  /**
   * SSH 私钥路径，优先级高于密码
   */
  privateKey?: string;
}

export interface DeployClient extends Client {
  connected?: boolean;
}

/**
 * 连接服务器
 * @param options - 连接服务器配置
 */
export async function connect(options: ConnectOptions) {
  if (!options) {
    throw new Error('function connect: options is required');
  }

  const { host, port = DEFAULT_SSH_PORT, username, password, privateKey } = options;

  const passport = password || privateKey;

  const _privateKey = privateKey && ensureAbsolutePath(privateKey);

  let _password = password;

  if (!passport) {
    // 如果没有密码和私钥，则交互要求用户输入密码
    console.log(chalk.black.bold.bgYellow('    Server Account    '));
    console.log(`${chalk.gray.underline(' USERNAME ')}: ${chalk.gray(username)}`);
    _password = await readlineSync.question(`${chalk.gray.underline(' PASSWORD ')}: `, {
      hideEchoBack: true,
    });
    // 输入完成后清屏，防止密码暴露在终端
    console.clear();
  }

  const spinner = ora('正在连接服务器...').start();

  // 创建 SSH 连接实例
  const conn: DeployClient = new Client();
  conn.connected = false;

  return new Promise<DeployClient>((resolve, reject) => {
    conn
      .on('ready', () => {
        conn.connected = true;
        spinner.succeed('服务器连接成功');
        resolve(conn);
      })
      .on('error', (err) => {
        conn.connected = false;
        spinner.clear();
        reject(err);
      })
      .on('end', () => {
        conn.connected = false;
        spinner.clear();
        reject(new Error('SSH Client :: end'));
      })
      .on('close', () => {
        conn.connected = false;
        spinner.clear();
        reject(new Error('SSH Client :: close'));
      })
      .on('timeout', () => {
        conn.connected = false;
        spinner.clear();
        reject(new Error('SSH Client :: timeout'));
      })
      .connect({
        host,
        port,
        username,
        password: _password,
        privateKey: _privateKey,
        readyTimeout: 20000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
      });
  });
}
