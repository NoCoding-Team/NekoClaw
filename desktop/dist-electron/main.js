"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path = require("path");
const fs$1 = require("fs/promises");
const os = require("os");
const require$$0$1 = require("events");
const require$$0 = require("node:crypto");
const require$$1 = require("child_process");
const require$$3 = require("stream");
const require$$5 = require("url");
const fs = require("fs");
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var nodeCron = {};
var inlineScheduledTask = {};
var runner = {};
var createId = {};
var hasRequiredCreateId;
function requireCreateId() {
  if (hasRequiredCreateId) return createId;
  hasRequiredCreateId = 1;
  var __importDefault = createId && createId.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(createId, "__esModule", { value: true });
  createId.createID = createID;
  const node_crypto_1 = __importDefault(require$$0);
  function createID(prefix = "", length = 16) {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const values = node_crypto_1.default.randomBytes(length);
    const id = Array.from(values, (v) => charset[v % charset.length]).join("");
    return prefix ? `${prefix}-${id}` : id;
  }
  return createId;
}
var logger = {};
var hasRequiredLogger;
function requireLogger() {
  if (hasRequiredLogger) return logger;
  hasRequiredLogger = 1;
  Object.defineProperty(logger, "__esModule", { value: true });
  const levelColors = {
    INFO: "\x1B[36m",
    WARN: "\x1B[33m",
    ERROR: "\x1B[31m",
    DEBUG: "\x1B[35m"
  };
  const GREEN = "\x1B[32m";
  const RESET = "\x1B[0m";
  function log(level, message, extra) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const color = levelColors[level] ?? "";
    const prefix = `[${timestamp}] [PID: ${process.pid}] ${GREEN}[NODE-CRON]${GREEN} ${color}[${level}]${RESET}`;
    const output = `${prefix} ${message}`;
    switch (level) {
      case "ERROR":
        console.error(output, extra ?? "");
        break;
      case "DEBUG":
        console.debug(output, extra ?? "");
        break;
      case "WARN":
        console.warn(output);
        break;
      case "INFO":
      default:
        console.info(output);
        break;
    }
  }
  const logger$1 = {
    info(message) {
      log("INFO", message);
    },
    warn(message) {
      log("WARN", message);
    },
    error(message, err) {
      if (message instanceof Error) {
        log("ERROR", message.message, message);
      } else {
        log("ERROR", message, err);
      }
    },
    debug(message, err) {
      if (message instanceof Error) {
        log("DEBUG", message.message, message);
      } else {
        log("DEBUG", message, err);
      }
    }
  };
  logger.default = logger$1;
  return logger;
}
var trackedPromise = {};
var hasRequiredTrackedPromise;
function requireTrackedPromise() {
  if (hasRequiredTrackedPromise) return trackedPromise;
  hasRequiredTrackedPromise = 1;
  Object.defineProperty(trackedPromise, "__esModule", { value: true });
  trackedPromise.TrackedPromise = void 0;
  class TrackedPromise {
    constructor(executor) {
      __publicField(this, "promise");
      __publicField(this, "error");
      __publicField(this, "state");
      __publicField(this, "value");
      this.state = "pending";
      this.promise = new Promise((resolve, reject) => {
        executor((value) => {
          this.state = "fulfilled";
          this.value = value;
          resolve(value);
        }, (error) => {
          this.state = "rejected";
          this.error = error;
          reject(error);
        });
      });
    }
    getPromise() {
      return this.promise;
    }
    getState() {
      return this.state;
    }
    isPending() {
      return this.state === "pending";
    }
    isFulfilled() {
      return this.state === "fulfilled";
    }
    isRejected() {
      return this.state === "rejected";
    }
    getValue() {
      return this.value;
    }
    getError() {
      return this.error;
    }
    then(onfulfilled, onrejected) {
      return this.promise.then(onfulfilled, onrejected);
    }
    catch(onrejected) {
      return this.promise.catch(onrejected);
    }
    finally(onfinally) {
      return this.promise.finally(onfinally);
    }
  }
  trackedPromise.TrackedPromise = TrackedPromise;
  return trackedPromise;
}
var hasRequiredRunner;
function requireRunner() {
  if (hasRequiredRunner) return runner;
  hasRequiredRunner = 1;
  var __importDefault = runner && runner.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(runner, "__esModule", { value: true });
  runner.Runner = void 0;
  const create_id_1 = requireCreateId();
  const logger_1 = __importDefault(requireLogger());
  const tracked_promise_1 = requireTrackedPromise();
  function emptyOnFn() {
  }
  function emptyHookFn() {
    return true;
  }
  function defaultOnError(date, error) {
    logger_1.default.error("Task failed with error!", error);
  }
  class Runner {
    constructor(timeMatcher2, onMatch, options) {
      __publicField(this, "timeMatcher");
      __publicField(this, "onMatch");
      __publicField(this, "noOverlap");
      __publicField(this, "maxExecutions");
      __publicField(this, "maxRandomDelay");
      __publicField(this, "runCount");
      __publicField(this, "running");
      __publicField(this, "heartBeatTimeout");
      __publicField(this, "onMissedExecution");
      __publicField(this, "onOverlap");
      __publicField(this, "onError");
      __publicField(this, "beforeRun");
      __publicField(this, "onFinished");
      __publicField(this, "onMaxExecutions");
      this.timeMatcher = timeMatcher2;
      this.onMatch = onMatch;
      this.noOverlap = options == void 0 || options.noOverlap === void 0 ? false : options.noOverlap;
      this.maxExecutions = options == null ? void 0 : options.maxExecutions;
      this.maxRandomDelay = (options == null ? void 0 : options.maxRandomDelay) || 0;
      this.onMissedExecution = (options == null ? void 0 : options.onMissedExecution) || emptyOnFn;
      this.onOverlap = (options == null ? void 0 : options.onOverlap) || emptyOnFn;
      this.onError = (options == null ? void 0 : options.onError) || defaultOnError;
      this.onFinished = (options == null ? void 0 : options.onFinished) || emptyHookFn;
      this.beforeRun = (options == null ? void 0 : options.beforeRun) || emptyHookFn;
      this.onMaxExecutions = (options == null ? void 0 : options.onMaxExecutions) || emptyOnFn;
      this.runCount = 0;
      this.running = false;
    }
    start() {
      this.running = true;
      let lastExecution;
      let expectedNextExecution;
      const scheduleNextHeartBeat = (currentDate) => {
        if (this.running) {
          clearTimeout(this.heartBeatTimeout);
          this.heartBeatTimeout = setTimeout(heartBeat, getDelay(this.timeMatcher, currentDate));
        }
      };
      const runTask = (date) => {
        return new Promise(async (resolve) => {
          const execution = {
            id: (0, create_id_1.createID)("exec"),
            reason: "scheduled"
          };
          const shouldExecute = await this.beforeRun(date, execution);
          const randomDelay = Math.floor(Math.random() * this.maxRandomDelay);
          if (shouldExecute) {
            setTimeout(async () => {
              try {
                this.runCount++;
                execution.startedAt = /* @__PURE__ */ new Date();
                const result = await this.onMatch(date, execution);
                execution.finishedAt = /* @__PURE__ */ new Date();
                execution.result = result;
                this.onFinished(date, execution);
                if (this.maxExecutions && this.runCount >= this.maxExecutions) {
                  this.onMaxExecutions(date);
                  this.stop();
                }
              } catch (error) {
                execution.finishedAt = /* @__PURE__ */ new Date();
                execution.error = error;
                this.onError(date, error, execution);
              }
              resolve(true);
            }, randomDelay);
          }
        });
      };
      const checkAndRun = (date) => {
        return new tracked_promise_1.TrackedPromise(async (resolve, reject) => {
          try {
            if (this.timeMatcher.match(date)) {
              await runTask(date);
            }
            resolve(true);
          } catch (err) {
            reject(err);
          }
        });
      };
      const heartBeat = async () => {
        const currentDate = nowWithoutMs();
        if (expectedNextExecution && expectedNextExecution.getTime() < currentDate.getTime()) {
          while (expectedNextExecution.getTime() < currentDate.getTime()) {
            logger_1.default.warn(`missed execution at ${expectedNextExecution}! Possible blocking IO or high CPU user at the same process used by node-cron.`);
            expectedNextExecution = this.timeMatcher.getNextMatch(expectedNextExecution);
            runAsync(this.onMissedExecution, expectedNextExecution, defaultOnError);
          }
        }
        if (lastExecution && lastExecution.getState() === "pending") {
          runAsync(this.onOverlap, currentDate, defaultOnError);
          if (this.noOverlap) {
            logger_1.default.warn("task still running, new execution blocked by overlap prevention!");
            expectedNextExecution = this.timeMatcher.getNextMatch(currentDate);
            scheduleNextHeartBeat(currentDate);
            return;
          }
        }
        lastExecution = checkAndRun(currentDate);
        expectedNextExecution = this.timeMatcher.getNextMatch(currentDate);
        scheduleNextHeartBeat(currentDate);
      };
      this.heartBeatTimeout = setTimeout(() => {
        heartBeat();
      }, getDelay(this.timeMatcher, nowWithoutMs()));
    }
    nextRun() {
      return this.timeMatcher.getNextMatch(/* @__PURE__ */ new Date());
    }
    stop() {
      this.running = false;
      if (this.heartBeatTimeout) {
        clearTimeout(this.heartBeatTimeout);
        this.heartBeatTimeout = void 0;
      }
    }
    isStarted() {
      return !!this.heartBeatTimeout && this.running;
    }
    isStopped() {
      return !this.isStarted();
    }
    async execute() {
      const date = /* @__PURE__ */ new Date();
      const execution = {
        id: (0, create_id_1.createID)("exec"),
        reason: "invoked"
      };
      try {
        const shouldExecute = await this.beforeRun(date, execution);
        if (shouldExecute) {
          this.runCount++;
          execution.startedAt = /* @__PURE__ */ new Date();
          const result = await this.onMatch(date, execution);
          execution.finishedAt = /* @__PURE__ */ new Date();
          execution.result = result;
          this.onFinished(date, execution);
        }
      } catch (error) {
        execution.finishedAt = /* @__PURE__ */ new Date();
        execution.error = error;
        this.onError(date, error, execution);
      }
    }
  }
  runner.Runner = Runner;
  async function runAsync(fn, date, onError) {
    try {
      await fn(date);
    } catch (error) {
      onError(date, error);
    }
  }
  function getDelay(timeMatcher2, currentDate) {
    const maxDelay = 864e5;
    const nextRun = timeMatcher2.getNextMatch(currentDate);
    const now = /* @__PURE__ */ new Date();
    const delay = nextRun.getTime() - now.getTime();
    if (delay > maxDelay) {
      return maxDelay;
    }
    return Math.max(0, delay);
  }
  function nowWithoutMs() {
    const date = /* @__PURE__ */ new Date();
    date.setMilliseconds(0);
    return date;
  }
  return runner;
}
var timeMatcher = {};
var convertion = {};
var monthNamesConversion = {};
var hasRequiredMonthNamesConversion;
function requireMonthNamesConversion() {
  if (hasRequiredMonthNamesConversion) return monthNamesConversion;
  hasRequiredMonthNamesConversion = 1;
  Object.defineProperty(monthNamesConversion, "__esModule", { value: true });
  monthNamesConversion.default = /* @__PURE__ */ (() => {
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december"
    ];
    const shortMonths = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec"
    ];
    function convertMonthName(expression, items) {
      for (let i = 0; i < items.length; i++) {
        expression = expression.replace(new RegExp(items[i], "gi"), i + 1);
      }
      return expression;
    }
    function interprete(monthExpression) {
      monthExpression = convertMonthName(monthExpression, months);
      monthExpression = convertMonthName(monthExpression, shortMonths);
      return monthExpression;
    }
    return interprete;
  })();
  return monthNamesConversion;
}
var weekDayNamesConversion = {};
var hasRequiredWeekDayNamesConversion;
function requireWeekDayNamesConversion() {
  if (hasRequiredWeekDayNamesConversion) return weekDayNamesConversion;
  hasRequiredWeekDayNamesConversion = 1;
  Object.defineProperty(weekDayNamesConversion, "__esModule", { value: true });
  weekDayNamesConversion.default = /* @__PURE__ */ (() => {
    const weekDays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday"
    ];
    const shortWeekDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    function convertWeekDayName(expression, items) {
      for (let i = 0; i < items.length; i++) {
        expression = expression.replace(new RegExp(items[i], "gi"), i);
      }
      return expression;
    }
    function convertWeekDays(expression) {
      expression = expression.replace("7", "0");
      expression = convertWeekDayName(expression, weekDays);
      return convertWeekDayName(expression, shortWeekDays);
    }
    return convertWeekDays;
  })();
  return weekDayNamesConversion;
}
var asteriskToRangeConversion = {};
var hasRequiredAsteriskToRangeConversion;
function requireAsteriskToRangeConversion() {
  if (hasRequiredAsteriskToRangeConversion) return asteriskToRangeConversion;
  hasRequiredAsteriskToRangeConversion = 1;
  Object.defineProperty(asteriskToRangeConversion, "__esModule", { value: true });
  asteriskToRangeConversion.default = /* @__PURE__ */ (() => {
    function convertAsterisk(expression, replecement) {
      if (expression.indexOf("*") !== -1) {
        return expression.replace("*", replecement);
      }
      return expression;
    }
    function convertAsterisksToRanges(expressions) {
      expressions[0] = convertAsterisk(expressions[0], "0-59");
      expressions[1] = convertAsterisk(expressions[1], "0-59");
      expressions[2] = convertAsterisk(expressions[2], "0-23");
      expressions[3] = convertAsterisk(expressions[3], "1-31");
      expressions[4] = convertAsterisk(expressions[4], "1-12");
      expressions[5] = convertAsterisk(expressions[5], "0-6");
      return expressions;
    }
    return convertAsterisksToRanges;
  })();
  return asteriskToRangeConversion;
}
var rangeConversion = {};
var hasRequiredRangeConversion;
function requireRangeConversion() {
  if (hasRequiredRangeConversion) return rangeConversion;
  hasRequiredRangeConversion = 1;
  Object.defineProperty(rangeConversion, "__esModule", { value: true });
  rangeConversion.default = /* @__PURE__ */ (() => {
    function replaceWithRange(expression, text, init, end, stepTxt) {
      const step = parseInt(stepTxt);
      const numbers = [];
      let last = parseInt(end);
      let first = parseInt(init);
      if (first > last) {
        last = parseInt(init);
        first = parseInt(end);
      }
      for (let i = first; i <= last; i += step) {
        numbers.push(i);
      }
      return expression.replace(new RegExp(text, "i"), numbers.join());
    }
    function convertRange(expression) {
      const rangeRegEx = /(\d+)-(\d+)(\/(\d+)|)/;
      let match = rangeRegEx.exec(expression);
      while (match !== null && match.length > 0) {
        expression = replaceWithRange(expression, match[0], match[1], match[2], match[4] || "1");
        match = rangeRegEx.exec(expression);
      }
      return expression;
    }
    function convertAllRanges(expressions) {
      for (let i = 0; i < expressions.length; i++) {
        expressions[i] = convertRange(expressions[i]);
      }
      return expressions;
    }
    return convertAllRanges;
  })();
  return rangeConversion;
}
var hasRequiredConvertion;
function requireConvertion() {
  if (hasRequiredConvertion) return convertion;
  hasRequiredConvertion = 1;
  var __importDefault = convertion && convertion.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(convertion, "__esModule", { value: true });
  const month_names_conversion_1 = __importDefault(requireMonthNamesConversion());
  const week_day_names_conversion_1 = __importDefault(requireWeekDayNamesConversion());
  const asterisk_to_range_conversion_1 = __importDefault(requireAsteriskToRangeConversion());
  const range_conversion_1 = __importDefault(requireRangeConversion());
  convertion.default = /* @__PURE__ */ (() => {
    function appendSeccondExpression(expressions) {
      if (expressions.length === 5) {
        return ["0"].concat(expressions);
      }
      return expressions;
    }
    function removeSpaces(str) {
      return str.replace(/\s{2,}/g, " ").trim();
    }
    function normalizeIntegers(expressions) {
      for (let i = 0; i < expressions.length; i++) {
        const numbers = expressions[i].split(",");
        for (let j = 0; j < numbers.length; j++) {
          numbers[j] = parseInt(numbers[j]);
        }
        expressions[i] = numbers;
      }
      return expressions;
    }
    function interprete(expression) {
      let expressions = removeSpaces(`${expression}`).split(" ");
      expressions = appendSeccondExpression(expressions);
      expressions[4] = (0, month_names_conversion_1.default)(expressions[4]);
      expressions[5] = (0, week_day_names_conversion_1.default)(expressions[5]);
      expressions = (0, asterisk_to_range_conversion_1.default)(expressions);
      expressions = (0, range_conversion_1.default)(expressions);
      expressions = normalizeIntegers(expressions);
      return expressions;
    }
    return interprete;
  })();
  return convertion;
}
var localizedTime = {};
var hasRequiredLocalizedTime;
function requireLocalizedTime() {
  if (hasRequiredLocalizedTime) return localizedTime;
  hasRequiredLocalizedTime = 1;
  Object.defineProperty(localizedTime, "__esModule", { value: true });
  localizedTime.LocalizedTime = void 0;
  class LocalizedTime {
    constructor(date, timezone) {
      __publicField(this, "timestamp");
      __publicField(this, "parts");
      __publicField(this, "timezone");
      this.timestamp = date.getTime();
      this.timezone = timezone;
      this.parts = buildDateParts(date, timezone);
    }
    toDate() {
      return new Date(this.timestamp);
    }
    toISO() {
      const gmt = this.parts.gmt.replace(/^GMT/, "");
      const offset = gmt ? gmt : "Z";
      const pad = (n) => String(n).padStart(2, "0");
      return `${this.parts.year}-${pad(this.parts.month)}-${pad(this.parts.day)}T${pad(this.parts.hour)}:${pad(this.parts.minute)}:${pad(this.parts.second)}.${String(this.parts.milisecond).padStart(3, "0")}` + offset;
    }
    getParts() {
      return this.parts;
    }
    set(field, value) {
      this.parts[field] = value;
      const newDate = new Date(this.toISO());
      this.timestamp = newDate.getTime();
      this.parts = buildDateParts(newDate, this.timezone);
    }
  }
  localizedTime.LocalizedTime = LocalizedTime;
  function buildDateParts(date, timezone) {
    const dftOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false
    };
    if (timezone) {
      dftOptions.timeZone = timezone;
    }
    const dateFormat = new Intl.DateTimeFormat("en-US", dftOptions);
    const parts = dateFormat.formatToParts(date).filter((part) => {
      return part.type !== "literal";
    }).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    return {
      day: parseInt(parts.day),
      month: parseInt(parts.month),
      year: parseInt(parts.year),
      hour: parts.hour === "24" ? 0 : parseInt(parts.hour),
      minute: parseInt(parts.minute),
      second: parseInt(parts.second),
      milisecond: date.getMilliseconds(),
      weekday: parts.weekday,
      gmt: getTimezoneGMT(date, timezone)
    };
  }
  function getTimezoneGMT(date, timezone) {
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
    let offsetInMinutes = (utcDate.getTime() - tzDate.getTime()) / 6e4;
    const sign = offsetInMinutes <= 0 ? "+" : "-";
    offsetInMinutes = Math.abs(offsetInMinutes);
    if (offsetInMinutes === 0)
      return "Z";
    const hours = Math.floor(offsetInMinutes / 60).toString().padStart(2, "0");
    const minutes = Math.floor(offsetInMinutes % 60).toString().padStart(2, "0");
    return `GMT${sign}${hours}:${minutes}`;
  }
  return localizedTime;
}
var matcherWalker = {};
var hasRequiredMatcherWalker;
function requireMatcherWalker() {
  if (hasRequiredMatcherWalker) return matcherWalker;
  hasRequiredMatcherWalker = 1;
  var __importDefault = matcherWalker && matcherWalker.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(matcherWalker, "__esModule", { value: true });
  matcherWalker.MatcherWalker = void 0;
  const convertion_1 = __importDefault(requireConvertion());
  const localized_time_1 = requireLocalizedTime();
  const time_matcher_1 = requireTimeMatcher();
  const week_day_names_conversion_1 = __importDefault(requireWeekDayNamesConversion());
  class MatcherWalker {
    constructor(cronExpression, baseDate, timezone) {
      __publicField(this, "cronExpression");
      __publicField(this, "baseDate");
      __publicField(this, "pattern");
      __publicField(this, "expressions");
      __publicField(this, "timeMatcher");
      __publicField(this, "timezone");
      this.cronExpression = cronExpression;
      this.baseDate = baseDate;
      this.timeMatcher = new time_matcher_1.TimeMatcher(cronExpression, timezone);
      this.timezone = timezone;
      this.expressions = (0, convertion_1.default)(cronExpression);
    }
    isMatching() {
      return this.timeMatcher.match(this.baseDate);
    }
    matchNext() {
      const findNextDateIgnoringWeekday = () => {
        const baseDate = new Date(this.baseDate.getTime());
        baseDate.setMilliseconds(0);
        const localTime = new localized_time_1.LocalizedTime(baseDate, this.timezone);
        const dateParts = localTime.getParts();
        const date2 = new localized_time_1.LocalizedTime(localTime.toDate(), this.timezone);
        const seconds = this.expressions[0];
        const nextSecond = availableValue(seconds, dateParts.second);
        if (nextSecond) {
          date2.set("second", nextSecond);
          if (this.timeMatcher.match(date2.toDate())) {
            return date2;
          }
        }
        date2.set("second", seconds[0]);
        const minutes = this.expressions[1];
        const nextMinute = availableValue(minutes, dateParts.minute);
        if (nextMinute) {
          date2.set("minute", nextMinute);
          if (this.timeMatcher.match(date2.toDate())) {
            return date2;
          }
        }
        date2.set("minute", minutes[0]);
        const hours = this.expressions[2];
        const nextHour = availableValue(hours, dateParts.hour);
        if (nextHour) {
          date2.set("hour", nextHour);
          if (this.timeMatcher.match(date2.toDate())) {
            return date2;
          }
        }
        date2.set("hour", hours[0]);
        const days = this.expressions[3];
        const nextDay = availableValue(days, dateParts.day);
        if (nextDay) {
          date2.set("day", nextDay);
          if (this.timeMatcher.match(date2.toDate())) {
            return date2;
          }
        }
        date2.set("day", days[0]);
        const months = this.expressions[4];
        const nextMonth = availableValue(months, dateParts.month);
        if (nextMonth) {
          date2.set("month", nextMonth);
          if (this.timeMatcher.match(date2.toDate())) {
            return date2;
          }
        }
        date2.set("year", date2.getParts().year + 1);
        date2.set("month", months[0]);
        return date2;
      };
      const date = findNextDateIgnoringWeekday();
      const weekdays = this.expressions[5];
      let currentWeekday = parseInt((0, week_day_names_conversion_1.default)(date.getParts().weekday));
      while (!(weekdays.indexOf(currentWeekday) > -1)) {
        date.set("year", date.getParts().year + 1);
        currentWeekday = parseInt((0, week_day_names_conversion_1.default)(date.getParts().weekday));
      }
      return date;
    }
  }
  matcherWalker.MatcherWalker = MatcherWalker;
  function availableValue(values, currentValue) {
    const availableValues = values.sort((a, b) => a - b).filter((s) => s > currentValue);
    if (availableValues.length > 0)
      return availableValues[0];
    return false;
  }
  return matcherWalker;
}
var hasRequiredTimeMatcher;
function requireTimeMatcher() {
  if (hasRequiredTimeMatcher) return timeMatcher;
  hasRequiredTimeMatcher = 1;
  var __importDefault = timeMatcher && timeMatcher.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(timeMatcher, "__esModule", { value: true });
  timeMatcher.TimeMatcher = void 0;
  const index_1 = __importDefault(requireConvertion());
  const week_day_names_conversion_1 = __importDefault(requireWeekDayNamesConversion());
  const localized_time_1 = requireLocalizedTime();
  const matcher_walker_1 = requireMatcherWalker();
  function matchValue(allowedValues, value) {
    return allowedValues.indexOf(value) !== -1;
  }
  class TimeMatcher {
    constructor(pattern, timezone) {
      __publicField(this, "timezone");
      __publicField(this, "pattern");
      __publicField(this, "expressions");
      this.timezone = timezone;
      this.pattern = pattern;
      this.expressions = (0, index_1.default)(pattern);
    }
    match(date) {
      const localizedTime2 = new localized_time_1.LocalizedTime(date, this.timezone);
      const parts = localizedTime2.getParts();
      const runOnSecond = matchValue(this.expressions[0], parts.second);
      const runOnMinute = matchValue(this.expressions[1], parts.minute);
      const runOnHour = matchValue(this.expressions[2], parts.hour);
      const runOnDay = matchValue(this.expressions[3], parts.day);
      const runOnMonth = matchValue(this.expressions[4], parts.month);
      const runOnWeekDay = matchValue(this.expressions[5], parseInt((0, week_day_names_conversion_1.default)(parts.weekday)));
      return runOnSecond && runOnMinute && runOnHour && runOnDay && runOnMonth && runOnWeekDay;
    }
    getNextMatch(date) {
      const walker = new matcher_walker_1.MatcherWalker(this.pattern, date, this.timezone);
      const next = walker.matchNext();
      return next.toDate();
    }
  }
  timeMatcher.TimeMatcher = TimeMatcher;
  return timeMatcher;
}
var stateMachine = {};
var hasRequiredStateMachine;
function requireStateMachine() {
  if (hasRequiredStateMachine) return stateMachine;
  hasRequiredStateMachine = 1;
  Object.defineProperty(stateMachine, "__esModule", { value: true });
  stateMachine.StateMachine = void 0;
  const allowedTransitions = {
    "stopped": ["stopped", "idle", "destroyed"],
    "idle": ["idle", "running", "stopped", "destroyed"],
    "running": ["running", "idle", "stopped", "destroyed"],
    "destroyed": ["destroyed"]
  };
  class StateMachine {
    constructor(initial = "stopped") {
      __publicField(this, "state");
      this.state = initial;
    }
    changeState(state) {
      if (allowedTransitions[this.state].includes(state)) {
        this.state = state;
      } else {
        throw new Error(`invalid transition from ${this.state} to ${state}`);
      }
    }
  }
  stateMachine.StateMachine = StateMachine;
  return stateMachine;
}
var hasRequiredInlineScheduledTask;
function requireInlineScheduledTask() {
  if (hasRequiredInlineScheduledTask) return inlineScheduledTask;
  hasRequiredInlineScheduledTask = 1;
  var __importDefault = inlineScheduledTask && inlineScheduledTask.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(inlineScheduledTask, "__esModule", { value: true });
  inlineScheduledTask.InlineScheduledTask = void 0;
  const events_1 = __importDefault(require$$0$1);
  const runner_1 = requireRunner();
  const time_matcher_1 = requireTimeMatcher();
  const create_id_1 = requireCreateId();
  const state_machine_1 = requireStateMachine();
  const logger_1 = __importDefault(requireLogger());
  const localized_time_1 = requireLocalizedTime();
  class TaskEmitter extends events_1.default {
  }
  class InlineScheduledTask {
    constructor(cronExpression, taskFn, options) {
      __publicField(this, "emitter");
      __publicField(this, "cronExpression");
      __publicField(this, "timeMatcher");
      __publicField(this, "runner");
      __publicField(this, "id");
      __publicField(this, "name");
      __publicField(this, "stateMachine");
      __publicField(this, "timezone");
      this.emitter = new TaskEmitter();
      this.cronExpression = cronExpression;
      this.id = (0, create_id_1.createID)("task", 12);
      this.name = (options == null ? void 0 : options.name) || this.id;
      this.timezone = options == null ? void 0 : options.timezone;
      this.timeMatcher = new time_matcher_1.TimeMatcher(cronExpression, options == null ? void 0 : options.timezone);
      this.stateMachine = new state_machine_1.StateMachine();
      const runnerOptions = {
        timezone: options == null ? void 0 : options.timezone,
        noOverlap: options == null ? void 0 : options.noOverlap,
        maxExecutions: options == null ? void 0 : options.maxExecutions,
        maxRandomDelay: options == null ? void 0 : options.maxRandomDelay,
        beforeRun: (date, execution) => {
          if (execution.reason === "scheduled") {
            this.changeState("running");
          }
          this.emitter.emit("execution:started", this.createContext(date, execution));
          return true;
        },
        onFinished: (date, execution) => {
          if (execution.reason === "scheduled") {
            this.changeState("idle");
          }
          this.emitter.emit("execution:finished", this.createContext(date, execution));
          return true;
        },
        onError: (date, error, execution) => {
          logger_1.default.error(error);
          this.emitter.emit("execution:failed", this.createContext(date, execution));
          this.changeState("idle");
        },
        onOverlap: (date) => {
          this.emitter.emit("execution:overlap", this.createContext(date));
        },
        onMissedExecution: (date) => {
          this.emitter.emit("execution:missed", this.createContext(date));
        },
        onMaxExecutions: (date) => {
          this.emitter.emit("execution:maxReached", this.createContext(date));
          this.destroy();
        }
      };
      this.runner = new runner_1.Runner(this.timeMatcher, (date, execution) => {
        return taskFn(this.createContext(date, execution));
      }, runnerOptions);
    }
    getNextRun() {
      if (this.stateMachine.state !== "stopped") {
        return this.runner.nextRun();
      }
      return null;
    }
    changeState(state) {
      if (this.runner.isStarted()) {
        this.stateMachine.changeState(state);
      }
    }
    start() {
      if (this.runner.isStopped()) {
        this.runner.start();
        this.stateMachine.changeState("idle");
        this.emitter.emit("task:started", this.createContext(/* @__PURE__ */ new Date()));
      }
    }
    stop() {
      if (this.runner.isStarted()) {
        this.runner.stop();
        this.stateMachine.changeState("stopped");
        this.emitter.emit("task:stopped", this.createContext(/* @__PURE__ */ new Date()));
      }
    }
    getStatus() {
      return this.stateMachine.state;
    }
    destroy() {
      if (this.stateMachine.state === "destroyed")
        return;
      this.stop();
      this.stateMachine.changeState("destroyed");
      this.emitter.emit("task:destroyed", this.createContext(/* @__PURE__ */ new Date()));
    }
    execute() {
      return new Promise((resolve, reject) => {
        const onFail = (context) => {
          var _a;
          this.off("execution:finished", onFail);
          reject((_a = context.execution) == null ? void 0 : _a.error);
        };
        const onFinished = (context) => {
          var _a;
          this.off("execution:failed", onFail);
          resolve((_a = context.execution) == null ? void 0 : _a.result);
        };
        this.once("execution:finished", onFinished);
        this.once("execution:failed", onFail);
        this.runner.execute();
      });
    }
    on(event, fun) {
      this.emitter.on(event, fun);
    }
    off(event, fun) {
      this.emitter.off(event, fun);
    }
    once(event, fun) {
      this.emitter.once(event, fun);
    }
    createContext(executionDate, execution) {
      const localTime = new localized_time_1.LocalizedTime(executionDate, this.timezone);
      const ctx = {
        date: localTime.toDate(),
        dateLocalIso: localTime.toISO(),
        triggeredAt: /* @__PURE__ */ new Date(),
        task: this,
        execution
      };
      return ctx;
    }
  }
  inlineScheduledTask.InlineScheduledTask = InlineScheduledTask;
  return inlineScheduledTask;
}
var taskRegistry = {};
var hasRequiredTaskRegistry;
function requireTaskRegistry() {
  if (hasRequiredTaskRegistry) return taskRegistry;
  hasRequiredTaskRegistry = 1;
  Object.defineProperty(taskRegistry, "__esModule", { value: true });
  taskRegistry.TaskRegistry = void 0;
  const tasks = /* @__PURE__ */ new Map();
  class TaskRegistry {
    add(task) {
      if (this.has(task.id)) {
        throw Error(`task ${task.id} already registred!`);
      }
      tasks.set(task.id, task);
      task.on("task:destroyed", () => {
        this.remove(task);
      });
    }
    get(taskId) {
      return tasks.get(taskId);
    }
    remove(task) {
      if (this.has(task.id)) {
        task == null ? void 0 : task.destroy();
        tasks.delete(task.id);
      }
    }
    all() {
      return tasks;
    }
    has(taskId) {
      return tasks.has(taskId);
    }
    killAll() {
      tasks.forEach((id) => this.remove(id));
    }
  }
  taskRegistry.TaskRegistry = TaskRegistry;
  return taskRegistry;
}
var patternValidation = {};
var hasRequiredPatternValidation;
function requirePatternValidation() {
  if (hasRequiredPatternValidation) return patternValidation;
  hasRequiredPatternValidation = 1;
  var __importDefault = patternValidation && patternValidation.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(patternValidation, "__esModule", { value: true });
  const index_1 = __importDefault(requireConvertion());
  const validationRegex = /^(?:\d+|\*|\*\/\d+)$/;
  function isValidExpression(expression, min, max) {
    const options = expression;
    for (const option of options) {
      const optionAsInt = parseInt(option, 10);
      if (!Number.isNaN(optionAsInt) && (optionAsInt < min || optionAsInt > max) || !validationRegex.test(option))
        return false;
    }
    return true;
  }
  function isInvalidSecond(expression) {
    return !isValidExpression(expression, 0, 59);
  }
  function isInvalidMinute(expression) {
    return !isValidExpression(expression, 0, 59);
  }
  function isInvalidHour(expression) {
    return !isValidExpression(expression, 0, 23);
  }
  function isInvalidDayOfMonth(expression) {
    return !isValidExpression(expression, 1, 31);
  }
  function isInvalidMonth(expression) {
    return !isValidExpression(expression, 1, 12);
  }
  function isInvalidWeekDay(expression) {
    return !isValidExpression(expression, 0, 7);
  }
  function validateFields(patterns, executablePatterns) {
    if (isInvalidSecond(executablePatterns[0]))
      throw new Error(`${patterns[0]} is a invalid expression for second`);
    if (isInvalidMinute(executablePatterns[1]))
      throw new Error(`${patterns[1]} is a invalid expression for minute`);
    if (isInvalidHour(executablePatterns[2]))
      throw new Error(`${patterns[2]} is a invalid expression for hour`);
    if (isInvalidDayOfMonth(executablePatterns[3]))
      throw new Error(`${patterns[3]} is a invalid expression for day of month`);
    if (isInvalidMonth(executablePatterns[4]))
      throw new Error(`${patterns[4]} is a invalid expression for month`);
    if (isInvalidWeekDay(executablePatterns[5]))
      throw new Error(`${patterns[5]} is a invalid expression for week day`);
  }
  function validate(pattern) {
    if (typeof pattern !== "string")
      throw new TypeError("pattern must be a string!");
    const patterns = pattern.split(" ");
    const executablePatterns = (0, index_1.default)(pattern);
    if (patterns.length === 5)
      patterns.unshift("0");
    validateFields(patterns, executablePatterns);
  }
  patternValidation.default = validate;
  return patternValidation;
}
var backgroundScheduledTask = {};
var hasRequiredBackgroundScheduledTask;
function requireBackgroundScheduledTask() {
  if (hasRequiredBackgroundScheduledTask) return backgroundScheduledTask;
  hasRequiredBackgroundScheduledTask = 1;
  var __importDefault = backgroundScheduledTask && backgroundScheduledTask.__importDefault || function(mod) {
    return mod && mod.__esModule ? mod : { "default": mod };
  };
  Object.defineProperty(backgroundScheduledTask, "__esModule", { value: true });
  const path_1 = path;
  const child_process_1 = require$$1;
  const create_id_1 = requireCreateId();
  const stream_1 = require$$3;
  const state_machine_1 = requireStateMachine();
  const localized_time_1 = requireLocalizedTime();
  const logger_1 = __importDefault(requireLogger());
  const time_matcher_1 = requireTimeMatcher();
  const daemonPath = (0, path_1.resolve)(__dirname, "daemon.js");
  class TaskEmitter extends stream_1.EventEmitter {
  }
  class BackgroundScheduledTask {
    constructor(cronExpression, taskPath, options) {
      __publicField(this, "emitter");
      __publicField(this, "id");
      __publicField(this, "name");
      __publicField(this, "cronExpression");
      __publicField(this, "taskPath");
      __publicField(this, "options");
      __publicField(this, "forkProcess");
      __publicField(this, "stateMachine");
      this.cronExpression = cronExpression;
      this.taskPath = taskPath;
      this.options = options;
      this.id = (0, create_id_1.createID)("task");
      this.name = (options == null ? void 0 : options.name) || this.id;
      this.emitter = new TaskEmitter();
      this.stateMachine = new state_machine_1.StateMachine("stopped");
      this.on("task:stopped", () => {
        var _a;
        (_a = this.forkProcess) == null ? void 0 : _a.kill();
        this.forkProcess = void 0;
        this.stateMachine.changeState("stopped");
      });
      this.on("task:destroyed", () => {
        var _a;
        (_a = this.forkProcess) == null ? void 0 : _a.kill();
        this.forkProcess = void 0;
        this.stateMachine.changeState("destroyed");
      });
    }
    getNextRun() {
      var _a;
      if (this.stateMachine.state !== "stopped") {
        const timeMatcher2 = new time_matcher_1.TimeMatcher(this.cronExpression, (_a = this.options) == null ? void 0 : _a.timezone);
        return timeMatcher2.getNextMatch(/* @__PURE__ */ new Date());
      }
      return null;
    }
    start() {
      return new Promise((resolve, reject) => {
        if (this.forkProcess) {
          return resolve(void 0);
        }
        const timeout = setTimeout(() => {
          reject(new Error("Start operation timed out"));
        }, 5e3);
        try {
          this.forkProcess = (0, child_process_1.fork)(daemonPath);
          this.forkProcess.on("error", (err) => {
            clearTimeout(timeout);
            reject(new Error(`Error on daemon: ${err.message}`));
          });
          this.forkProcess.on("exit", (code, signal) => {
            if (code !== 0 && signal !== "SIGTERM") {
              const erro = new Error(`node-cron daemon exited with code ${code || signal}`);
              logger_1.default.error(erro);
              clearTimeout(timeout);
              reject(erro);
            }
          });
          this.forkProcess.on("message", (message) => {
            var _a, _b, _c, _d, _e, _f;
            if (message.jsonError) {
              if ((_a = message.context) == null ? void 0 : _a.execution) {
                message.context.execution.error = deserializeError(message.jsonError);
                delete message.jsonError;
              }
            }
            if ((_c = (_b = message.context) == null ? void 0 : _b.task) == null ? void 0 : _c.state) {
              this.stateMachine.changeState((_e = (_d = message.context) == null ? void 0 : _d.task) == null ? void 0 : _e.state);
            }
            if (message.context) {
              const execution = (_f = message.context) == null ? void 0 : _f.execution;
              execution == null ? true : delete execution.hasError;
              const context = this.createContext(new Date(message.context.date), execution);
              this.emitter.emit(message.event, context);
            }
          });
          this.once("task:started", () => {
            this.stateMachine.changeState("idle");
            clearTimeout(timeout);
            resolve(void 0);
          });
          this.forkProcess.send({
            command: "task:start",
            path: this.taskPath,
            cron: this.cronExpression,
            options: this.options
          });
        } catch (error) {
          reject(error);
        }
      });
    }
    stop() {
      return new Promise((resolve, reject) => {
        if (!this.forkProcess) {
          return resolve(void 0);
        }
        const timeoutId = setTimeout(() => {
          clearTimeout(timeoutId);
          reject(new Error("Stop operation timed out"));
        }, 5e3);
        const cleanupAndResolve = () => {
          clearTimeout(timeoutId);
          this.off("task:stopped", onStopped);
          this.forkProcess = void 0;
          resolve(void 0);
        };
        const onStopped = () => {
          cleanupAndResolve();
        };
        this.once("task:stopped", onStopped);
        this.forkProcess.send({
          command: "task:stop"
        });
      });
    }
    getStatus() {
      return this.stateMachine.state;
    }
    destroy() {
      return new Promise((resolve, reject) => {
        if (!this.forkProcess) {
          return resolve(void 0);
        }
        const timeoutId = setTimeout(() => {
          clearTimeout(timeoutId);
          reject(new Error("Destroy operation timed out"));
        }, 5e3);
        const onDestroy = () => {
          clearTimeout(timeoutId);
          this.off("task:destroyed", onDestroy);
          resolve(void 0);
        };
        this.once("task:destroyed", onDestroy);
        this.forkProcess.send({
          command: "task:destroy"
        });
      });
    }
    execute() {
      return new Promise((resolve, reject) => {
        if (!this.forkProcess) {
          return reject(new Error("Cannot execute background task because it hasn't been started yet. Please initialize the task using the start() method before attempting to execute it."));
        }
        const timeoutId = setTimeout(() => {
          cleanupListeners();
          reject(new Error("Execution timeout exceeded"));
        }, 5e3);
        const cleanupListeners = () => {
          clearTimeout(timeoutId);
          this.off("execution:finished", onFinished);
          this.off("execution:failed", onFail);
        };
        const onFinished = (context) => {
          var _a;
          cleanupListeners();
          resolve((_a = context.execution) == null ? void 0 : _a.result);
        };
        const onFail = (context) => {
          var _a;
          cleanupListeners();
          reject(((_a = context.execution) == null ? void 0 : _a.error) || new Error("Execution failed without specific error"));
        };
        this.once("execution:finished", onFinished);
        this.once("execution:failed", onFail);
        this.forkProcess.send({
          command: "task:execute"
        });
      });
    }
    on(event, fun) {
      this.emitter.on(event, fun);
    }
    off(event, fun) {
      this.emitter.off(event, fun);
    }
    once(event, fun) {
      this.emitter.once(event, fun);
    }
    createContext(executionDate, execution) {
      var _a;
      const localTime = new localized_time_1.LocalizedTime(executionDate, (_a = this.options) == null ? void 0 : _a.timezone);
      const ctx = {
        date: localTime.toDate(),
        dateLocalIso: localTime.toISO(),
        triggeredAt: /* @__PURE__ */ new Date(),
        task: this,
        execution
      };
      return ctx;
    }
  }
  function deserializeError(str) {
    const data = JSON.parse(str);
    const Err = globalThis[data.name] || Error;
    const err = new Err(data.message);
    if (data.stack) {
      err.stack = data.stack;
    }
    Object.keys(data).forEach((key) => {
      if (!["name", "message", "stack"].includes(key)) {
        err[key] = data[key];
      }
    });
    return err;
  }
  backgroundScheduledTask.default = BackgroundScheduledTask;
  return backgroundScheduledTask;
}
var hasRequiredNodeCron;
function requireNodeCron() {
  if (hasRequiredNodeCron) return nodeCron;
  hasRequiredNodeCron = 1;
  (function(exports$1) {
    var __importDefault = nodeCron && nodeCron.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports$1, "__esModule", { value: true });
    exports$1.nodeCron = exports$1.getTask = exports$1.getTasks = void 0;
    exports$1.schedule = schedule;
    exports$1.createTask = createTask;
    exports$1.solvePath = solvePath;
    exports$1.validate = validate;
    const inline_scheduled_task_1 = requireInlineScheduledTask();
    const task_registry_1 = requireTaskRegistry();
    const pattern_validation_1 = __importDefault(requirePatternValidation());
    const background_scheduled_task_1 = __importDefault(requireBackgroundScheduledTask());
    const path_1 = __importDefault(path);
    const url_1 = require$$5;
    const registry = new task_registry_1.TaskRegistry();
    function schedule(expression, func, options) {
      const task = createTask(expression, func, options);
      task.start();
      return task;
    }
    function createTask(expression, func, options) {
      let task;
      if (func instanceof Function) {
        task = new inline_scheduled_task_1.InlineScheduledTask(expression, func, options);
      } else {
        const taskPath = solvePath(func);
        task = new background_scheduled_task_1.default(expression, taskPath, options);
      }
      registry.add(task);
      return task;
    }
    function solvePath(filePath) {
      var _a;
      if (path_1.default.isAbsolute(filePath))
        return (0, url_1.pathToFileURL)(filePath).href;
      if (filePath.startsWith("file://"))
        return filePath;
      const stackLines = (_a = new Error().stack) == null ? void 0 : _a.split("\n");
      if (stackLines) {
        stackLines == null ? void 0 : stackLines.shift();
        const callerLine = stackLines == null ? void 0 : stackLines.find((line) => {
          return line.indexOf(__filename) === -1;
        });
        const match = callerLine == null ? void 0 : callerLine.match(/(file:\/\/)?(((\/?)(\w:))?([/\\].+)):\d+:\d+/);
        if (match) {
          const dir = `${match[5] ?? ""}${path_1.default.dirname(match[6])}`;
          return (0, url_1.pathToFileURL)(path_1.default.resolve(dir, filePath)).href;
        }
      }
      throw new Error(`Could not locate task file ${filePath}`);
    }
    function validate(expression) {
      try {
        (0, pattern_validation_1.default)(expression);
        return true;
      } catch (e) {
        return false;
      }
    }
    exports$1.getTasks = registry.all;
    exports$1.getTask = registry.get;
    exports$1.nodeCron = {
      schedule,
      createTask,
      validate,
      getTasks: exports$1.getTasks,
      getTask: exports$1.getTask
    };
    exports$1.default = exports$1.nodeCron;
  })(nodeCron);
  return nodeCron;
}
var nodeCronExports = requireNodeCron();
const cron = /* @__PURE__ */ getDefaultExportFromCjs(nodeCronExports);
const CHUNK_TOKENS = 512;
const CHUNK_OVERLAP = 128;
const APPROX_CHARS_PER_TOKEN = 4;
const CHUNK_CHARS = CHUNK_TOKENS * APPROX_CHARS_PER_TOKEN;
const OVERLAP_CHARS = CHUNK_OVERLAP * APPROX_CHARS_PER_TOKEN;
const SUPPORTED_EXTS = /* @__PURE__ */ new Set([".md", ".txt", ".pdf"]);
let _kdb = null;
let _knowledgeDir = null;
let _embeddingConfig$1 = null;
let _watcher = null;
let _vecEnabled = false;
function getKnowledgeDb() {
  if (_kdb) return _kdb;
  const BetterSqlite3 = require("better-sqlite3");
  const dbPath = path.join(electron.app.getPath("userData"), "knowledge.db");
  _kdb = new BetterSqlite3(dbPath);
  _kdb.pragma("journal_mode = WAL");
  try {
    const sqliteVec = require("sqlite-vec");
    sqliteVec.load(_kdb);
    _vecEnabled = true;
  } catch {
    console.warn("[knowledge] sqlite-vec not available, vector search disabled");
    _vecEnabled = false;
  }
  _kdb.exec(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path   TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      embedding   BLOB,
      mtime       INTEGER NOT NULL DEFAULT 0,
      UNIQUE(file_path, chunk_index)
    );
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks(file_path);
  `);
  _kdb.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
      content,
      content_rowid='id',
      content='kb_chunks'
    );
  `);
  _kdb.exec(`
    CREATE TRIGGER IF NOT EXISTS kb_fts_ai AFTER INSERT ON kb_chunks BEGIN
      INSERT INTO kb_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS kb_fts_ad AFTER DELETE ON kb_chunks BEGIN
      INSERT INTO kb_fts(kb_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS kb_fts_au AFTER UPDATE ON kb_chunks BEGIN
      INSERT INTO kb_fts(kb_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO kb_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);
  if (_vecEnabled) {
    try {
      _kdb.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS kb_vec USING vec0(
          chunk_id INTEGER PRIMARY KEY,
          embedding float[1536]
        );
      `);
    } catch (e) {
      console.warn("[knowledge] Failed to create vec table:", e);
      _vecEnabled = false;
    }
  }
  return _kdb;
}
async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".txt") {
    return await fs$1.readFile(filePath, "utf-8");
  }
  if (ext === ".pdf") {
    try {
      const pdfParse = require("pdf-parse");
      const buffer = await fs$1.readFile(filePath);
      const data = await (pdfParse.default ?? pdfParse)(buffer);
      return data.text;
    } catch (e) {
      console.warn(`[knowledge] Failed to parse PDF: ${filePath}`, e);
      return "";
    }
  }
  return "";
}
function chunkText$1(text) {
  if (!text.trim()) return [];
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  const chunks = [];
  let buffer = "";
  for (const para of paragraphs) {
    if (buffer.length + para.length > CHUNK_CHARS && buffer.length > 0) {
      chunks.push(buffer.trim());
      buffer = buffer.slice(-OVERLAP_CHARS) + "\n\n" + para;
    } else {
      buffer = buffer ? buffer + "\n\n" + para : para;
    }
  }
  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += CHUNK_CHARS - OVERLAP_CHARS) {
      chunks.push(text.slice(i, i + CHUNK_CHARS).trim());
    }
  }
  return chunks.filter((c) => c.length > 0);
}
async function getEmbedding(texts) {
  if (!_embeddingConfig$1) {
    throw new Error("未配置 embedding 模型");
  }
  const { baseUrl, model, apiKey } = _embeddingConfig$1;
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, input: texts })
  });
  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.data.map((d) => new Float32Array(d.embedding));
}
async function indexFile(filePath) {
  const db = getKnowledgeDb();
  const stat = fs.statSync(filePath);
  const mtime = stat.mtimeMs;
  const existing = db.prepare(
    "SELECT mtime FROM kb_chunks WHERE file_path = ? LIMIT 1"
  ).get(filePath);
  if (existing && existing.mtime >= mtime) {
    return;
  }
  const text = await parseFile(filePath);
  if (!text.trim()) return;
  const chunks = chunkText$1(text);
  db.prepare("DELETE FROM kb_chunks WHERE file_path = ?").run(filePath);
  if (_vecEnabled) {
    db.prepare("DELETE FROM kb_vec WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE file_path = ?)").run(filePath);
  }
  const insertChunk = db.prepare(
    "INSERT INTO kb_chunks (file_path, chunk_index, content, mtime) VALUES (?, ?, ?, ?)"
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertChunk.run(filePath, item.index, item.content, mtime);
    }
  });
  insertMany(chunks.map((content, index) => ({ index, content })));
  if (_embeddingConfig$1 && _vecEnabled) {
    try {
      const embeddings = await getEmbedding(chunks);
      const rows = db.prepare(
        "SELECT id, chunk_index FROM kb_chunks WHERE file_path = ? ORDER BY chunk_index"
      ).all(filePath);
      const insertVec = db.prepare(
        "INSERT OR REPLACE INTO kb_vec (chunk_id, embedding) VALUES (?, ?)"
      );
      const insertVecMany = db.transaction((pairs) => {
        for (const pair of pairs) {
          insertVec.run(pair.id, Buffer.from(pair.embedding.buffer));
        }
      });
      insertVecMany(rows.map((row, i) => ({
        id: row.id,
        embedding: embeddings[i]
      })));
    } catch (e) {
      console.warn(`[knowledge] Embedding failed for ${filePath}:`, e);
    }
  }
}
async function removeFileIndex(filePath) {
  const db = getKnowledgeDb();
  if (_vecEnabled) {
    db.prepare(
      "DELETE FROM kb_vec WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE file_path = ?)"
    ).run(filePath);
  }
  db.prepare("DELETE FROM kb_chunks WHERE file_path = ?").run(filePath);
}
async function buildFullIndex() {
  if (!_knowledgeDir) return;
  const dir = _knowledgeDir;
  if (!fs.existsSync(dir)) {
    await fs$1.mkdir(dir, { recursive: true });
    return;
  }
  const files = await collectFiles(dir);
  for (const file of files) {
    try {
      await indexFile(file);
    } catch (e) {
      console.warn(`[knowledge] Failed to index: ${file}`, e);
    }
  }
}
async function collectFiles(dir) {
  const results = [];
  const entries = await fs$1.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath));
    } else if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}
async function startWatcher() {
  if (_watcher) {
    await _watcher.close();
    _watcher = null;
  }
  if (!_knowledgeDir || !fs.existsSync(_knowledgeDir)) return;
  const chokidar = await Promise.resolve().then(() => require("./index-DqT_5sZV.js"));
  _watcher = chokidar.watch(_knowledgeDir, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 }
  });
  const isSupported = (p) => SUPPORTED_EXTS.has(path.extname(p).toLowerCase());
  _watcher.on("add", (p) => {
    if (isSupported(p)) indexFile(p).catch((e) => console.warn("[knowledge] watch add error:", e));
  });
  _watcher.on("change", (p) => {
    if (isSupported(p)) indexFile(p).catch((e) => console.warn("[knowledge] watch change error:", e));
  });
  _watcher.on("unlink", (p) => {
    if (isSupported(p)) removeFileIndex(p).catch((e) => console.warn("[knowledge] watch unlink error:", e));
  });
}
async function searchKnowledge(query, topK = 5) {
  const db = getKnowledgeDb();
  const ftsResults = db.prepare(`
    SELECT kb_chunks.id, kb_chunks.file_path, kb_chunks.chunk_index, kb_chunks.content,
           bm25(kb_fts) AS score
    FROM kb_fts
    JOIN kb_chunks ON kb_chunks.id = kb_fts.rowid
    WHERE kb_fts MATCH ?
    ORDER BY score ASC
    LIMIT ?
  `).all(query, topK * 2);
  let vecResults = [];
  if (_vecEnabled && _embeddingConfig$1) {
    try {
      const [queryVec] = await getEmbedding([query]);
      vecResults = db.prepare(`
        SELECT chunk_id, distance
        FROM kb_vec
        WHERE embedding MATCH ?
        ORDER BY distance ASC
        LIMIT ?
      `).all(Buffer.from(queryVec.buffer), topK * 2);
    } catch {
    }
  }
  const scoreMap = /* @__PURE__ */ new Map();
  for (const r of ftsResults) {
    scoreMap.set(r.id, {
      filePath: r.file_path,
      chunkIndex: r.chunk_index,
      content: r.content,
      score: -r.score
      // BM25 returns negative scores in FTS5 (lower = better)
    });
  }
  if (vecResults.length > 0) {
    for (const v of vecResults) {
      const existing = scoreMap.get(v.chunk_id);
      if (existing) {
        existing.score += 1 - v.distance;
      } else {
        const chunk = db.prepare(
          "SELECT file_path, chunk_index, content FROM kb_chunks WHERE id = ?"
        ).get(v.chunk_id);
        if (chunk) {
          scoreMap.set(v.chunk_id, {
            filePath: chunk.file_path,
            chunkIndex: chunk.chunk_index,
            content: chunk.content,
            score: 1 - v.distance
          });
        }
      }
    }
  }
  return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score).slice(0, topK);
}
function hasIndex() {
  try {
    const db = getKnowledgeDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM kb_chunks").get();
    return row.cnt > 0;
  } catch {
    return false;
  }
}
function setEmbeddingConfig(config) {
  _embeddingConfig$1 = config;
}
async function setKnowledgeDir(dir) {
  _knowledgeDir = dir;
  if (dir) {
    await buildFullIndex();
    await startWatcher();
  } else if (_watcher) {
    await _watcher.close();
    _watcher = null;
  }
}
function getKnowledgeDir() {
  return _knowledgeDir;
}
async function shutdownKnowledge() {
  if (_watcher) {
    await _watcher.close();
    _watcher = null;
  }
  if (_kdb) {
    _kdb.close();
    _kdb = null;
  }
}
let _db = null;
function getDb() {
  if (_db) return _db;
  const Database = require("better-sqlite3");
  const dbPath = path.join(electron.app.getPath("userData"), "neko.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS local_sessions (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      synced     INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS local_messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES local_sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL DEFAULT '',
      tool_calls  TEXT,
      token_count INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      synced      INTEGER NOT NULL DEFAULT 0
    );
  `);
  return _db;
}
function dbGetSessions(onlyUnsynced = false) {
  const db = getDb();
  const sql = onlyUnsynced ? "SELECT id, title, created_at as createdAt, synced FROM local_sessions WHERE synced = 0 ORDER BY created_at DESC" : "SELECT id, title, created_at as createdAt, synced FROM local_sessions ORDER BY created_at DESC";
  return db.prepare(sql).all();
}
function dbUpsertSession(id, title, createdAt) {
  getDb().prepare(
    "INSERT INTO local_sessions (id, title, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title"
  ).run(id, title, createdAt);
}
function dbGetMessages(sessionId) {
  return getDb().prepare(
    "SELECT id, session_id as sessionId, role, content, tool_calls as toolCalls, token_count as tokenCount, created_at as createdAt, synced FROM local_messages WHERE session_id = ? ORDER BY created_at ASC"
  ).all(sessionId);
}
function dbInsertMessage(msg) {
  getDb().prepare(
    "INSERT OR IGNORE INTO local_messages (id, session_id, role, content, tool_calls, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(msg.id, msg.sessionId, msg.role, msg.content, msg.toolCalls ?? null, msg.tokenCount, msg.createdAt);
}
function dbMarkSynced(sessionId) {
  const db = getDb();
  db.prepare("UPDATE local_sessions SET synced = 1 WHERE id = ?").run(sessionId);
  db.prepare("UPDATE local_messages SET synced = 1 WHERE session_id = ?").run(sessionId);
}
function dbDeleteSession(sessionId) {
  const db = getDb();
  db.prepare("DELETE FROM local_messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM local_sessions WHERE id = ?").run(sessionId);
}
function dbUpdateMessageToolCalls(id, toolCalls) {
  getDb().prepare(
    "UPDATE local_messages SET tool_calls = ? WHERE id = ?"
  ).run(toolCalls, id);
}
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
electron.app.setPath("userData", path.join(os.homedir(), ".nekoclaw"));
electron.app.setName("NekoClaw");
if (process.platform === "win32") {
  electron.app.setAppUserModelId("com.nekoclaw.desktop");
}
let _opLogPath = null;
function getOpLogPath() {
  if (!_opLogPath) _opLogPath = path.join(electron.app.getPath("userData"), "operation-log.jsonl");
  return _opLogPath;
}
async function appendOpLog(entry) {
  try {
    const line = JSON.stringify({ ...entry, ts: (/* @__PURE__ */ new Date()).toISOString() }) + "\n";
    await fs$1.appendFile(getOpLogPath(), line, "utf-8");
  } catch {
  }
}
function getIconPath(format = "png") {
  const appPath = electron.app.isReady() ? electron.app.getAppPath() : path.join(__dirname, "..");
  return path.join(appPath, "build", format === "ico" ? "icon.ico" : "icon.png");
}
function getWindowIconPath() {
  return process.platform === "win32" ? getIconPath("ico") : getIconPath("png");
}
function createWindow() {
  const iconPath = getWindowIconPath();
  const appIcon = electron.nativeImage.createFromPath(iconPath);
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f13",
    titleBarStyle: "hiddenInset",
    frame: false,
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // needed for preload modules
      webSecurity: false
      // allow renderer to fetch external APIs (CORS disabled; contextIsolation still guards node access)
    }
  });
  win.once("ready-to-show", () => {
    win.setIcon(electron.nativeImage.createFromPath(getWindowIconPath()));
    if (process.platform === "win32") {
      win.setAppDetails({
        appId: "com.nekoclaw.desktop",
        appIconPath: getIconPath("ico"),
        appIconIndex: 0
      });
      win.setTitle("NekoClaw");
    }
    win.show();
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  return win;
}
electron.app.whenReady().then(() => {
  electron.app.setName("NekoClaw");
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
const _cronJobs = /* @__PURE__ */ new Map();
const _onceTimers = /* @__PURE__ */ new Map();
function clearScheduledTask(taskId) {
  const job = _cronJobs.get(taskId);
  if (job) {
    job.stop();
    _cronJobs.delete(taskId);
  }
  const timer = _onceTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    _onceTimers.delete(taskId);
  }
}
function fireTask(task) {
  const win = electron.BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send("scheduler:fired", {
      id: task.id,
      title: task.title,
      description: task.description,
      skill_id: task.skill_id
    });
  }
}
function scheduleTask(task) {
  clearScheduledTask(task.id);
  if (!task.is_enabled) return;
  if (task.cron_expr) {
    if (!cron.validate(task.cron_expr)) return;
    const job = cron.schedule(task.cron_expr, () => fireTask(task));
    _cronJobs.set(task.id, job);
  } else if (task.run_at) {
    const delay = new Date(task.run_at).getTime() - Date.now();
    if (delay > 0) {
      const timer = setTimeout(() => {
        _onceTimers.delete(task.id);
        fireTask(task);
      }, delay);
      _onceTimers.set(task.id, timer);
    }
  }
}
electron.ipcMain.handle("scheduler:sync", (_e, tasks) => {
  for (const id of _cronJobs.keys()) clearScheduledTask(id);
  for (const id of _onceTimers.keys()) clearScheduledTask(id);
  for (const task of tasks) scheduleTask(task);
  return { scheduled: tasks.filter((t) => t.is_enabled).length };
});
electron.ipcMain.handle("scheduler:validate-cron", (_e, expr) => {
  return { valid: cron.validate(expr) };
});
electron.ipcMain.handle("file:read", async (_e, filePath) => {
  try {
    const content = await fs$1.readFile(filePath, "utf-8");
    return { content };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("file:write", async (_e, filePath, content) => {
  try {
    await fs$1.mkdir(path.dirname(filePath), { recursive: true });
    await fs$1.writeFile(filePath, content, "utf-8");
    appendOpLog({ type: "file_write", path: filePath });
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("file:list", async (_e, dirPath) => {
  try {
    const entries = await fs$1.readdir(dirPath, { withFileTypes: true });
    return {
      entries: entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        path: path.join(dirPath, e.name)
      }))
    };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("file:delete", async (_e, filePath) => {
  try {
    await fs$1.unlink(filePath);
    appendOpLog({ type: "file_delete", path: filePath });
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("shell:exec", async (_e, command) => {
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const { stdout, stderr } = await execAsync(command, {
      timeout: 3e5,
      cwd: os.homedir()
    });
    appendOpLog({ type: "shell_exec", command, exitCode: 0 });
    return { stdout, stderr };
  } catch (err) {
    appendOpLog({ type: "shell_exec", command, exitCode: err.code ?? 1, error: err.message });
    return { error: err.message, stdout: err.stdout || "", stderr: err.stderr || "" };
  }
});
electron.ipcMain.handle("storage:encrypt", (_e, plaintext) => {
  if (electron.safeStorage.isEncryptionAvailable()) {
    const buf = electron.safeStorage.encryptString(plaintext);
    return { encrypted: buf.toString("base64") };
  }
  return { encrypted: Buffer.from(plaintext).toString("base64") };
});
electron.ipcMain.handle("storage:decrypt", (_e, b64) => {
  if (electron.safeStorage.isEncryptionAvailable()) {
    const buf = Buffer.from(b64, "base64");
    return { decrypted: electron.safeStorage.decryptString(buf) };
  }
  return { decrypted: Buffer.from(b64, "base64").toString("utf-8") };
});
electron.ipcMain.on("window:minimize", () => {
  var _a;
  return (_a = electron.BrowserWindow.getFocusedWindow()) == null ? void 0 : _a.minimize();
});
electron.ipcMain.on("window:maximize", () => {
  const win = electron.BrowserWindow.getFocusedWindow();
  if (win == null ? void 0 : win.isMaximized()) win.unmaximize();
  else win == null ? void 0 : win.maximize();
});
electron.ipcMain.on("window:close", () => {
  var _a;
  return (_a = electron.BrowserWindow.getFocusedWindow()) == null ? void 0 : _a.close();
});
electron.ipcMain.handle("shell:openExternal", async (_e, url) => {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    await electron.shell.openExternal(url);
  }
});
electron.ipcMain.handle("net:webSearch", async (_e, query, maxResults, apiKey) => {
  if (!apiKey) return { error: "Tavily API Key 未配置，请在能力面板中设置" };
  try {
    const res = await electron.net.fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults || 5 })
    });
    const data = await res.json();
    if (!res.ok) return { error: data.detail || `API error: ${res.status}` };
    const results = (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content
    }));
    return { results: JSON.stringify(results) };
  } catch (e) {
    return { error: e.message };
  }
});
electron.ipcMain.handle("net:httpRequest", async (_e, opts) => {
  try {
    const parsed = new URL(opts.url);
    const hostname = parsed.hostname;
    if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname)) {
      return { error: "SSRF: requests to localhost are blocked" };
    }
    const parts = hostname.split(".");
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const first = parseInt(parts[0]);
      if (first === 10 || first === 172 && parseInt(parts[1]) >= 16 && parseInt(parts[1]) <= 31 || first === 192 && parts[1] === "168") {
        return { error: "SSRF: requests to private addresses are blocked" };
      }
    }
  } catch {
    return { error: "Invalid URL" };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    const isBodyMethod = !["GET", "HEAD"].includes(opts.method.toUpperCase());
    const res = await electron.net.fetch(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: isBodyMethod && opts.body ? opts.body : void 0,
      signal: controller.signal
    });
    clearTimeout(timeout);
    const body = await res.text();
    const headers = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status_code: res.status, headers, body: body.slice(0, 1e4) };
  } catch (e) {
    return { error: e.message };
  }
});
electron.ipcMain.handle("app:getDataPath", () => electron.app.getPath("userData"));
electron.ipcMain.handle("log:getPath", () => getOpLogPath());
electron.ipcMain.handle("db:getSessions", (_e, opts = {}) => {
  try {
    return { sessions: dbGetSessions(opts.onlyUnsynced ?? false) };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:upsertSession", (_e, id, title, createdAt) => {
  try {
    dbUpsertSession(id, title, createdAt);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:getMessages", (_e, sessionId) => {
  try {
    return { messages: dbGetMessages(sessionId) };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:insertMessage", (_e, msg) => {
  try {
    dbInsertMessage(msg);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:markSynced", (_e, sessionId) => {
  try {
    dbMarkSynced(sessionId);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:deleteSession", (_e, sessionId) => {
  try {
    dbDeleteSession(sessionId);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:updateMessageToolCalls", (_e, id, toolCalls) => {
  try {
    dbUpdateMessageToolCalls(id, toolCalls);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
const MEMORY_DIR = path.join(electron.app.getPath("userData"), "memory");
function validateMemoryPath(relPath) {
  if (path.isAbsolute(relPath)) throw new Error("Absolute paths not allowed");
  const normalized = path.normalize(relPath);
  if (normalized.startsWith("..") || normalized.includes(`..${path.sep}`)) {
    throw new Error("Path traversal not allowed");
  }
  if (path.extname(normalized) !== ".md" && normalized !== ".") {
    throw new Error("Only .md files are allowed");
  }
  return path.join(MEMORY_DIR, normalized);
}
const MemoryService = {
  async read(relPath) {
    const fullPath = validateMemoryPath(relPath);
    try {
      return await fs$1.readFile(fullPath, "utf-8");
    } catch {
      return "";
    }
  },
  async write(relPath, content) {
    const fullPath = validateMemoryPath(relPath);
    const sanitized = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    await fs$1.mkdir(path.dirname(fullPath), { recursive: true });
    await fs$1.writeFile(fullPath, sanitized, "utf-8");
    appendOpLog({ type: "memory_write", path: relPath });
  },
  async delete(relPath) {
    const fullPath = validateMemoryPath(relPath);
    await fs$1.unlink(fullPath);
    try {
      const db = getDb();
      db.prepare("DELETE FROM memory_embeddings WHERE file_path = ?").run(relPath);
    } catch {
    }
    appendOpLog({ type: "memory_delete", path: relPath });
  },
  async list() {
    const results = [];
    async function walk(dir, prefix) {
      let entries;
      try {
        entries = await fs$1.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(path.join(dir, e.name), rel);
        } else if (e.name.endsWith(".md")) {
          const stat = await fs$1.stat(path.join(dir, e.name));
          results.push({ name: e.name, path: rel, mtime: stat.mtimeMs });
        }
      }
    }
    await walk(MEMORY_DIR, "");
    results.sort((a, b) => {
      if (a.path === "MEMORY.md") return -1;
      if (b.path === "MEMORY.md") return 1;
      return b.mtime - a.mtime;
    });
    return results;
  }
};
let _embeddingConfig = null;
function ensureEmbeddingTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embeddings (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL,
      chunk_idx INTEGER NOT NULL,
      chunk     TEXT NOT NULL,
      vector    TEXT NOT NULL,
      UNIQUE(file_path, chunk_idx)
    );
    CREATE INDEX IF NOT EXISTS idx_emb_file ON memory_embeddings(file_path);
  `);
}
function chunkText(text) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = "";
  for (const p of paragraphs) {
    if (buf.length + p.length > 500 && buf.length > 0) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length > 0 ? chunks : [text.slice(0, 500) || ""];
}
async function getEmbeddings(texts, config) {
  const url = config.baseUrl.replace(/\/$/, "") + "/embeddings";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal: AbortSignal.timeout(3e4)
  });
  if (!res.ok) throw new Error(`Embedding API error ${res.status}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}
async function indexFileEmbeddings(relPath) {
  if (!(_embeddingConfig == null ? void 0 : _embeddingConfig.enabled)) return;
  try {
    const content = await MemoryService.read(relPath);
    if (!content.trim()) return;
    const chunks = chunkText(content);
    const vectors = await getEmbeddings(chunks, _embeddingConfig);
    const db = getDb();
    ensureEmbeddingTable();
    db.prepare("DELETE FROM memory_embeddings WHERE file_path = ?").run(relPath);
    const insert = db.prepare(
      "INSERT INTO memory_embeddings (file_path, chunk_idx, chunk, vector) VALUES (?, ?, ?, ?)"
    );
    const tx = db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        insert.run(relPath, i, chunks[i], JSON.stringify(vectors[i]));
      }
    });
    tx();
  } catch {
  }
}
async function semanticSearch(query, topK = 5) {
  if (!(_embeddingConfig == null ? void 0 : _embeddingConfig.enabled)) throw new Error("Embedding not configured");
  ensureEmbeddingTable();
  const [queryVec] = await getEmbeddings([query], _embeddingConfig);
  const db = getDb();
  const rows = db.prepare("SELECT file_path, chunk, vector FROM memory_embeddings").all();
  const scored = rows.map((r) => ({
    path: r.file_path,
    snippet: r.chunk,
    score: cosineSimilarity(queryVec, JSON.parse(r.vector))
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
async function prebuildEmbeddingIndex() {
  if (!(_embeddingConfig == null ? void 0 : _embeddingConfig.enabled)) return;
  try {
    const files = await MemoryService.list();
    ensureEmbeddingTable();
    const db = getDb();
    const indexed = new Set(
      db.prepare("SELECT DISTINCT file_path FROM memory_embeddings").all().map((r) => r.file_path)
    );
    for (const f of files) {
      if (!indexed.has(f.path)) {
        await indexFileEmbeddings(f.path);
      }
    }
  } catch {
  }
}
electron.ipcMain.handle("memory:setEmbeddingConfig", async (_e, config) => {
  _embeddingConfig = config;
  if (config.enabled) {
    ensureEmbeddingTable();
    prebuildEmbeddingIndex();
  }
  return { success: true };
});
electron.ipcMain.handle("memory:read", async (_e, relPath) => {
  try {
    return { content: await MemoryService.read(relPath) };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:write", async (_e, relPath, content) => {
  try {
    await MemoryService.write(relPath, content);
    indexFileEmbeddings(relPath);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:delete", async (_e, relPath) => {
  try {
    await MemoryService.delete(relPath);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:list", async () => {
  try {
    return { files: await MemoryService.list() };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("memory:search", async (_e, query) => {
  try {
    if (_embeddingConfig == null ? void 0 : _embeddingConfig.enabled) {
      try {
        const results2 = await semanticSearch(query);
        return { results: results2.map((r) => ({ path: r.path, snippet: r.snippet })) };
      } catch {
      }
    }
    const files = await MemoryService.list();
    const results = [];
    const lowerQ = query.toLowerCase();
    for (const f of files) {
      const content = await MemoryService.read(f.path);
      if (!content) continue;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQ)) {
          const start = Math.max(0, i - 1);
          const end = Math.min(lines.length, i + 2);
          results.push({ path: f.path, snippet: lines.slice(start, end).join("\n") });
          break;
        }
      }
    }
    return { results };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("db:readLegacyLocalMemories", async () => {
  try {
    const filePath = path.join(electron.app.getPath("userData"), "neko_local_memories.json");
    try {
      await fs$1.access(filePath);
    } catch {
      return { entries: [] };
    }
    const raw = await fs$1.readFile(filePath, "utf-8");
    const entries = JSON.parse(raw);
    return { entries: Array.isArray(entries) ? entries : [] };
  } catch {
    return { entries: [] };
  }
});
electron.ipcMain.handle("db:deleteLegacyLocalMemories", async () => {
  try {
    const filePath = path.join(electron.app.getPath("userData"), "neko_local_memories.json");
    await fs$1.unlink(filePath);
    return { success: true };
  } catch {
    return { success: true };
  }
});
let _pw = null;
let _browserContext = null;
let _browserPage = null;
function findSystemBrowser() {
  const candidates = [
    // Chrome Windows
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
    // Edge Windows
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(os.homedir(), "AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe"),
    // Chrome macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    // Chrome Linux
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium"
  ];
  const fsSync = require("fs");
  for (const p of candidates) {
    try {
      if (fsSync.existsSync(p)) return p;
    } catch {
    }
  }
  return void 0;
}
async function ensureBrowserPage() {
  if (_browserPage && !_browserPage.isClosed()) return _browserPage;
  if (!_pw) {
    _pw = require("playwright-core");
  }
  const executablePath = findSystemBrowser();
  if (!executablePath) {
    throw new Error("未找到 Chrome 或 Edge 浏览器，请安装后再试。");
  }
  const browser = await _pw.chromium.launch({ headless: false, executablePath });
  _browserContext = await browser.newContext();
  _browserPage = await _browserContext.newPage();
  return _browserPage;
}
electron.ipcMain.handle("browser:navigate", async (_e, url) => {
  try {
    const page = await ensureBrowserPage();
    await page.goto(url, { timeout: 3e4, waitUntil: "domcontentloaded" });
    appendOpLog({ type: "browser_navigate", url });
    return { url: page.url(), title: await page.title() };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("browser:screenshot", async () => {
  try {
    const page = await ensureBrowserPage();
    const buf = await page.screenshot({ type: "png" });
    return { base64: buf.toString("base64") };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("browser:click", async (_e, opts) => {
  try {
    const page = await ensureBrowserPage();
    if (opts.selector) {
      await page.click(opts.selector, { timeout: 1e4 });
    } else if (opts.x !== void 0 && opts.y !== void 0) {
      await page.mouse.click(opts.x, opts.y);
    } else {
      return { error: "需要提供 selector 或 x/y 坐标" };
    }
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("browser:type", async (_e, selector, text) => {
  try {
    const page = await ensureBrowserPage();
    await page.fill(selector, text, { timeout: 1e4 });
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.app.on("before-quit", () => {
  var _a;
  (_a = _browserContext == null ? void 0 : _browserContext.browser()) == null ? void 0 : _a.close().catch(() => {
  });
  shutdownKnowledge().catch(() => {
  });
});
electron.ipcMain.handle("knowledge:hasIndex", () => {
  return { hasIndex: hasIndex() };
});
electron.ipcMain.handle("knowledge:search", async (_e, query, topK) => {
  try {
    const results = await searchKnowledge(query, topK ?? 5);
    return { results };
  } catch (err) {
    return { error: String(err), results: [] };
  }
});
electron.ipcMain.handle("knowledge:setDir", async (_e, dir) => {
  try {
    await setKnowledgeDir(dir);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});
electron.ipcMain.handle("knowledge:getDir", () => {
  return { dir: getKnowledgeDir() };
});
electron.ipcMain.handle("knowledge:setEmbeddingConfig", (_e, config) => {
  setEmbeddingConfig(config);
  return { success: true };
});
//# sourceMappingURL=main.js.map
