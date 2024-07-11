# @nebulae-cli/deploy

> 用于本地执行部署的命令行工具

## 语言

[English](../README.md)

## 安装

- 全局安装

```bash
npm install @nebulae-cli/deploy -g
```

> 测试命令 `deploy --version`

或者

- 项目级安装

```bash
npm install @nebulae-cli/deploy -D
```

> 如果你不是全局安装，则无法注册全局命令，你必须在项目根目录找到脚本路径执行 `./node_modules/.bin/deploy --version`

## 使用

> 如何使用此工具？

### 1. 生成配置文件

```bash
deploy init
```

用法：

```bash
Usage: deploy init|generate [options]

init(generate) deploy config file | 生成配置文件

Options:
  -m, --module <module>  module type: "commonjs" | "cjs" | "esm" (default: "cjs")
  -h, --help             display help for command
```

### 2. 修改配置文件

```js
/** @type {import("@nebulae-cli/deploy").ConfigOptions} */
module.exports = {
  host: 'xxx.xx.xxx.x',
  port: 22,
  username: 'server_ssh_name',
  // password: '',
  // privateKey: '',
  tasks: [
    {
      target: 'your/dist/path',
      remoteDir: '/your/server/path',
      autoBackup: true,
      autoClean: false,
      // backupDir: '',
      // deployedCommands: [], // 部署完成后执行的远程命令，例如：['cd /var/applications', 'java -jar xxx.jar'], 多个命令会使用 && 合并
    },
  ],
};
```

### 3. 测试服务器连接

```bash
deploy connect
```

用法:

```bash
Usage: deploy connect [options]

test the connection to server | 服务器测试连接

Options:
  -h, --host <host>              server address
  -p, --port <port>              server port (default: "22")
  -u, --username <username>      server username
  -w, --password <password>      server password
  -k, --privateKey <privateKey>  SSH private key path
  -c, --config <config>          config file path
  --help                         display help for command
```

### 4. 执行部署

```bash
deploy
```

用法：

```bash
Usage: deploy [options] [command]
  -c, --config             config file path | 指定配置文件路径
  -h, --help               display help for command | 帮助

Commands:
  init|generate [options]  init(generate) deploy config file | 生成配置文件
  connect [options]        test the connection to server | 服务器测试连接
  backup [options]         backup remote project from server to local | 备份服务器项目到本地
  clean [options]          clean server directory | 清除服务器目录
  upload [options]         upload local project dist to server | 上传本地项目到服务器
```

你可以将命令添加到 **package.json** 中的 `scripts`:

```json
  "scripts": {
    "deploy": "deploy",
  },
```

然后，使用 `npm run deploy`
