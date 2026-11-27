import { ToolFailure } from '../agent/tools'
export type BudgetCaps = { tokens: number; calls: number; outputChars: number; durationMs: number }
export class TaskBudget {
  readonly initial: BudgetCaps
  readonly deadline: number
  private balance: { tokens: number; calls: number; outputChars: number }
  private reserved = 0
  private closed = false
  constructor(caps: BudgetCaps, deadline = Date.now() + caps.durationMs) {
    this.initial = { ...caps }
    this.deadline = Math.min(deadline, Date.now() + caps.durationMs)
    this.balance = { tokens: caps.tokens, calls: caps.calls, outputChars: caps.outputChars }
  }
  remaining() {
    return { ...this.balance, durationMs: Math.max(0, this.deadline - Date.now()) }
  }
  private take(key: keyof typeof this.balance, value: number, code: string) {
    if (this.closed || Date.now() >= this.deadline) throw new ToolFailure('TIME_BUDGET')
    if (!Number.isSafeInteger(value) || value < 0) throw new ToolFailure(code)
    if (value > this.balance[key]) {
      this.balance[key] = 0
      throw new ToolFailure(code)
    }
    this.balance[key] -= value
  }
  tokens(value: number) {
    this.take('tokens', value, 'TOKEN_BUDGET')
  }
  call() {
    this.take('calls', 1, 'CALL_BUDGET')
  }
  output(value: number) {
    this.take('outputChars', value, 'OUTPUT_BUDGET')
  }
  reserve(caps: BudgetCaps) {
    const left = this.remaining()
    if (
      this.reserved >= 2 ||
      caps.tokens > left.tokens ||
      caps.calls > left.calls ||
      caps.outputChars > left.outputChars ||
      caps.durationMs > left.durationMs ||
      Object.values(caps).some((n) => !Number.isSafeInteger(n) || n <= 0)
    )
      throw new ToolFailure('CHILD_BUDGET')
    this.balance.tokens -= caps.tokens
    this.balance.calls -= caps.calls
    this.balance.outputChars -= caps.outputChars
    this.reserved++
    const budget = new TaskBudget(caps, this.deadline)
    let released = false
    return {
      budget,
      release: () => {
        if (released) return
        released = true
        budget.closed = true
        for (const key of ['tokens', 'calls', 'outputChars'] as const)
          this.balance[key] += Math.max(0, budget.balance[key])
      },
    }
  }
}
