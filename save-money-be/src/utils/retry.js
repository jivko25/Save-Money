const { GeminiError } = require('./geminiClient');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err) {
  return `${err?.message || ''} ${err?.cause?.message || ''}`;
}

function isFatalAuthError(err) {
  return err instanceof GeminiError && err.statusCode === 503;
}

function isQuotaError(err) {
  return err instanceof GeminiError && err.statusCode === 429;
}

function isTransientGatewayError(err) {
  const msg = errorMessage(err);
  return /<!DOCTYPE|Unexpected token ['"]<|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|socket hang up|network timeout/i.test(
    msg
  );
}

async function retryForever(fn, { quotaWaitMs = 60_000, gatewayWaitMs = 15_000, onWait } = {}) {
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (isFatalAuthError(err)) throw err;
      if (isQuotaError(err)) {
        onWait?.(err, quotaWaitMs, 'quota');
        await sleep(quotaWaitMs);
        continue;
      }
      if (isTransientGatewayError(err)) {
        onWait?.(err, gatewayWaitMs, 'gateway');
        await sleep(gatewayWaitMs);
        continue;
      }
      throw err;
    }
  }
}

module.exports = {
  sleep,
  isFatalAuthError,
  isQuotaError,
  isTransientGatewayError,
  retryForever,
};
