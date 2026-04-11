import { BANNER_RULE_WIDTH } from './ui-constants.ts';

const RULE_CHAR = '─';

/** Console banner rule: pad message to `width` with horizontal rules. */
export function bannerLine(msg: string, width: number = BANNER_RULE_WIDTH): void {
  const line = RULE_CHAR.repeat(Math.max(0, width - msg.length));
  console.log(`\n${RULE_CHAR.repeat(4)} ${msg} ${line}`);
}
