/**
 * Command semantics configuration for interpreting exit codes in different contexts.
 *
 * Many commands use exit codes to convey information other than just success/failure.
 * For example, grep returns 1 when no matches are found, which is not an error condition.
 */

import {
  splitCommand_DEPRECATED,
  splitCommandWithOperators,
} from '../../utils/bash/commands.js'

export type CommandSemantic = (
  exitCode: number,
  stdout: string,
  stderr: string,
) => {
  isError: boolean
  message?: string
}

/**
 * Default semantic: treat only 0 as success, everything else as error
 */
const DEFAULT_SEMANTIC: CommandSemantic = (exitCode, _stdout, _stderr) => ({
  isError: exitCode !== 0,
  message:
    exitCode !== 0 ? `Command failed with exit code ${exitCode}` : undefined,
})

/**
 * Command-specific semantics
 */
const COMMAND_SEMANTICS: Map<string, CommandSemantic> = new Map([
  // grep: 0=matches found, 1=no matches, 2+=error
  [
    'grep',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? 'No matches found' : undefined,
    }),
  ],

  // ripgrep has same semantics as grep
  [
    'rg',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? 'No matches found' : undefined,
    }),
  ],

  // find: 0=success, 1=partial success (some dirs inaccessible), 2+=error
  [
    'find',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message:
        exitCode === 1 ? 'Some directories were inaccessible' : undefined,
    }),
  ],

  // diff: 0=no differences, 1=differences found, 2+=error
  [
    'diff',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? 'Files differ' : undefined,
    }),
  ],

  // test/[: 0=condition true, 1=condition false, 2+=error
  [
    'test',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? 'Condition is false' : undefined,
    }),
  ],

  // [ is an alias for test
  [
    '[',
    (exitCode, _stdout, _stderr) => ({
      isError: exitCode >= 2,
      message: exitCode === 1 ? 'Condition is false' : undefined,
    }),
  ],

  // wc, head, tail, cat, etc.: these typically only fail on real errors
  // so we use default semantics
])

/**
 * Get the semantic interpretation for a command
 */
function getCommandSemantic(command: string): CommandSemantic {
  // Extract the base command (first word, handling pipes)
  const baseCommand = heuristicallyExtractBaseCommand(command)
  const semantic = COMMAND_SEMANTICS.get(baseCommand)
  return semantic !== undefined ? semantic : DEFAULT_SEMANTIC
}

/**
 * Extract just the command name (first word) from a single command string.
 */
function extractBaseCommand(command: string): string {
  return command.trim().split(/\s+/)[0] || ''
}

/**
 * Detect a top-level `&&` in the command.
 *
 * Why: `cmd1 && cmd2` only runs cmd2 if cmd1 succeeds. When cmd1 fails, the
 * aggregate exit code is cmd1's, but cmd2 never runs. If we then apply cmd2's
 * per-command semantic (e.g. rg's "exit 1 = no matches"), we misread cmd1's
 * real failure as a benign "no matches" — masking build/test/lint failures
 * from the model.
 *
 * `||`, `;`, and `|` don't have this problem: with `||` the short-circuited
 * case exits 0 (benign either way), and `;`/`|` always run the last segment.
 *
 * Top-level means outside of `(...)`, `$(...)`, or quoted strings.
 * `splitCommandWithOperators` keeps operators as separate tokens; quoted or
 * embedded `&&` stays inside string tokens and won't match. Subshell/command-
 * substitution `&&` is wrapped in `(` / `)` tokens, so we track paren depth
 * to skip those. False positives just fall back to DEFAULT_SEMANTIC (safe).
 */
function hasTopLevelAndAnd(command: string): boolean {
  let tokens: string[]
  try {
    tokens = splitCommandWithOperators(command)
  } catch {
    return false
  }
  let depth = 0
  for (const token of tokens) {
    if (token === '(') {
      depth++
    } else if (token === ')') {
      if (depth > 0) depth--
    } else if (token === '&&' && depth === 0) {
      return true
    }
  }
  return false
}

/**
 * Extract the primary command from a complex command line;
 * May get it super wrong - don't depend on this for security
 */
function heuristicallyExtractBaseCommand(command: string): string {
  // For commands containing a top-level `&&`, the last segment may not have
  // executed. Bail to DEFAULT_SEMANTIC so real failures aren't masked.
  // See hasTopLevelAndAnd for the full rationale.
  if (hasTopLevelAndAnd(command)) {
    return ''
  }

  const segments = splitCommand_DEPRECATED(command)

  // Take the last command as that's what determines the exit code
  const lastCommand = segments[segments.length - 1] || command

  return extractBaseCommand(lastCommand)
}

/**
 * Interpret command result based on semantic rules
 */
export function interpretCommandResult(
  command: string,
  exitCode: number,
  stdout: string,
  stderr: string,
): {
  isError: boolean
  message?: string
} {
  const semantic = getCommandSemantic(command)
  const result = semantic(exitCode, stdout, stderr)

  return {
    isError: result.isError,
    message: result.message,
  }
}
