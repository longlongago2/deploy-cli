# @nebulae-cli/deploy

> Command line tools for deploying

## Language

[简体中文](./docs/README.zh.md)

## Installation

- Global install

```bash
npm install @nebulae-cli/deploy -g
```

> test `deploy --version`

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
  -m, --module <module>  module type: "commonjs" | "cjs" | "esm" (default: "cjs")
  -h, --help             display help for command
```

### 2. Modify the configuration file

```js
/** @type {import("@nebulae-cli/deploy").ConfigOptions} */
module.exports = {
  host: "xxx.xx.xxx.x",
  port: 22,
  username: "server_ssh_name",
  target: "your/dist/path",
  remoteDir: "/your/server/path",
  autoBackup: true,
  autoClean: false,
  // password: '',
  // privateKey: '',
  // backupDir: '',
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
  -h, --host <host>              server address
  -p, --port <port>              server port (default: "22")
  -u, --username <username>      server username
  -w, --password <password>      server password
  -k, --privateKey <privateKey>  SSH private key path
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
  -c, --config             config file path
  -h, --help               display help for command

Commands:
  init|generate [options]  init(generate) deploy config file
  connect [options]        test the connection to server
  backup [options]         backup remote project from server to local
  clean [options]          clean server directory
  upload [options]         upload local project dist to server
```

you can add scripts to **package.json**

```json
  "scripts": {
    "deploy": "deploy",
  },
```

then, use `npm run deploy`
