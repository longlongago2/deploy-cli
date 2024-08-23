# @nebulae-cli/deploy

> 用于部署的命令行工具

## 特性

- 🪄 支持多种配置文件格式，如 `json`、`yaml`、`js`。

- 🚩 支持灵活配置多个任务。

- ⚡ 支持单独步骤执行，如 `connect`、`clean`、`backup`、`upload`。

- 🌍 支持全局配置

## 翻译

[English](../README.md)

## 安装

- 全局安装

```bash
npm install @nebulae-cli/deploy -g
```

> 测试命令 `deploy --version`，如果成功显示版本号，则安装成功。

或者

- 项目安装

```bash
npm install @nebulae-cli/deploy -D
```

> 如果没有全局安装，命令应使用 `./node_modules/.bin/deploy --version` 调用

## 使用方法

> 如何使用命令行工具？

### 1. 生成部署配置文件

```bash
deploy init
```

用法:

```bash
Usage: deploy init|generate [options]

init 生成部署配置文件

选项:
  -t, --type <type>      文件类型: "json" | "yaml" | "javascript" (默认: "javascript")
  -m, --module <module>  javascript 模块类型: "commonjs" | "cjs" | "esm" | "mjs" (默认: "cjs")
  -g, --global           生成全局配置文件（系统用户目录下）
  -h, --help             显示命令帮助
```

### 2. 修改配置文件
```js
/** @type {import("@nebulae-cli/deploy").ConfigOptions} */
module.exports = {
  host: 'xxx.xx.xxx.x',
  port: 22,
  username: 'server_ssh_name',
  // logger: true, // 是否启用日志记录
  // logFilePath: 'deploy.log',
  // password: '',
  // privateKey: '',
  // autoBackup: true,
  // autoClean: false, // 如果任务的该属性不存在，此处属性将生效
  tasks: [
    {
      name: 'task name',
      disabled: false, // 是否禁用
      target: 'your/dist/path',
      remoteDir: '/your/server/path',
      autoBackup: true,
      autoClean: false, // 所有属性支持向上合并。例如，所有任务通用的配置可以在根属性上配置
      // backupDir: '',
      // deployedCommands: [], // 部署后执行的远程命令，如 ['cd/var/applications', 'java - jar xxx. jar']，将使用 && 合并多个命令
    },
  ],
};
```

### 3. 测试连接

```bash
deploy connect
```

用法:

```bash
Usage: deploy connect [options]

测试与服务器的连接

选项:
  -h, --host <host>              ssh 服务器地址
  -p, --port <port>              ssh 服务器端口 (默认: "22")
  -u, --username <username>      ssh 服务器用户名
  -w, --password <password>      ssh 服务器密码
  -k, --privateKey <privateKey>  ssh 私钥路径
  -c, --config <config>          配置文件路径
  --help                         显示命令帮助
```

### 4. 部署

```bash
deploy
```

用法:

```bash
Usage: deploy [options] [command]

CLI 用于将项目部署到服务器

选项:
  -V, --version            输出版本号
  -c, --config             配置文件路径
  -h, --help               显示命令帮助
命令:
  init|generate [options]  生成部署配置文件
  connect [options]        测试与服务器的连接
  backup [options]         从服务器备份远程项目到本地
  clean [options]          清理服务器目录
  upload [options]         上传本地项目到 ssh 服务器
```

你可以在 **package.json** 中添加脚本

```json
  "scripts": {
    "deploy": "deploy",
  },
```

然后，使用 `npm run deploy`。

### 5. 其他命令

#### 5.1. 查看配置

```bash
deploy view config
```

用法：

```bash
Usage: deploy view [options] <config>

查看部署配置信息

Options:
  -c, --config <config>  配置文件路径
  -h, --help             显示命令帮助
```

#### 5.2. 打开仓库
  
```bash
deploy repository
# or
deploy repo
```

用法：

```bash
Usage: deploy repository|repo [options]

open repository

Options:
  -h, --help  显示命令帮助
```