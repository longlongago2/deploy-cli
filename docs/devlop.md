# 开发文档

> 项目说明

## 一、使用 Typescript 开发

> 需要打包成js发布使用，保持同等目录打包到`lib`和`esm`文件夹中

> 注意：由于很多依赖包已经不支持 lib - commonjs 导出，例如 chalk新版本只支持ESM, 所以后来 `lib` 全部移除，只保留 esm

```bash
tsc -p tsconfig.lib.json && tsc -p tsconfig.esm.json
```

## 二、命令行工具

> package.json 需要配置bin，用于找到命令

```json
{
  "bin": {
    // 命令行工具名称：脚本地址（使用lib）
    "deploy": "./esm/deploy/index.js"
  }
}
```

## 三、工具包

> 除了命令行，还需要作为工具包提供方法给第三方使用，因此需要声明导出的模块，提供 `esm(es6)` 和 `lib(es5)` 类型的模块依赖包

```json
{
  "exports": {
    "./deploy": {
      "import": "./esm/deploy/index.js",
      "require": "./lib/deploy/index.js"
    }
  }
}
```

## 四、使用ts-node本地测试

> 注意：由于 ts-node 在高版本 node 环境下执行 typscript 文件会报错，[详情 github issue](https://github.com/TypeStrong/ts-node/issues/2100)，改用 bun 代替 ts-node 执行 ts，其作用和ts-node类似。

- ts-node 是一个 TypeScript 执行环境和 REPL，它允许你直接在 Node.js 环境中运行 TypeScript 代码而无需事先将其编译为 JavaScript。

- 它相当于一个桥梁，让你可以在开发阶段直接运行 TypeScript 文件，提高开发效率。

- 使用 ts-node，你可以直接在命令行中运行 TypeScript 文件，或者在项目的 scripts 中使用它来执行 TypeScript 脚本。

例如：

```json
{
  "scripts": {
    "deploy:dev": "ts-node src/deploy/index.ts"
    # 改成
    "deploy:dev": "bun run src/deploy/index.ts",
  }
}
```

**注意**
- 在测试过程中，由于使用 npm 执行scripts，直接传递参数会默认为 npm 的参数，而不会传递给脚本，
- 要解决此问题，可以在 package.json 中的 scripts 执行时继承参数，可以通过使用 npm run 命令后跟 -- 和所需的参数来实现。这样，任何紧随 -- 的参数都会被深入传递给脚本。

例如：

```bash
npm run deploy:dev --help # 此时 --help 参数是传递给 npm 的，而非 deploy:dev
# 要想将参数深入传递到 deploy:dev，需要使用 --
npm run deploy:dev -- --your-argument=value
# 或者
npm run deploy:dev -- --your-argument value
# 具体例子
npm run deploy:dev backup -- --source test
```
