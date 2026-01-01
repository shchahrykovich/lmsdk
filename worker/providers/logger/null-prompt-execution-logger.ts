import type {IPromptExecutionLogger} from "./execution-logger";

export class NullPromptExecutionLogger implements IPromptExecutionLogger {
    setContext(): void {
        // No-op
    }

    async logInput(): Promise<void> {
        // No-op
    }

    async logOutput(): Promise<void> {
        // No-op
    }

    async logResult(): Promise<void> {
        // No-op
    }

    async logResponse(): Promise<void> {
        // No-op
    }

    async logVariables(): Promise<void> {
        // No-op
    }

    async logSuccess(): Promise<void> {
        // No-op
    }

    async logError(): Promise<void> {
        // No-op
    }

    async finish(): Promise<void> {
        // No-op
    }
}