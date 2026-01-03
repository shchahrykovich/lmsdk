import type { File, Reporter, Task, Vitest } from 'vitest'
import { getTests } from '@vitest/runner/utils'

/**
 * Optimized Vitest reporter for AI Assistant
 *
 * Features:
 * - Minimal output during test execution
 * - Shows passed tests as summary count only
 * - Shows first 10 failed tests with details
 * - Reduces context usage significantly
 */
export default class AiReporter implements Reporter {
  private vitest!: Vitest
  private maxFailedTests = 10

  onInit(vitest: Vitest) {
    this.vitest = vitest
  }

  // Suppress all progress output
  onCollected() {}
  onTaskUpdate() {}
  onTestRemoved() {}
  onWatcherStart() {}
  onWatcherRerun() {}
  onUserConsoleLog() {}
  onServerRestart() {}

  async onFinished(files: File[] = [], errors: unknown[] = []) {
    console.log()

    const allTests = files.flatMap(file => getTests(file))
    const passed = allTests.filter(test => test.result?.state === 'pass')
    const failed = allTests.filter(test => test.result?.state === 'fail')
    const skipped = allTests.filter(test => test.mode === 'skip' || test.mode === 'todo')

    // Summary
    console.log(`Tests: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped, ${allTests.length} total`)

    if (passed.length > 0) {
      console.log(`✓ ${passed.length} tests passed`)
    }

    // Show first 10 failed tests with details
    if (failed.length > 0) {
      console.log()
      console.log(`Failed Tests (showing ${Math.min(failed.length, this.maxFailedTests)} of ${failed.length}):`)
      console.log()

      const failedToShow = failed.slice(0, this.maxFailedTests)

      for (const test of failedToShow) {
        const fullName = this.getFullName(test)
        console.log(`✗ ${fullName}`)

        if (test.result?.errors) {
          for (const error of test.result.errors) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            const stack = error instanceof Error ? error.stack : undefined

            console.log(`  ${errorMessage}`)
            if (stack) {
              // Show only first few lines of stack trace
              const stackLines = stack.split('\n').slice(0, 5)
              stackLines.forEach(line => console.log(`  ${line}`))
            }
          }
        }
        console.log()
      }

      if (failed.length > this.maxFailedTests) {
        console.log(`... and ${failed.length - this.maxFailedTests} more failed tests`)
        console.log()
      }
    }

    // Show duration
    const duration = this.vitest.state.getFiles().reduce((acc, file) => {
      return acc + (file.result?.duration || 0)
    }, 0)
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`)

    // Show errors if any
    if (errors.length > 0) {
      console.log()
      console.log('Errors:')
      errors.forEach((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.log(`  ${errorMessage}`)
      })
    }

    console.log()
  }

  /**
   * Get full test name including parent suites
   */
  private getFullName(test: Task): string {
    const names: string[] = []
    let current: Task | undefined = test

    while (current) {
      if (current.name) {
        names.unshift(current.name)
      }
      current = current.suite
    }

    return names.join(' > ')
  }
}
