import { Code, ConnectError } from '@connectrpc/connect'

/** The error as a ConnectError, whatever was thrown. */
export function asConnectError(e: unknown): ConnectError {
  return ConnectError.from(e)
}

/** True for the etag check failing: the resource changed since it was read. */
export function isConflict(e: unknown): boolean {
  return asConnectError(e).code === Code.Aborted
}

export function isUnauthenticated(e: unknown): boolean {
  return asConnectError(e).code === Code.Unauthenticated
}

/**
 * A message fit for a person. beenfar's messages for expected errors
 * (validation, "already exists", "in use") are meant to be read, so they are
 * kept; the rest get a generic sentence, never a stack or internal detail.
 */
export function describeError(e: unknown): string {
  const err = asConnectError(e)
  switch (err.code) {
    case Code.InvalidArgument:
    case Code.AlreadyExists:
    case Code.NotFound:
    case Code.FailedPrecondition:
      return err.rawMessage
    case Code.Aborted:
      return 'This changed since you opened it. Review the changes and apply yours again.'
    case Code.Unauthenticated:
      return err.rawMessage || 'You are not signed in.'
    case Code.PermissionDenied:
      return 'You are not allowed to do that.'
    case Code.ResourceExhausted:
      return 'Too many attempts. Wait a moment and try again.'
    case Code.Unavailable:
      return 'Cannot reach the controller.'
    case Code.Canceled:
      return 'Cancelled.'
    default:
      return 'Something went wrong on the controller.'
  }
}
