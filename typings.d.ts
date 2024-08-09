declare module 'eslint-plugin-prettier/recommended' {
  import type { ConfigWithExtends } from 'typescript-eslint';
  const recommendedConfig: ConfigWithExtends;
  export = recommendedConfig;
}
