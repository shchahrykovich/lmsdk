export class ProviderTimeoutError extends Error {
  readonly code = "provider_timeout";
  readonly providerName: string;
  readonly timeoutMs: number;

  constructor(providerName: string, timeoutMs: number) {
    super(`${providerName} did not answer within ${timeoutMs / 1000} s`);
    this.name = "ProviderTimeoutError";
    this.providerName = providerName;
    this.timeoutMs = timeoutMs;
  }
}
