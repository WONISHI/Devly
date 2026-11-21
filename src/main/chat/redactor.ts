// Withhold a trailing key prefix so fragments cannot expose an echoed credential across polls.
export class SecretRedactor {
  private pending = ''
  constructor(private secret: string) {}
  push(delta: string): string {
    let value = this.pending + delta
    this.pending = ''
    if (!this.secret) return value
    value = value.split(this.secret).join('[REDACTED]')
    for (let size = Math.min(this.secret.length - 1, value.length); size > 0; size--) {
      if (value.endsWith(this.secret.slice(0, size))) {
        this.pending = value.slice(-size)
        return value.slice(0, -size)
      }
    }
    return value
  }
  finish(): string {
    const result = this.pending.length >= 6 ? '[REDACTED]' : this.pending
    this.pending = ''
    this.secret = ''
    return result
  }
}
