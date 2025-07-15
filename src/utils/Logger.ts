export class Logger {
  static log(msg: string) {
    console.log(`\x1b[36m${msg}\x1b[0m`);
  }

  static warn(msg: string) {
    console.warn(`\x1b[33m${msg}\x1b[0m`);
  }

  static error(msg: string) {
    console.error(`\x1b[31m${msg}\x1b[0m`);
  }
}
