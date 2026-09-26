import { NullPromptExecutionLogger } from "../../../worker/providers/logger/null-prompt-execution-logger";

export class CapturingLogger extends NullPromptExecutionLogger {
  inputs: unknown[] = [];
  outputs: unknown[] = [];
  results: unknown[] = [];
  variables: Record<string, unknown>[] = [];
  successes: { durationMs: number }[] = [];
  errors: { durationMs: number; errorMessage: string }[] = [];

  async logInput(params: { input: unknown }): Promise<void> {
    this.inputs.push(params.input);
  }

  async logOutput(params: { output: unknown }): Promise<void> {
    this.outputs.push(params.output);
  }

  async logResult(params: { output: unknown }): Promise<void> {
    this.results.push(params.output);
  }

  async logVariables(params: { variables: Record<string, unknown> }): Promise<void> {
    this.variables.push(params.variables);
  }

  async logSuccess(params: { durationMs: number }): Promise<void> {
    this.successes.push(params);
  }

  async logError(params: { durationMs: number; errorMessage: string }): Promise<void> {
    this.errors.push(params);
  }

  allPayloadsAsText(): string {
    return JSON.stringify([this.inputs, this.outputs, this.results, this.variables, this.errors]);
  }
}
