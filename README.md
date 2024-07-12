# @nebulae-cli/deploy

> Command line tools for deploying

## Features

- 🪄 Support multiple configuration file formats, such as `json`, `yaml`, `js`.

- 🚩 Supports configuring multiple tasks.

- ⚡ Supports individual step execution, such as `connect`, `clean`, `backup`, `upload`.

## Translations

[简体中文](./docs/README.zh.md)

## Installation

- Global install

```bash
npm install @nebulae-cli/deploy -g
```

> test `deploy --version`, If the version number is successfully displayed, it means the installation is successful

or

- Project install

```bash
npm install @nebulae-cli/deploy -D
```

> If you did not install globally, the command should be invoked using `./node_modules/.bin/deploy --version`

## Usage

> How to use command line tools?

### 1. Generate deploy config file

```bash
deploy init
```

usage:

```bash
Usage: deploy init|generate [options]

init(generate) deploy config file

Options:
  -t, --type <type>      file type: "json" | "yaml" | "javascript" (default: "javascript")
  -m, --module <module>  javascript module type: "commonjs" | "cjs" | "esm" | "mjs" (default: "cjs")
  -h, --help             display help for command
```

### 2. Modify the configuration file

```js
/** @type {import("@nebulae-cli/deploy").ConfigOptions} */
module.exports = {
  host: 'xxx.xx.xxx.x',
  port: 22,
  username: 'server_ssh_name',
  // password: '',
  // privateKey: '',
  // autoBackup: true,
  // autoClean: false, // If the task attribute does not exist, it will take effect
  tasks: [
    {
      target: 'your/dist/path',
      remoteDir: '/your/server/path',
      autoBackup: true,
      autoClean: false, // All attributes support upward merging. For example, configuration common to all tasks can be configured on the root property
      // backupDir: '',
      // deployedCommands: [], // Remote commands executed after deployment, such as ['cd/var/applications', 'java - jar xxx. jar'], will use && to merge multiple commands
    },
  ],
};
```

### 3. Test the connection

```bash
deploy connect
```

usage:

```bash
Usage: deploy connect [options]

test the connection to server

Options:
  -h, --host <host>              ssh server address
  -p, --port <port>              ssh server port (default: "22")
  -u, --username <username>      ssh server username
  -w, --password <password>      ssh server password
  -k, --privateKey <privateKey>  ssh private key path
  -c, --config <config>          config file path
  --help                         display help for command
```

### 4. Deploy

```bash
deploy
```

useage:

```bash
Usage: deploy [options] [command]

CLI for deploy project to server

Options:
  -V, --version            output the version number
  -c, --config             config file path
  -h, --help               display help for command

Commands:
  init|generate [options]  init(generate) deploy config file
  connect [options]        test the connection to server
  backup [options]         backup remote project from server to local
  clean [options]          clean server directory
  upload [options]         upload local project dist to ssh server
```

you can add scripts to **package.json**

```json
  "scripts": {
    "deploy": "deploy",
  },
```

then, use `npm run deploy`
