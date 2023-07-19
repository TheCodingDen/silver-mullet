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
  errorPredicate?: (error: unknown) => boolean
}

export async function retryCallback<T> (action: () => T | Promise<T>, { attempts, errorPredicate }: RetryOptions): Promise<RetryResult<T>> {
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
      // Push the error if the predicate fails, and always push if there is none set
      if (errorPredicate) {
        if (!errorPredicate(err)) {
          errors.push(err)
        }
      } else {
        errors.push(err)
      }
    }
    attempt++
  }

  return {
    success: false,
    errors,
    attempted: attempt
  }
}
