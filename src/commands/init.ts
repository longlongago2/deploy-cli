import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import process from 'node:process';
import fs from 'fs-extra';
import Handlebars from 'handlebars';
import ora from 'ora';
import { DEFAULT_CONFIG_PATHS, openFile, readProjectPackageJson } from '../utils.js';

export interface InitOptions {
  /**
   * 文件类型
   */
  type?: 'json' | 'yaml' | 'javascript';

  /**
   * javascript 模块导出方式
   */
  module?: 'commonjs' | 'cjs' | 'esm' | 'mjs';

  /**
   * 是否生成全局配置：默认 false，在 cwd 下生成，如果为 true，则在用户目录下生成
   */
  global?: boolean;
}

const mapToExt = {
  json: '.json',
  yaml: '.yaml',
  javascript: {
    commonjs: '.cjs',
    cjs: '.cjs',
    esm: '.js',
    mjs: '.mjs',
  },
};

export function init(options: InitOptions): void {
  const type = options.type ?? 'javascript';
  const module = options.module ?? 'cjs';
  const global = options.global ?? false;
  let ext = '.cjs';
  if (type === 'javascript') {
    ext = mapToExt[type][module];
  } else {
    ext = mapToExt[type];
  }
  const exists = DEFAULT_CONFIG_PATHS.some((configPath) =>
    fs.existsSync(path.resolve(process.cwd(), configPath)),
  );
  if (exists) {
    throw new Error('Function init: config file already exists');
  }

  const spinner = ora(`正在创建配置文件：deploy.config${ext}`).start();

  try {
    const filename = url.fileURLToPath(import.meta.url);
    const dirname = path.dirname(filename);
    const pkg = readProjectPackageJson(dirname);
    if (!pkg?.name) {
      throw new Error('Function init: CLI project package.json name not found');
    }
    let templateFilePath = ''; // 模板文件路径
    let data = {}; // 模板参数
    if (type === 'json') {
      templateFilePath = path.resolve(dirname, '../../templates/deploy.config.json.hbs');
    } else if (type === 'yaml') {
      templateFilePath = path.resolve(dirname, '../../templates/deploy.config.yaml.hbs');
    } else {
      templateFilePath = path.resolve(dirname, '../../templates/deploy.config.js.hbs');
      data = {
        lib: pkg.name,
        moduleExportResolution: ext === '.cjs' ? 'module.exports =' : 'export default',
      };
    }
    const templateContent = fs.readFileSync(templateFilePath, 'utf-8');
    const template = Handlebars.compile(templateContent, { noEscape: true });
    const result = template(data);

    // 写入配置文件
    let outputFilePath = '';
    if (global) {
      outputFilePath = path.resolve(os.homedir(), `deploy.config${ext}`);
    } else {
      outputFilePath = path.resolve(process.cwd(), `deploy.config${ext}`);
    }
    fs.writeFileSync(outputFilePath, result, 'utf-8');

    spinner.succeed(`配置文件创建成功：${outputFilePath}`);
    // 打开配置文件
    openFile(outputFilePath);
  } catch (error) {
    spinner.clear();
    throw new Error(`Generate deploy.config${ext} failed: ${(error as Error).message}`);
  }
}
