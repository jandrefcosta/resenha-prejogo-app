/**
 * args.ts — CLI argument parser that works both when called directly
 * (tsx script.ts --reset --club=flamengo) and via npm run
 * (npm run seed:x -- --reset --club=flamengo).
 *
 * When npm runs a script, flags passed after `--` are converted to
 * environment variables: --reset → npm_config_reset=true,
 * --club=flamengo → npm_config_club=flamengo.
 * They are NOT forwarded as process.argv entries.
 *
 * This module reads both sources and merges them, so scripts work
 * identically regardless of how they are invoked.
 */

const argv = process.argv.slice(2);
const env  = process.env;

/** Returns true if the flag was passed as --flag or via npm_config_flag=true */
export function hasFlag(name: string): boolean {
  return argv.includes(`--${name}`) || env[`npm_config_${name}`] === 'true';
}

/**
 * Returns true if either --reset or --force was passed.
 * Both names are accepted for the "delete and re-populate" intent.
 */
export function hasReset(): boolean {
  return hasFlag('reset') || hasFlag('force');
}

/** Returns the value of --key=value or npm_config_key, or undefined */
export function getArg(name: string): string | undefined {
  const fromArgv = argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  return fromArgv ?? env[`npm_config_${name}`];
}
