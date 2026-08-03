const MAX_EXPRESSION_LENGTH = 500

class ArithmeticParser {
  private position = 0
  private readonly expression: string

  constructor(expression: string) {
    this.expression = expression
  }

  parse(): number {
    const result = this.parseExpression()
    this.skipWhitespace()
    if (this.position !== this.expression.length) {
      throw new Error(`无法识别位置 ${this.position + 1} 附近的内容`)
    }
    if (!Number.isFinite(result)) throw new Error('计算结果不是有限数值')
    return result
  }

  private parseExpression(): number {
    let result = this.parseTerm()
    while (true) {
      if (this.consume('+')) result += this.parseTerm()
      else if (this.consume('-')) result -= this.parseTerm()
      else return result
    }
  }

  private parseTerm(): number {
    let result = this.parsePower()
    while (true) {
      if (this.consume('*')) result *= this.parsePower()
      else if (this.consume('/')) {
        const divisor = this.parsePower()
        if (divisor === 0) throw new Error('不能除以 0')
        result /= divisor
      } else if (this.consume('%')) {
        const divisor = this.parsePower()
        if (divisor === 0) throw new Error('不能对 0 取余')
        result %= divisor
      } else return result
    }
  }

  private parsePower(): number {
    const base = this.parseUnary()
    return this.consume('^') ? base ** this.parsePower() : base
  }

  private parseUnary(): number {
    if (this.consume('+')) return this.parseUnary()
    if (this.consume('-')) return -this.parseUnary()
    return this.parsePrimary()
  }

  private parsePrimary(): number {
    if (this.consume('(')) {
      const result = this.parseExpression()
      if (!this.consume(')')) throw new Error('缺少右括号')
      return result
    }

    this.skipWhitespace()
    const remaining = this.expression.slice(this.position)
    const match = remaining.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/)
    if (!match) throw new Error(`位置 ${this.position + 1} 需要一个数字或左括号`)
    this.position += match[0].length
    return Number(match[0])
  }

  private consume(token: string): boolean {
    this.skipWhitespace()
    if (!this.expression.startsWith(token, this.position)) return false
    this.position += token.length
    return true
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.expression[this.position] ?? '')) this.position += 1
  }
}

export function calculateExpression(expression: string): number {
  const normalized = expression.trim()
  if (!normalized) throw new Error('expression 不能为空')
  if (normalized.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`expression 不能超过 ${MAX_EXPRESSION_LENGTH} 个字符`)
  }
  return new ArithmeticParser(normalized).parse()
}
