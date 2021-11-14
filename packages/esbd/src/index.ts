import init from './cli';
import type { ConfigFn, EsbdConfigResult } from './config';

export type { BuildMode, CommandName, ConfigFn, EsbdConfig, EsbdConfigResult } from './config';

export default function esbd(
  config: EsbdConfigResult | EsbdConfigResult[] | ConfigFn,
): void | Promise<void> {
  init();
}
