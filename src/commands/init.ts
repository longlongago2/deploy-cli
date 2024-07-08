import path from 'node:path';
import url from 'node:url';
import process from 'node:process';
import fs from 'fs-extra';
import Handlebars from 'handlebars';
import ora from 'ora';
import { defaultConfigPaths, findProjectRoot } from '../utils.js';

export interface InitOptions {
  module?: 'commonjs' | 'cjs' | 'esm';
}

const moduleMapToExt = {
  commonjs: '.cjs',
  cjs: '.cjs',
  esm: '.js',
};

export function init(options: InitOptions) {
  const module = options?.module ?? 'cjs';
  const ext = moduleMapToExt[module];
  const exists = defaultConfigPaths.some((configPath) =>
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
    if (!rootPath) {
      throw new Error('Function init: project package.json not found');
    }
    const templateFilePath = path.resolve(rootPath, './templates/deploy.config.hbs');
    const templateContent = fs.readFileSync(templateFilePath, 'utf-8');
    const template = Handlebars.compile(templateContent, { noEscape: true });

    // 根据模板生成配置文件
    const data = {
      lib: '@repo/cli/deploy',
      moduleExportResolution: ext === '.cjs' ? 'module.exports =' : 'export default',
    };
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
