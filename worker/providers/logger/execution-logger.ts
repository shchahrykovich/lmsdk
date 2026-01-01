/**
 * Context for prompt execution logging
 */
export interface PromptExecutionContext {
    tenantId: number;
    projectId: number;
    promptId: number;
    version: number;
    rawTraceId?: string;
}

/**
 * Variables used in prompt execution
 */
export interface VariablesLogData {
    variables: Record<string, any>;
}

/**
 * Interface for logging prompt executions
 */
export interface IPromptExecutionLogger {
    /**
     * Set the execution context (tenantId, projectId, promptId, version)
     * This allows subsequent log calls to omit these parameters
     */
    setContext(context: PromptExecutionContext): void;

    /**
     * Log input data (model, messages, settings)
     */
    logInput(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        input: unknown;
    }): Promise<void>;

    /**
     * Log output data (content, usage)
     */
    logOutput(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        output: unknown;
    }): Promise<void>;

    /**
     * Log result data (provider response payload)
     */
    logResult(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        output: unknown;
    }): Promise<void>;

    /**
     * Log final API response payload
     */
    logResponse(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        output: unknown;
    }): Promise<void>;

    /**
     * Log variables used in execution
     */
    logVariables(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        variables: Record<string, any>;
    }): Promise<void>;

    /**
     * Log successful execution completion
     */
    logSuccess(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        durationMs: number;
    }): Promise<void>;

    /**
     * Log failed execution
     */
    logError(params: {
        tenantId?: number;
        projectId?: number;
        promptId?: number;
        version?: number;
        durationMs: number;
        errorMessage: string;
    }): Promise<void>;

    /**
     * Wait for all pending logging operations to complete
     * Use with ctx.waitUntil() to defer persistence operations
     */
    finish(): Promise<void>;
}

