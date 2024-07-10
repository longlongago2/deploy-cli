import path from 'node:path';
import url from 'node:url';
import process from 'node:process';
import fs from 'fs-extra';
import Handlebars from 'handlebars';
import ora from 'ora';
import { DEFAULT_CONFIG_PATHS, findProjectRoot, readProjectPackageJson } from '../utils.js';

export interface InitOptions {
  /**
   * 文件类型
   */
  type?: 'json' | 'yaml' | 'javascript';

  /**
   * javascript 模块导出方式
   */
  module?: 'commonjs' | 'cjs' | 'esm' | 'mjs';
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

export function init(options: InitOptions) {
  const type = options?.type ?? 'javascript';
  const module = options?.module ?? 'cjs';
  let ext;
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
    const __filename = url.fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const rootPath = findProjectRoot(__dirname);
    const pkg = readProjectPackageJson(__dirname);
    if (!(rootPath && pkg?.name)) {
      throw new Error('Function init: project package.json name not found');
    }
    let templateFilePath; // 模板文件路径
    let data = {}; // 模板参数
    if (type === 'json') {
      templateFilePath = path.resolve(__dirname, '../../templates/deploy.config.json.hbs');
    } else if (type === 'yaml') {
      templateFilePath = path.resolve(__dirname, '../../templates/deploy.config.yaml.hbs');
    } else {
      templateFilePath = path.resolve(__dirname, '../../templates/deploy.config.js.hbs');
      data = {
        lib: pkg.name,
        moduleExportResolution: ext === '.cjs' ? 'module.exports =' : 'export default',
      };
    }
    const templateContent = fs.readFileSync(templateFilePath, 'utf-8');
    const template = Handlebars.compile(templateContent, { noEscape: true });
    const result = template(data);

    // 写入配置文件
    const outputFilePath = path.resolve(process.cwd(), `deploy.config${ext}`);
    fs.writeFileSync(outputFilePath, result, 'utf-8');

    spinner.succeed(`配置文件创建成功：deploy.config${ext}`);
  } catch (error) {
    spinner.clear();
    throw new Error(`Generate deploy.config${ext} failed: ${(error as Error).message}`);
  }
}
