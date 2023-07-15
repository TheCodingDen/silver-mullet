interface RetrySuccess<T> {
  success: true
  value: T
  attempted: number
}
interface RetryFail {
  success: false
  errors: unknown[]
  attempted: number
}

export type RetryResult<T> = RetrySuccess<T> | RetryFail

export interface RetryOptions {
  attempts: number
}

export async function retryCallback<T> (action: () => T | Promise<T>, { attempts }: RetryOptions): Promise<RetryResult<T>> {
  const errors = []
  let attempt = 0

  while (attempt !== attempts) {
    try {
      const result = await action()
      return {
        success: true,
        value: result,
        attempted: attempt
      }
    } catch (err) {
      errors.push(err)
    }
    attempt++
  }

  return {
    success: false,
    errors,
    attempted: attempt
  }
}
